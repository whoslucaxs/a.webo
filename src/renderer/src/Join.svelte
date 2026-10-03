<script lang="ts">
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { toast } from './toastState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { getDataFromKiwiUrl } from './Utils'
  import { encodeInviteFragment, stripInviteFragment } from './crypto/invite'
  import { sessionRoom as room } from './session/sessionStore.svelte'
  import { iceFailureText } from './session/connectionFailureText'
  import { joinRoom, joinStatus, parseRoomLink, roomIceServers, sendAnswer } from './session/roomServer'

  let connecting = $state(false)
  let waiting = $state(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  let username = ''
  let joinId = ''
  const valid = $derived(parseRoomLink(appState.participantUrl) !== null)

  $effect(() => {
    if (appState.sessionSource !== 'join') return
    if (room.connectionState === 'connected') toast.show('success', L.connection_established())
    if (room.connectionState === 'failed') toast.show('error', iceFailureText(room.connectionFailure))
  })

  const poll = async (): Promise<void> => {
    if (polling || !waiting) return
    polling = true
    try {
      const link = parseRoomLink(appState.participantUrl)
      if (!link) throw new Error('Invalid room link')
      const status = await joinStatus(link.server, link.roomId, joinId)
      if (status.status !== 'offered' || !status.offer) return
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      const fullOffer = link.invite
        ? `${status.offer}#${encodeInviteFragment(link.invite)}`
        : status.offer
      const offer = await getDataFromKiwiUrl(fullOffer)
      await room.Connect(offer.rtcSessionDescription, { invite: offer.invite })
      const answer = await room.CreateParticipantUrl(offer.rtcSessionDescription, { username })
      await sendAnswer(link.server, link.roomId, joinId, stripInviteFragment(answer))
      waiting = false
    } catch (error) {
      debugLog.error('room-server', 'join signaling failed', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      waiting = false
    } finally {
      polling = false
    }
  }

  const onConnectClick = async (): Promise<void> => {
    if (connecting) return
    const link = parseRoomLink(appState.participantUrl)
    if (!link) return
    connecting = true
    try {
      const iceServers = await roomIceServers(link.server, link.roomId)
      username = (await window.KiwiApi.getSettings()).username
      const setup = await room.Setup(document.createElement('video'), { iceServers })
      if (setup !== 'ok') throw new Error(L.connection_failed())
      joinId = (await joinRoom(link.server, link.roomId)).joinId
      waiting = true
      appState.isWatching = true
      appState.navigationEnabled = false
      appState.beginSession('join', reset)
      pollTimer = setInterval(() => void poll(), 1000)
      void poll()
    } catch (error) {
      debugLog.error('room-server', 'could not join room', error)
      toast.show('error', error instanceof Error ? error.message : L.connection_failed())
      await room.Disconnect()
    } finally {
      connecting = false
    }
  }

  const reset = (): void => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    waiting = false
    joinId = ''
    appState.participantUrl = ''
    appState.navigationEnabled = true
    appState.isWatching = false
    appState.isCoordinator = false
    appState.clearSession()
  }

  const onDisconnectClick = async (): Promise<void> => {
    await room.Disconnect()
    reset()
  }
</script>

<div class="home-action">
  <div class="home-action-icon"><i class="fa-solid fa-right-to-bracket"></i></div>
  <h2>{L.join_a_session()}</h2>
  {#if !waiting && !appState.isWatching && !room.sessionEndedReason}
    <div class="join w-full">
      <input
        bind:value={appState.participantUrl}
        class="input join-item flex-1 {valid ? 'input-success' : ''}"
        placeholder={L.host_connection_string()}
        type="text"
      />
      <button class="btn btn-primary join-item" disabled={!valid || connecting} onclick={onConnectClick}>
        {L.connect()}
      </button>
    </div>
  {:else if !room.isLive && !room.sessionEndedReason}
    <p class="mb-4">{L.waiting_for_host()}</p>
    <button class="btn btn-error" onclick={onDisconnectClick}>{L.cancel()}</button>
  {/if}
</div>
