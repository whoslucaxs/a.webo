<script lang="ts">
  import { onMount } from 'svelte'
  import { appState } from './appState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { toast } from './toastState.svelte'
  import { L } from './translations'
  import { getDataFromKiwiUrl } from './Utils'
  import { toBase64Url } from './crypto/constants'
  import { deriveJoinAuthenticator, encodeInviteFragment, randomInviteCrypto, stripInviteFragment } from './crypto/invite'
  import { sessionRoom as room } from './session/sessionStore.svelte'
  import {
    claimChannel,
    createChannel,
    finishJoin,
    hostStatus,
    joinRoom,
    joinStatus,
    makeChannelLink,
    normalizeRoomServer,
    parseChannelLink,
    releaseChannel,
    roomIceServers,
    sendAnswer,
    sendOffer,
  } from './session/roomServer'

  type SavedChannel = { name: string; link: string }
  const storageKey = 'p2p.kiwi.channels'
  let channels = $state<SavedChannel[]>([])
  let channelName = $state('')
  let starting = $state(false)
  let activeUrl = ''
  let auth = ''
  let hostKey = ''
  let username = ''
  let joinId = ''
  let waiting = false
  let mode: 'host' | 'guest' | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  const pending = new Map<string, { id: string; offer: string }>()
  const valid = $derived(parseChannelLink(appState.channelUrl) !== null)

  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]') as SavedChannel[]
      channels = Array.isArray(stored)
        ? stored.filter((entry) => typeof entry?.name === 'string' && parseChannelLink(entry.link))
        : []
    } catch {
      channels = []
    }
    return () => { if (pollTimer) clearInterval(pollTimer) }
  })

  const saveChannel = (name: string, link: string): void => {
    if (channels.some((entry) => entry.link === link)) return
    channels = [...channels, { name, link }]
    localStorage.setItem(storageKey, JSON.stringify(channels))
  }

  const removeChannel = (link: string): void => {
    channels = channels.filter((entry) => entry.link !== link)
    localStorage.setItem(storageKey, JSON.stringify(channels))
  }

  const reset = (): void => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    const link = parseChannelLink(activeUrl)
    if (link && hostKey) void releaseChannel(link.server, link.roomId, hostKey).catch(() => undefined)
    activeUrl = ''
    auth = ''
    hostKey = ''
    joinId = ''
    waiting = false
    mode = null
    pending.clear()
    appState.roomLink = ''
    appState.navigationEnabled = true
    appState.isHosting = false
    appState.isWatching = false
    appState.isCoordinator = false
    appState.clearSession()
  }

  const enter = async (url: string, initialHostKey = ''): Promise<void> => {
    const link = parseChannelLink(url)
    if (!link) throw new Error(L.invalid_channel_link())
    const channelAuth = toBase64Url(await deriveJoinAuthenticator(link.invite))
    const claim = initialHostKey
      ? { role: 'host' as const, hostKey: initialHostKey }
      : await claimChannel(link.server, link.roomId, channelAuth)
    const key = claim.role === 'host' ? claim.hostKey! : channelAuth
    try {
      const iceServers = await roomIceServers(link.server, link.roomId, key)
      const setup = await room.Setup(claim.role === 'host' ? null : document.createElement('video'), {
        iceServers,
        captureDisplay: false,
        invite: claim.role === 'host' ? link.invite : undefined,
        persistent: true,
      })
      if (setup !== 'ok') throw new Error(L.connection_failed())
      if (claim.role === 'guest') joinId = (await joinRoom(link.server, link.roomId, channelAuth)).joinId
      username = (await window.KiwiApi.getSettings()).username
      activeUrl = url
      auth = channelAuth
      hostKey = claim.role === 'host' ? key : ''
      mode = claim.role
      waiting = claim.role === 'guest'
      appState.roomLink = url
      appState.navigationEnabled = false
      appState.isHosting = claim.role === 'host'
      appState.isWatching = claim.role === 'guest'
      appState.beginSession('channel', reset)
      pollTimer = setInterval(() => void poll(), 1000)
      void poll()
    } catch (error) {
      if (claim.role === 'host') void releaseChannel(link.server, link.roomId, key).catch(() => undefined)
      await room.Disconnect()
      throw error
    }
  }

  const poll = async (): Promise<void> => {
    if (polling || !mode) return
    const link = parseChannelLink(activeUrl)
    if (!link) return
    polling = true
    try {
      if (mode === 'host') {
        const { joins } = await hostStatus(link.server, link.roomId, hostKey)
        for (const join of joins) {
          if (join.status === 'waiting' && !pending.has(join.joinId)) {
            const offer = await room.CreateHostUrl({ username })
            if (offer && room.pendingInviteId) pending.set(join.joinId, { id: room.pendingInviteId, offer: stripInviteFragment(offer) })
          }
          if (join.status === 'waiting' && pending.has(join.joinId))
            await sendOffer(link.server, link.roomId, hostKey, join.joinId, pending.get(join.joinId)!.offer)
          if (join.status === 'answered' && join.answer && pending.has(join.joinId)) {
            const answer = await getDataFromKiwiUrl(join.answer)
            await room.Connect(answer.rtcSessionDescription, { pendingId: pending.get(join.joinId)!.id })
            await finishJoin(link.server, link.roomId, hostKey, join.joinId)
            pending.delete(join.joinId)
          }
        }
      } else if (waiting) {
        const status = await joinStatus(link.server, link.roomId, joinId, auth)
        if (status.status === 'offered' && status.offer) {
          const offer = await getDataFromKiwiUrl(`${status.offer}#${encodeInviteFragment(link.invite)}`)
          await room.Connect(offer.rtcSessionDescription, { invite: offer.invite })
          const answer = await room.CreateParticipantUrl(offer.rtcSessionDescription, { username })
          await sendAnswer(link.server, link.roomId, joinId, stripInviteFragment(answer), auth)
          waiting = false
        } else {
          const claimed = await claimChannel(link.server, link.roomId, auth, joinId)
          if (claimed.role === 'host' && claimed.hostKey) {
            const setup = await room.Setup(null, {
              iceServers: await roomIceServers(link.server, link.roomId, claimed.hostKey),
              captureDisplay: false,
              invite: link.invite,
              persistent: true,
            })
            if (setup !== 'ok') {
              await releaseChannel(link.server, link.roomId, claimed.hostKey)
              await room.Disconnect()
              reset()
              toast.show('error', L.connection_failed())
              return
            }
            joinId = ''
            waiting = false
            hostKey = claimed.hostKey
            mode = 'host'
            appState.isHosting = true
            appState.isWatching = false
          }
        }
      } else if (room.isCoordinator) {
        const claimed = await claimChannel(link.server, link.roomId, auth)
        if (claimed.role === 'host' && claimed.hostKey) {
          hostKey = claimed.hostKey
          mode = 'host'
          appState.isHosting = true
          appState.isWatching = false
        }
      }
    } catch (error) {
      debugLog.error('channel', 'signaling failed', error)
    } finally {
      polling = false
    }
  }

  const create = async (): Promise<void> => {
    if (starting || !channelName.trim()) return
    starting = true
    try {
      const settings = await window.KiwiApi.getSettings()
      const server = normalizeRoomServer(settings.roomServerUrl || '')
      const invite = randomInviteCrypto()
      const channelAuth = toBase64Url(await deriveJoinAuthenticator(invite))
      const created = await createChannel(server, channelAuth)
      const link = makeChannelLink(server, created.roomId, encodeInviteFragment(invite))
      saveChannel(channelName.trim(), link)
      channelName = ''
      await enter(link, created.hostKey)
    } catch (error) {
      debugLog.error('channel', 'could not create channel', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
    } finally {
      starting = false
    }
  }

  const join = async (url = appState.channelUrl): Promise<void> => {
    if (starting) return
    starting = true
    try {
      const link = parseChannelLink(url)
      if (!link) throw new Error(L.invalid_channel_link())
      await enter(url)
      saveChannel(`${L.channel()} ${link.roomId.slice(0, 8)}`, url)
    } catch (error) {
      debugLog.error('channel', 'could not join channel', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
    } finally {
      starting = false
    }
  }
</script>

<div class="home-action">
  <div class="home-action-icon"><i class="fa-solid fa-hashtag"></i></div>
  <h2>{L.permanent_channels()}</h2>
  <div class="flex flex-wrap gap-2">
    <input class="input flex-1 min-w-40" bind:value={channelName} maxlength="48" placeholder={L.channel_name()} />
    <button class="btn btn-primary" disabled={starting || !channelName.trim()} onclick={create}>{L.create_channel()}</button>
  </div>
  <div class="join w-full">
    <input class="input join-item flex-1 min-w-0" bind:value={appState.channelUrl} placeholder={L.channel_link()} />
    <button class="btn btn-primary join-item" disabled={starting || !valid} onclick={() => void join()}>{L.connect()}</button>
  </div>
  {#if channels.length}
    <div class="flex flex-col gap-2">
      {#each channels as channel (channel.link)}
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost flex-1 justify-start truncate" disabled={starting} onclick={() => void join(channel.link)}>{channel.name}</button>
          <button class="btn btn-ghost btn-sm" aria-label={L.copy_my_connection_string()} title={L.copy_my_connection_string()} onclick={() => void navigator.clipboard.writeText(channel.link)}><i class="fa-solid fa-link"></i></button>
          <button class="btn btn-ghost btn-sm" aria-label={L.remove_channel()} title={L.remove_channel()} onclick={() => removeChannel(channel.link)}><i class="fa-solid fa-xmark"></i></button>
        </div>
      {/each}
    </div>
  {/if}
</div>
