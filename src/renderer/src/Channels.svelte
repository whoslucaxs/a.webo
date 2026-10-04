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
    keepJoinAlive,
    leaveJoin,
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
  let channelDescription = $state('')
  let starting = $state(false)
  let activeUrl = ''
  let auth = ''
  let hostKey = ''
  let username = ''
  let joinId = ''
  let waiting = false
  let mode: 'host' | 'guest' | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let leaseTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  const pending = new Map<string, { id: string; offer: string }>()

  $effect(() => {
    if (appState.sessionSource !== 'channel' || !joinId || room.isLive || room.connectionState !== 'failed') return
    toast.show('error', L.connection_failed())
    void room.Disconnect().catch(() => undefined).finally(reset)
  })

  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]') as SavedChannel[]
      channels = Array.isArray(stored)
        ? stored.filter((entry) => typeof entry?.name === 'string' && parseChannelLink(entry.link))
        : []
    } catch {
      channels = []
    }
    return () => { if (pollTimer) clearInterval(pollTimer); if (leaseTimer) clearInterval(leaseTimer) }
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
    if (leaseTimer) clearInterval(leaseTimer)
    leaseTimer = null
    const link = parseChannelLink(activeUrl)
    if (link && joinId) void leaveJoin(link.server, link.roomId, joinId, auth).catch(() => undefined)
    if (link && hostKey) void releaseChannel(link.server, link.roomId, hostKey).catch(() => undefined)
    activeUrl = ''
    auth = ''
    hostKey = ''
    joinId = ''
    waiting = false
    mode = null
    pending.clear()
    appState.roomLink = ''
    appState.sessionTitle = ''
    appState.sessionDescription = ''
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
      if (claim.role === 'guest') {
        joinId = (await joinRoom(link.server, link.roomId, channelAuth)).joinId
        leaseTimer = setInterval(() => void keepJoinAlive(link.server, link.roomId, joinId, channelAuth).catch((error) => debugLog.error('channel', 'join heartbeat failed', error)), 10000)
      }
      username = (await window.KiwiApi.getSettings()).username
      activeUrl = url
      auth = channelAuth
      hostKey = claim.role === 'host' ? key : ''
      mode = claim.role
      waiting = claim.role === 'guest'
      appState.roomLink = url
      appState.sessionTitle = link.name || ''
      appState.sessionDescription = link.description || ''
      appState.navigationEnabled = false
      appState.isHosting = claim.role === 'host'
      appState.isWatching = claim.role === 'guest'
      appState.beginSession('channel', reset)
      pollTimer = setInterval(() => void poll(), 1000)
      void poll()
    } catch (error) {
      if (leaseTimer) clearInterval(leaseTimer)
      leaseTimer = null
      if (joinId) void leaveJoin(link.server, link.roomId, joinId, channelAuth).catch(() => undefined)
      joinId = ''
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
        const activeIds = new Set(joins.map((join) => join.joinId))
        for (const [joinId, invite] of pending) {
          if (activeIds.has(joinId)) continue
          room.dismissPendingInvite(invite.id)
          pending.delete(joinId)
        }
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
            if (leaseTimer) clearInterval(leaseTimer)
            leaseTimer = null
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
          if (leaseTimer) clearInterval(leaseTimer)
          leaseTimer = null
          if (joinId) void leaveJoin(link.server, link.roomId, joinId, auth).catch(() => undefined)
          joinId = ''
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
      const link = makeChannelLink(server, created.roomId, encodeInviteFragment(invite), channelName.trim(), channelDescription.trim())
      saveChannel(channelName.trim(), link)
      channelName = ''
      channelDescription = ''
      await enter(link, created.hostKey)
    } catch (error) {
      debugLog.error('channel', 'could not create channel', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
    } finally {
      starting = false
    }
  }

  export const join = async (url: string): Promise<void> => {
    if (starting) return
    starting = true
    try {
      const link = parseChannelLink(url)
      if (!link) throw new Error(L.invalid_channel_link())
      await enter(url)
      saveChannel(link.name || `${L.channel()} ${link.roomId.slice(0, 8)}`, url)
    } catch (error) {
      debugLog.error('channel', 'could not join channel', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
    } finally {
      starting = false
    }
  }
</script>

<div class="home-action">
  <div class="card-heading">
    <div class="home-action-icon"><i class="fa-solid fa-hashtag"></i></div>
    <div class="card-heading-copy">
      <div class="card-title-line"><h2>{L.permanent_channels()}</h2><span class="card-badge card-badge-purple">{L.persistent()}</span></div>
      <p>{L.permanent_channel_description()}</p>
    </div>
  </div>
  <label class="home-field">
    <span>{L.channel_name()}</span>
    <input class="input w-full" bind:value={channelName} maxlength="48" placeholder={L.channel_name()} />
  </label>
  <label class="home-field">
    <span>{L.description_optional()}</span>
    <input class="input w-full" bind:value={channelDescription} maxlength="160" placeholder={L.description_optional()} />
  </label>
  <div class="home-info"><i class="fa-solid fa-link"></i><span>{L.link_access()}</span></div>
  <button class="home-primary home-primary-purple" disabled={starting || !channelName.trim()} onclick={create}>
    <i class="fa-solid fa-hashtag"></i>{L.create_channel()}
  </button>
  <div id="saved-channels" class="saved-channels">
    <h3>{L.saved_channels()}</h3>
    {#if channels.length}
      {#each channels as channel (channel.link)}
        <div class="saved-channel-row">
          <button class="saved-channel-open" disabled={starting} onclick={() => void join(channel.link)}><i class="fa-solid fa-hashtag"></i><span><strong>{channel.name}</strong>{#if parseChannelLink(channel.link)?.description}<small>{parseChannelLink(channel.link)?.description}</small>{/if}</span></button>
          <button class="saved-channel-tool" aria-label={L.copy_my_connection_string()} title={L.copy_my_connection_string()} onclick={() => void navigator.clipboard.writeText(channel.link)}><i class="fa-solid fa-link"></i></button>
          <button class="saved-channel-tool" aria-label={L.remove_channel()} title={L.remove_channel()} onclick={() => removeChannel(channel.link)}><i class="fa-solid fa-xmark"></i></button>
        </div>
      {/each}
    {:else}
      <p class="saved-empty">{L.no_saved_channels()}</p>
    {/if}
  </div>
</div>
