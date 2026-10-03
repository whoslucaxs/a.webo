<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { toast } from './toastState.svelte'
  import {
    ConnectionType,
    getDataFromKiwiUrl,
    makeVideoDraggable,
    mayBeConnectionString
  } from './Utils'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import SessionEndedOverlay from './SessionEndedOverlay.svelte'
  import PresenterVoteModal from './PresenterVoteModal.svelte'
  import type { Room } from './session/room.svelte'
  import { connectThrownText } from './session/connectionFailureText'
  import brokenVideoUrl from '../../assets/broken-video.svg?url'

  let {
    room,
    remoteScreen = $bindable(),
    showInvite = false,
    onReset
  }: {
    room: Room
    remoteScreen?: HTMLVideoElement
    showInvite?: boolean
    onReset: () => void
  } = $props()

  let zoomFactor = $state(1)
  let visualizerIsActive = $state(true)
  let connectionStringIsValid = $state<boolean | null>(null)
  let username = $state('')
  let inviteInFlight = false
  let inviteFormIsVisible = $state(false)

  const presenterShare = $derived(room.screenShares.find((share) =>
    share.peerId === room.presenterId && share.peerId !== room.localPeerId,
  ))
  const otherShares = $derived(room.screenShares.filter((share) => share !== presenterShare))
  const showVideo = $derived(Boolean(presenterShare))
  const videoClass = $derived(room.sessionEndedReason ? 'video video-ended' : 'video')
  const showBrokenVideo = $derived(!room.remoteScreenActive)
  const attachScreen = (video: HTMLVideoElement, stream: MediaStream) => {
    video.srcObject = stream
    void video.play().catch(() => undefined)
    return {
      update(next: MediaStream) {
        if (video.srcObject !== next) video.srcObject = next
        void video.play().catch(() => undefined)
      },
      destroy() { video.srcObject = null },
    }
  }
  let videoStage: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (remoteScreen) {
      room.setRemoteVideo(remoteScreen)
      makeVideoDraggable(remoteScreen)
    }
  })

  $effect(() => {
    if (room.isLive && remoteScreen?.srcObject) {
      void remoteScreen.play?.().catch(() => undefined)
    }
  })

  $effect(() => {
    const value = appState.hostUrl
    if (!showInvite || value === '') {
      connectionStringIsValid = null
      return
    }
    connectionStringIsValid = mayBeConnectionString(ConnectionType.PARTICIPANT, value)
  })

  $effect(() => {
    const kind = room.voteRejectedKind
    if (!kind) return
    room.clearVoteRejected()
    toast.show('info', kind === 'kick' ? L.vote_remove_rejected() : L.vote_rejected())
  })

  onMount(async () => {
    const settings = await window.KiwiApi.getSettings()
    username = settings.username
  })

  const onMicrophoneToggle = (): void => {
    room.ToggleMicrophone()
  }

  const onCameraToggle = async (): Promise<void> => {
    await room.ToggleCamera()
    void window.KiwiApi.toggleCallOverlay(true)
  }

  const onChatClick = (): void => {
    void window.KiwiApi.toggleCallOverlay(true)
  }

  const onDisplayStreamToggle = (): void => {
    room.ToggleDisplayStream()
  }

  const leaveFullscreen = async (): Promise<void> => {
    if (!document.fullscreenElement) return
    await document.exitFullscreen().catch(() => undefined)
  }

  const onLeaveClick = async (): Promise<void> => {
    await leaveFullscreen()
    try {
      await room.leave()
    } catch (error) {
      console.error(error)
    }
    onReset()
  }

  const onEndSessionClick = async (): Promise<void> => {
    await leaveFullscreen()
    try {
      await room.endSession()
    } catch (error) {
      console.error(error)
    }
    onReset()
  }

  const onRequestKick = async (peerId: string): Promise<void> => {
    const result = await room.requestKick(peerId)
    if (result === 'cooldown') toast.show('info', L.vote_remove_cooldown())
    if (result === 'blocked') toast.show('info', L.vote_remove_rejected())
  }

  const onChangeScreen = async (): Promise<void> => {
    const result = await room.changeScreen()
    if (result === 'failed') toast.show('error', L.screen_share_failed())
  }

  let inviteAnotherButton: HTMLButtonElement | undefined = $state()
  let inviteAnotherTextLoading = $state('')

  const onCopyInvite = async (): Promise<void> => {
    if (inviteInFlight) return
    if ((appState.sessionSource === 'host' || appState.sessionSource === 'channel') && appState.roomLink) {
      await navigator.clipboard.writeText(appState.roomLink)
      toast.show('success', L.copy_my_connection_string())
      return
    }
    inviteInFlight = true
    if (inviteAnotherButton) inviteAnotherButton.disabled = true
    inviteAnotherTextLoading = 'generating...'
    try {
      const offer = await room.CreateHostUrl({ username })
      if (!offer) {
        toast.show('error', L.room_is_full())
      } else {
        toast.show('success', 'Invite copied to clipboard')
        void navigator.clipboard.writeText(offer)
        inviteFormIsVisible = true
      }
    } catch (error) {
      console.error(error)
      toast.show('error', L.connection_failed())
    } finally {
      inviteInFlight = false
      if (inviteAnotherButton) inviteAnotherButton.disabled = false
      inviteAnotherTextLoading = ''
    }
  }

  const onConnectInvite = async (): Promise<void> => {
    try {
      const data = await getDataFromKiwiUrl(appState.hostUrl)
      await room.Connect(data.rtcSessionDescription, { invite: data.invite })
      appState.hostUrl = ''
    } catch (error) {
      console.error(error)
      toast.show('error', connectThrownText(error))
    }
  }

  const onFullscreenClick = async (): Promise<void> => {
    if (!videoStage) return
    if (document.fullscreenElement === videoStage) {
      await document.exitFullscreen()
      return
    }
    await videoStage.requestFullscreen()
  }

  const onExitFullscreenClick = (e: MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    void document.exitFullscreen()
  }

  const onZoomInClick = (): void => {
    if (!remoteScreen) return
    zoomFactor += 0.1
    remoteScreen.style.scale = zoomFactor.toString()
  }

  const onZoomOutClick = (): void => {
    if (!remoteScreen) return
    if (zoomFactor <= 1) return
    zoomFactor -= 0.1
    remoteScreen.style.scale = zoomFactor.toString()
  }

  const connectionInputClass = $derived(
    connectionStringIsValid === null ? '' : connectionStringIsValid ? 'input-success' : 'input-error'
  )
  const connectButtonClass = $derived(
    connectionStringIsValid === null
      ? 'btn-primary'
      : connectionStringIsValid
        ? 'btn-success'
        : 'btn-error'
  )
</script>

<div class="call-shell" data-theme="business">
<header class="call-header">
  <div>
    <span class="call-kicker">p2p.kiwi</span>
    <h1>{appState.sessionTitle || (appState.isHosting ? L.hosting_a_session() : L.joined_a_session())}</h1>
    {#if appState.sessionDescription}<p class="call-description">{appState.sessionDescription}</p>{/if}
  </div>
  <span class="call-count" title={L.peer_list()}><i class="fa-solid fa-user-group"></i> {room.peers.length}</span>
</header>
<div class="call-controls">
  <div class="flex gap-2 flex-wrap">
      <button
        title={room.displayStreamActive ? L.streaming_your_display() : L.share_your_screen()}
        aria-label={room.displayStreamActive ? L.streaming_your_display() : L.share_your_screen()}
        class="btn {room.displayStreamActive ? 'btn-success' : 'btn-error'}"
        onclick={() => room.displayStreamActive ? onDisplayStreamToggle() : onChangeScreen()}
      >
        <span class="icon">
          <i class="fa-solid fa-display"></i>
        </span>
      </button>
      {#if room.displayStreamActive}
        <button class="btn btn-info" onclick={onChangeScreen}>
          <span class="icon">
            <i class="fa-solid fa-display"></i>
          </span>
          <span>{L.change_screen()}</span>
        </button>
      {/if}
    {#if room.hasAudioInput}
      <button
        aria-label={room.microphoneActive ? L.microphone_active() : L.microphone_inactive()}
        title={room.microphoneActive ? L.microphone_active() : L.microphone_inactive()}
        class="btn {room.microphoneActive ? 'btn-success' : 'btn-error'}"
        onclick={onMicrophoneToggle}
      >
        <span class="icon mic-btn-icon">
          {#if room.microphoneActive}
            <AudioVisualizer
              className={visualizerIsActive ? '' : 'hidden'}
              bind:visualizerIsActive
              stream={room.GetAudioStream()}
            />
            <i class="fas fa-microphone {visualizerIsActive ? 'hidden' : ''}"></i>
          {:else}
            <i class="fas fa-microphone-slash"></i>
          {/if}
        </span>
      </button>
    {/if}
    <button
      aria-label={room.cameraActive ? L.camera_on() : L.camera_off()}
      title={room.cameraActive ? L.camera_on() : L.camera_off()}
      class="btn {room.cameraActive ? 'btn-success' : 'btn-error'}"
      onclick={onCameraToggle}
    >
      <span class="icon">
        <i class="fa-solid {room.cameraActive ? 'fa-video' : 'fa-video-slash'}"></i>
      </span>
    </button>
    <button class="btn btn-info" onclick={onChatClick}>
      <span class="icon">
        <i class="fa-solid fa-comment"></i>
      </span>
      <span>{L.chat()}</span>
    </button>
    {#if showInvite && (room.isCoordinator || appState.sessionSource === 'channel')}
      <div class="flex flex-wrap gap-2 mb-4">
        <div class="join w-full mb-4">
          <span class="tooltip tooltip-top {inviteFormIsVisible ? 'hidden' : ''}" data-tip={inviteAnotherTextLoading === '' ? L.invite_another() : inviteAnotherTextLoading}>
            <button class="btn btn-primary" bind:this={inviteAnotherButton} aria-label={inviteAnotherTextLoading === '' ? L.invite_another() : inviteAnotherTextLoading} onclick={onCopyInvite}>
              <span class="icon">
                <i class="fa-solid fa-user-plus"></i>
              </span>
              {inviteAnotherTextLoading}
            </button>
          </span>
          <span class="tooltip tooltip-top" data-tip={L.cancel()}>
            <button
              class="btn join-item btn-error not-hover:btn-soft {inviteFormIsVisible ? '' : 'hidden'}"
              aria-label={L.cancel()}
              onclick={() => {
                inviteFormIsVisible = false
              }}
            >
              <span class="fa-solid fa-user"></span>
              <span class="fa-solid fa-ban"></span>
            </button>
          </span>
          <span class="flex-1 {inviteFormIsVisible ? '' : 'hidden'}">
            <span class="tooltip tooltip-top" data-tip={L.participant_connection_string()}>
              <input
                class="input join-item flex-3 max-w-24 {connectionInputClass}"
                bind:value={appState.hostUrl}
                type="text"
              />
            </span>
            <span class="tooltip tooltip-top" data-tip={L.connect()}>
              <button
                class="btn join-item {connectButtonClass}"
                aria-label={L.connect()}
                onclick={onConnectInvite}
                disabled={!connectionStringIsValid}
              >
                <span class="fa-solid fa-plug"></span>
              </button>
            </span>
          </span>
        </div>
      </div>
    {/if}
  </div>
  <div class="flex gap-2">
    <button class="btn btn-error" onclick={onLeaveClick}>
      <span class="icon">
        <i class="fas fa-unlink"></i>
      </span>
      <span>{L.leave()}</span>
    </button>
    {#if room.isCoordinator && appState.sessionSource !== 'channel'}
      <button class="btn btn-error" onclick={onEndSessionClick}>
        <span>{L.end_session()}</span>
      </button>
    {/if}
  </div>
</div>

<div class="call-content">
<aside class="call-sidebar">

{#if room.presenterGone && !room.isPresenter && !room.sessionEndedReason}
  <div class="alert alert-warning mb-4">{L.presenter_left()}</div>
{/if}

{#if room.identityChanged}
  <div class="alert alert-warning mb-4">{L.identity_changed()}</div>
{/if}

<div class="mb-4">
  <h2 class="font-semibold mb-2">{L.e2ee_status()}</h2>
  {#if room.e2eeActive && room.mediaE2eeActive}
    {#if room.verification}
      <details class="collapse" name="e2ee-verification">
        <summary class="badge badge-success cursor-pointer pointer-none">
          {L.e2ee_on()}
          <span class="ml-1 text-success-content fa-solid fa-lock"></span>
        </summary>
        <div class="collapse-content mt-2 text-sm">
          <p><span class="font-semibold">{L.verification_code()}:</span> {room.verification.securityCode}</p>
          <p class="opacity-70">{L.verification()}</p>
          <div class="overflow-x-auto rounded-box border border-base-content/5 bg-base-100 max-w-fit">
            <table class="table max-w-fit">
              <thead>
                <tr>
                  <th>Peer ID</th>
                  <th>Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {#each room.verification.members as member (member.peerId)}
                  <tr>
                    <td>
                      {member.peerId.slice(0, 8)}
                      {member.peerId === room.localPeerId ? `(${L.you()})` : ''}
                    </td>
                    <td class="uppercase">{member.fingerprint}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    {/if}
  {:else if room.e2eeActive}
    <p class="badge badge-error">
      {L.e2ee_app_only()}
      <span class="ml-1 text-error-content fa-solid fa-triangle-exclamation"></span>
    </p>
  {:else}
    <p class="badge badge-warning">
      {L.e2ee_off()}
      <span class="ml-1 text-warning-content fa-solid fa-lock-open"></span>
    </p>
  {/if}
  {#if room.e2eeError}
    <p class="badge badge-warning">
      {L.e2ee_off()}
      <span class="ml-1 text-warning-content fa-solid fa-lock-open"></span>
    </p>
    <p class="text-error text-sm mt-1">
      {room.e2eeError}
    </p>
  {/if}
</div>

<div class="mb-4">
  <h2 class="font-semibold mb-2">{L.peer_list()}</h2>
  <div class="member-list">
    {#each room.peers as peer (peer.id)}
      <div class="member-row">
        {#if peer.avatar}
          <img class="member-avatar" src={peer.avatar} alt="" />
        {:else}
          <span class="member-avatar" style:background={peer.backgroundColor} style:color={peer.foregroundColor}>
            {peer.username.trim().charAt(0).toUpperCase() || '?'}
          </span>
        {/if}
        <span class="member-name" title={peer.username}>
          {peer.username}{peer.id === room.localPeerId ? ` (${L.you()})` : ''}
          {#if peer.id === room.coordinatorId}<i class="fa-solid fa-crown" title={L.coordinator()}></i>{/if}
          {#if peer.id === room.presenterId}<i class="fa-solid fa-display" title={L.presenter()}></i>{/if}
        </span>
        {#if peer.id !== room.localPeerId}
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            title={L.remove_from_session()}
            aria-label={L.remove_from_session()}
            disabled={Boolean(room.activeVote) || !room.canRequestKick(peer.id)}
            onclick={() => onRequestKick(peer.id)}
          ><i class="fa-solid fa-user-minus"></i></button>
        {/if}
      </div>
    {/each}
  </div>
</div>

  </aside>
  <main class="call-stage">
{#if (appState.sessionSource === 'host' || appState.sessionSource === 'channel') && !room.isLive && appState.roomLink}
  <div class="room-invite">
    <div>
      <strong>{L.session_started()}</strong>
      <p>{L.copy_my_connection_string()}</p>
    </div>
    <div class="room-invite-actions">
      <input class="input" value={appState.roomLink} aria-label={L.host_connection_string()} readonly />
      <button class="btn btn-primary" onclick={onCopyInvite}>
        <i class="fa-solid fa-copy"></i> {L.copy_my_connection_string()}
      </button>
    </div>
  </div>
{/if}
<div class="screen-grid">
<div class={showVideo ? 'relative' : 'hidden'}>
  <fieldset class="fieldset px-0">
    <legend class="fieldset-legend">{presenterShare?.name ?? L.remote_screen()}</legend>
    <div bind:this={videoStage} class="video-overflow video-stage relative">
      {#if showBrokenVideo}
        <div class="broken-video" aria-hidden="true">
          <img src={brokenVideoUrl} alt="" />
        </div>
      {/if}
      <video
        bind:this={remoteScreen}
        id="remote_screen"
        class="{videoClass} {showBrokenVideo ? 'video-off' : ''}"
        autoplay
        playsinline
        muted
        disablepictureinpicture
      ></video>
      <button
        type="button"
        class="exit-fullscreen-btn btn btn-neutral btn-sm"
        title={L.exit_fullscreen()}
        aria-label={L.exit_fullscreen()}
        onpointerdown={(e) => e.stopPropagation()}
        onpointerup={(e) => e.stopPropagation()}
        onclick={onExitFullscreenClick}
      >
        <span class="icon">
          <i class="fa-solid fa-compress"></i>
        </span>
      </button>
    </div>
  </fieldset>
  <div class="flex gap-2 pb-5">
    <button class="btn btn-info" onclick={onZoomInClick}>
      <span class="icon">
        <i class="fas fa-search-plus"></i>
      </span>
      <span>{L.zoom_in()}</span>
    </button>
    <button class="btn btn-info" onclick={onZoomOutClick}>
      <span class="icon">
        <i class="fas fa-search-minus"></i>
      </span>
      <span>{L.zoom_out()}</span>
    </button>
    <button class="btn btn-info" onclick={onFullscreenClick}>
      <span class="icon">
        <i class="fas fa-expand"></i>
      </span>
      <span>{L.fullscreen()}</span>
    </button>
  </div>
</div>
{#each otherShares as share (share.peerId)}
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend">{share.name}</legend>
    <video
      class="video rounded-lg bg-black"
      use:attachScreen={share.stream}
      autoplay
      playsinline
      muted
      disablepictureinpicture
    ></video>
  </fieldset>
{/each}
</div>
{#if room.screenShares.length === 0}
  <div class="call-empty">
    <i class="fa-solid fa-display"></i>
    <p>{L.not_streaming_your_display()}</p>
    <button class="btn btn-primary" onclick={onChangeScreen}>{L.share_your_screen()}</button>
  </div>
{/if}
  </main>
</div>

<SessionEndedOverlay
  reason={room.sessionEndedReason}
  onDismiss={() => {
    room.dismissSessionEnded()
    onReset()
  }}
/>

<PresenterVoteModal {room} />
</div>

<style>
  .call-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #313338;
    color: #f2f3f5;
  }
  .call-header {
    min-height: 4.5rem;
    padding: 0.9rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    background: #313338;
    border-bottom: 1px solid #222327;
  }
  .call-header h1 {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .call-description { color: #b5bac1; font-size: 0.76rem; }
  .call-kicker {
    color: #b5bac1;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .call-count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #b5bac1;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .call-content {
    order: 2;
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(13rem, 15rem) minmax(0, 1fr);
  }
  .call-sidebar {
    padding: 1.25rem 1rem;
    background: #2b2d31;
    border-right: 1px solid #222327;
  }
  .member-list { display: flex; flex-direction: column; gap: 0.25rem; }
  .member-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem;
    border-radius: 0.6rem;
  }
  .member-row:hover { background: #35373c; }
  .member-avatar {
    width: 2rem;
    height: 2rem;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 700;
    object-fit: cover;
  }
  .member-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.8rem;
  }
  .member-name i { margin-left: 0.25rem; color: #b5bac1; }
  .call-stage {
    min-width: 0;
    padding: clamp(1rem, 2.5vw, 2rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .room-invite {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 42rem;
    width: 100%;
    margin: 0 auto 1.25rem;
    padding: 1rem;
    border: 1px solid #5865f2;
    border-radius: 1rem;
    background: #2b2d31;
  }
  .room-invite p { color: #b5bac1; font-size: 0.8rem; }
  .room-invite-actions { display: flex; gap: 0.5rem; min-width: 0; }
  .room-invite-actions input { flex: 1; min-width: 0; }
  .call-controls {
    order: 3;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
    padding: 0.85rem 1rem;
    background: #232428;
    border-top: 1px solid #17181b;
  }
  .call-controls :global(.btn) {
    min-height: 2.75rem;
    border-radius: 0.9rem;
  }
  .call-controls :global(.mb-4) {
    margin-bottom: 0;
  }
  .call-empty {
    min-height: min(55vh, 24rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: #b5bac1;
    text-align: center;
    background: #25262b;
    border: 1px solid #41434a;
    border-radius: 1.25rem;
  }
  .call-empty > i { font-size: 3rem; }
  .screen-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));
    gap: 1rem;
    align-items: start;
  }
  .screen-grid fieldset {
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid #41434a;
    border-radius: 1rem;
    background: #25262b;
  }
  .screen-grid :global(.fieldset-legend) { color: #dbdee1; }
  .video {
    width: 100%;
    height: auto;
    transition:
      transform 0.5s linear,
      filter 0.3s ease,
      opacity 0.3s ease;
  }
  .video-ended {
    opacity: 0.5;
    filter: grayscale(1) saturate(0.5);
  }
  .video-off {
    display: none;
  }
  .broken-video {
    width: 100%;
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-base-200);
  }
  .broken-video img {
    width: min(34%, 11rem);
    height: auto;
  }
  @media (prefers-color-scheme: dark) {
    .broken-video img {
      filter: invert(1);
      opacity: 0.8;
    }
  }
  .video-overflow {
    width: 100%;
    height: auto;
    overflow: hidden;
  }
  .exit-fullscreen-btn {
    display: none;
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 30;
    pointer-events: auto;
  }
  .video-stage:fullscreen,
  .video-stage:-webkit-full-screen {
    width: 100%;
    height: 100%;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .video-stage:fullscreen .video,
  .video-stage:-webkit-full-screen .video {
    width: 100%;
    height: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .video-stage:fullscreen .broken-video,
  .video-stage:-webkit-full-screen .broken-video {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
  }
  .video-stage:fullscreen .exit-fullscreen-btn,
  .video-stage:-webkit-full-screen .exit-fullscreen-btn {
    display: inline-flex;
  }
  .mic-btn-icon {
    width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  @media (max-width: 760px) {
    .call-content { grid-template-columns: 1fr; }
    .call-sidebar { border-right: 0; border-bottom: 1px solid #222327; }
    .call-controls { gap: 0.5rem; }
    .room-invite-actions { flex-direction: column; }
  }
</style>
