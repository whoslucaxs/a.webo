<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { toast } from './toastState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { getDataFromKiwiUrl } from './Utils'
  import { stripInviteFragment } from './crypto/invite'
  import { sessionRoom as room } from './session/sessionStore.svelte'
  import { iceFailureText } from './session/connectionFailureText'
  import {
    closeRoom,
    createRoom,
    finishJoin,
    hostStatus,
    makeRoomLink,
    normalizeRoomServer,
    roomIceServers,
    sendOffer,
  } from './session/roomServer'

  let sessionStarted = $state(false)
  let startingSession = $state(false)
  let roomLink = $state('')
  let username = ''
  let server = ''
  let roomId = ''
  let hostKey = ''
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  const pending = new Map<string, { id: string; offer: string }>()

  onMount(async () => {
    username = (await window.KiwiApi.getSettings()).username
  })

  $effect(() => {
    if (appState.sessionSource !== 'host') return
    if (room.connectionState === 'connected') toast.show('success', L.connection_established())
    if (room.connectionState === 'failed') toast.show('error', iceFailureText(room.connectionFailure))
  })

  const poll = async (): Promise<void> => {
    if (polling || !sessionStarted) return
    polling = true
    try {
      const { joins } = await hostStatus(server, roomId, hostKey)
      for (const join of joins) {
        if (join.status === 'waiting' && !pending.has(join.joinId)) {
          const offer = await room.CreateHostUrl({ username })
          const pendingId = room.pendingInviteId
          if (!offer || !pendingId) continue
          pending.set(join.joinId, { id: pendingId, offer: stripInviteFragment(offer) })
        }
        if (join.status === 'waiting' && pending.has(join.joinId))
          await sendOffer(server, roomId, hostKey, join.joinId, pending.get(join.joinId)!.offer)
        if (join.status === 'answered' && join.answer && pending.has(join.joinId)) {
          const answer = await getDataFromKiwiUrl(join.answer)
          await room.Connect(answer.rtcSessionDescription, { pendingId: pending.get(join.joinId)!.id })
          await finishJoin(server, roomId, hostKey, join.joinId)
          pending.delete(join.joinId)
        }
      }
    } catch (error) {
      debugLog.error('room-server', 'host signaling failed', error)
    } finally {
      polling = false
    }
  }

  const onStartSessionButtonClick = async (): Promise<void> => {
    if (startingSession) return
    startingSession = true
    try {
      const settings = await window.KiwiApi.getSettings()
      server = normalizeRoomServer(settings.roomServerUrl ?? '')
      const created = await createRoom(server)
      roomId = created.roomId
      hostKey = created.hostKey
      const iceServers = await roomIceServers(server, roomId)
      const setup = await room.Setup(null, { iceServers })
      if (setup !== 'ok') {
        await closeRoom(server, roomId, hostKey)
        if (setup === 'failed') toast.show('error', L.screen_share_failed())
        return
      }
      roomLink = makeRoomLink(server, roomId, room.roomInviteFragment)
      sessionStarted = true
      appState.navigationEnabled = false
      appState.isHosting = true
      appState.isCoordinator = true
      appState.beginSession('host', reset)
      pollTimer = setInterval(() => void poll(), 1000)
      void poll()
    } catch (error) {
      debugLog.error('room-server', 'could not create room', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
      if (roomId && hostKey) void closeRoom(server, roomId, hostKey)
    } finally {
      startingSession = false
    }
  }

  const reset = (): void => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    if (roomId && hostKey) void closeRoom(server, roomId, hostKey).catch(() => undefined)
    roomId = ''
    hostKey = ''
    roomLink = ''
    pending.clear()
    sessionStarted = false
    appState.navigationEnabled = true
    appState.isHosting = false
    appState.isCoordinator = false
    appState.clearSession()
  }

  const onDisconnectClick = async (): Promise<void> => {
    await room.Disconnect()
    reset()
  }
</script>

<div class="container mx-auto p-5">
  <h1 class="text-3xl font-bold mb-4">{!room.isLive ? L.host_a_session() : L.hosting_a_session()}</h1>
  {#if !sessionStarted}
    <button class="btn btn-primary" disabled={startingSession} onclick={onStartSessionButtonClick}>
      {#if startingSession}<span class="loading loading-spinner"></span>{/if}
      {L.start_a_new_session()}
    </button>
  {:else if !room.sessionEndedReason}
    <div class="flex flex-wrap gap-2 mb-4">
      <button class="btn btn-primary" onclick={() => void navigator.clipboard.writeText(roomLink)}>
        <i class="fas fa-copy"></i> {L.copy_my_connection_string()}
      </button>
      <button class="btn btn-error" onclick={onDisconnectClick}>{L.cancel()}</button>
    </div>
    <p class="break-all">{roomLink}</p>
  {/if}
</div>
