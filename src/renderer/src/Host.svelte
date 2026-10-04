<script lang="ts">
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

  let { onPermanentCreate }: { onPermanentCreate: (name: string) => Promise<void> } = $props()

  let sessionStarted = $state(false)
  let startingSession = $state(false)
  let roomName = $state('')
  let durationChoice = $state<'10' | '20' | '30' | '60' | '180' | 'permanent'>('10')
  const durationMinutes = $derived(Number(durationChoice))
  const durationValid = $derived(durationChoice === 'permanent' || Number.isInteger(durationMinutes) && durationMinutes >= 10 && durationMinutes <= 240)
  let username = ''
  let server = ''
  let roomId = ''
  let hostKey = ''
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  const pending = new Map<string, { id: string; offer: string }>()

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
      const activeIds = new Set(joins.map((join) => join.joinId))
      for (const [joinId, invite] of pending) {
        if (activeIds.has(joinId)) continue
        room.dismissPendingInvite(invite.id)
        pending.delete(joinId)
      }
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
    if (startingSession || !durationValid || durationChoice === 'permanent' && !roomName.trim()) return
    startingSession = true
    try {
      if (durationChoice === 'permanent') {
        await onPermanentCreate(roomName.trim())
        return
      }
      const settings = await window.KiwiApi.getSettings()
      username = settings.username
      server = normalizeRoomServer(settings.roomServerUrl ?? '')
      const created = await createRoom(server, durationMinutes)
      roomId = created.roomId
      hostKey = created.hostKey
      const iceServers = await roomIceServers(server, roomId)
      const setup = await room.Setup(null, { iceServers, captureDisplay: false })
      if (setup !== 'ok') {
        await closeRoom(server, roomId, hostKey)
        if (setup === 'failed') toast.show('error', L.connection_failed())
        return
      }
      appState.roomLink = makeRoomLink(server, roomId, room.roomInviteFragment, roomName.trim())
      appState.sessionTitle = roomName.trim()
      appState.sessionDescription = ''
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
    appState.roomLink = ''
    appState.sessionTitle = ''
    appState.sessionDescription = ''
    pending.clear()
    sessionStarted = false
    appState.navigationEnabled = true
    appState.isHosting = false
    appState.isCoordinator = false
    appState.clearSession()
  }

</script>

<div class="create-chat">
  <div class="create-chat-heading">
    <div><h1>{L.create_audio_chat()}</h1><p>{L.create_audio_chat_description()}</p></div>
    <svg class="chat-wave" viewBox="0 0 220 90" fill="none" aria-hidden="true"><path d="M0 49 C26 14 43 85 70 49 S112 -9 142 48 S184 83 220 46" stroke="currentColor" stroke-width="2.5" /></svg>
  </div>
  <label class="chat-name-field">
    <span class="chat-name-icon"><i class="fa-solid fa-microphone"></i></span>
    <span class="chat-name-content"><strong>{L.chat_name()}</strong><input class="input w-full" bind:value={roomName} maxlength="48" placeholder={L.chat_name_placeholder()} /></span>
  </label>
  <div class="create-duration-heading"><span><i class="fa-regular fa-clock"></i>{L.duration()}</span><small>{L.duration_hint()}</small></div>
  <div class="duration-options" role="group" aria-label={L.duration()}>
    <button class:selected={durationChoice === '10'} type="button" onclick={() => durationChoice = '10'}>10 {L.minutes_short()}</button>
    <button class:selected={durationChoice === '20'} type="button" onclick={() => durationChoice = '20'}>20 {L.minutes_short()}</button>
    <button class:selected={durationChoice === '30'} type="button" onclick={() => durationChoice = '30'}>30 {L.minutes_short()}</button>
    <button class:selected={durationChoice === '60'} type="button" onclick={() => durationChoice = '60'}>1 {L.hour_short()}</button>
    <button class:selected={durationChoice === '180'} type="button" onclick={() => durationChoice = '180'}>3 {L.hours_short()}</button>
    <button class:selected={durationChoice === 'permanent'} type="button" onclick={() => durationChoice = 'permanent'}><i class="fa-solid fa-infinity"></i>{L.persistent()}</button>
  </div>
  <p class="duration-note"><i class="fa-solid fa-circle-info"></i>{durationChoice === 'permanent' ? L.link_access() : L.expires_after_duration()}</p>
  {#if !sessionStarted}
    <button class="home-primary" disabled={startingSession || !durationValid || durationChoice === 'permanent' && !roomName.trim()} onclick={onStartSessionButtonClick}>
      {#if startingSession}<span class="loading loading-spinner"></span>{/if}
      <i class="fa-solid fa-play"></i>{L.create_chat()}
    </button>
  {/if}
</div>
