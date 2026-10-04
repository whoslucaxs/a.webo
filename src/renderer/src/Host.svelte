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
  let roomName = $state('')
  let durationChoice = $state<'30' | '60' | '180' | 'custom'>('30')
  let customMinutes = $state(60)
  let maxParticipants = $state(4)
  const durationMinutes = $derived(durationChoice === 'custom' ? Number(customMinutes) : Number(durationChoice))
  const durationValid = $derived(Number.isInteger(durationMinutes) && durationMinutes >= 15 && durationMinutes <= 240)
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
    if (startingSession || !durationValid) return
    startingSession = true
    try {
      const settings = await window.KiwiApi.getSettings()
      server = normalizeRoomServer(settings.roomServerUrl ?? '')
      const created = await createRoom(server, durationMinutes, maxParticipants)
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

<div class="home-action">
  <div class="card-heading">
    <div class="home-action-icon"><i class="fa-solid fa-video"></i></div>
    <div class="card-heading-copy">
      <div class="card-title-line"><h2>{L.temporary_chat()}</h2><span class="card-badge card-badge-blue">{L.ephemeral()}</span></div>
      <p>{L.temporary_chat_description()}</p>
    </div>
  </div>
  <label class="home-field">
    <span>{L.room_name()}</span>
    <input class="input w-full" bind:value={roomName} maxlength="48" placeholder={L.room_name()} />
  </label>
  <div class="room-options">
    <div class="home-field">
      <span>{L.duration()}</span>
      <div class="duration-options" role="group" aria-label={L.duration()}>
        <button class:selected={durationChoice === '30'} type="button" onclick={() => durationChoice = '30'}>30 {L.minutes_short()}</button>
        <button class:selected={durationChoice === '60'} type="button" onclick={() => durationChoice = '60'}>1 {L.hour_short()}</button>
        <button class:selected={durationChoice === '180'} type="button" onclick={() => durationChoice = '180'}>3 {L.hours_short()}</button>
        <button class:selected={durationChoice === 'custom'} type="button" onclick={() => durationChoice = 'custom'}>{L.custom_duration()}</button>
      </div>
      {#if durationChoice === 'custom'}<input class="input w-full" type="number" min="15" max="240" step="1" bind:value={customMinutes} aria-label={L.duration_minutes()} />{/if}
    </div>
    <label class="home-field">
      <span>{L.max_participants()}</span>
      <select class="select w-full" bind:value={maxParticipants}>
        <option value={2}>2</option>
        <option value={3}>3</option>
        <option value={4}>4</option>
      </select>
    </label>
  </div>
  {#if !sessionStarted}
    <button class="home-primary home-primary-blue" disabled={startingSession || !durationValid} onclick={onStartSessionButtonClick}>
      {#if startingSession}<span class="loading loading-spinner"></span>{/if}
      <i class="fa-solid fa-play"></i>{L.start_a_new_session()}
    </button>
  {/if}
  <div class="home-info"><i class="fa-solid fa-link"></i><span>{L.room_link_after_creation()}</span></div>
</div>
