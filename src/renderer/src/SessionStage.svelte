<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { toast } from './toastState.svelte'
  import {
    ConnectionType,
    fitVideoSize,
    getDataFromKiwiUrl,
    mayBeConnectionString,
    zoomAtPointer,
  } from './Utils'
  import AudioVisualizer from './AudioVisualizer.svelte'
  import Settings from './Settings.svelte'
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

  let visualizerIsActive = $state(true)
  let connectionStringIsValid = $state<boolean | null>(null)
  let username = $state('')
  let inviteInFlight = false
  let inviteFormIsVisible = $state(false)
  let participantsOpen = $state(true)
  let chatOpen = $state(false)
  let chatDraft = $state('')
  let settingsOpen = $state(false)
  let browserPanelOpen = $state(false)
  let browserFrameMinimized = $state(false)
  let browserUrl = $state('')
  let browserLoading = $state(false)
  let browserReady = $state(false)
  let browserError = $state('')
  let browserWebview: (HTMLElement & { getWebContentsId: () => number }) | null = null
  let now = $state(Date.now())
  const remainingSeconds = $derived(Math.max(0, Math.ceil(((appState.sessionExpiresAt ?? 0) - now) / 1000)))
  const remainingTime = $derived(new Date(remainingSeconds * 1000).toISOString().slice(11, 19))
  const inviteLink = $derived(appState.roomLink || (appState.sessionSource === 'join' || appState.sessionSource === 'channel' ? appState.participantUrl : ''))

  const presenterShare = $derived(room.screenShares.find((share) =>
    share.peerId === room.presenterId && share.peerId !== room.localPeerId,
  ))
  const otherShares = $derived(room.screenShares.filter((share) => share !== presenterShare))
  const pendingScreens = $derived(room.availableScreens.filter((screen) =>
    !room.screenShares.some((share) => share.peerId === screen.peerId),
  ))
  const pendingBrowsers = $derived(room.availableBrowsers.filter((browser) =>
    !room.browserShares.some((share) => share.peerId === browser.peerId),
  ))
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
  const fitVideo = (video: HTMLVideoElement) => {
    const stage = video.parentElement
    if (!stage) return undefined
    const update = () => {
      if (!video.videoWidth || !video.videoHeight || !stage.clientWidth || !stage.clientHeight) return
      const { width, height } = fitVideoSize(video.videoWidth, video.videoHeight, stage.clientWidth, stage.clientHeight)
      video.style.width = `${width}px`
      video.style.height = `${height}px`
    }
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    video.addEventListener('resize', update)
    video.addEventListener('loadedmetadata', update)
    update()
    return {
      destroy() {
        observer.disconnect()
        video.removeEventListener('resize', update)
        video.removeEventListener('loadedmetadata', update)
      },
    }
  }
  let fullscreenVideo: HTMLVideoElement | null = null
  let originalVideoStyle = { scale: '', translate: '', transform: '' }
  let fullscreenScale = 1
  let fullscreenX = 0
  let fullscreenY = 0

  const onFullscreenChange = (): void => {
    if (fullscreenVideo) {
      fullscreenVideo.style.scale = originalVideoStyle.scale
      fullscreenVideo.style.translate = originalVideoStyle.translate
      fullscreenVideo.style.transform = originalVideoStyle.transform
    }
    const stage = document.fullscreenElement
    fullscreenVideo = stage?.classList.contains('video-stage')
      ? stage.querySelector('video')
      : null
    if (!fullscreenVideo) return
    originalVideoStyle = {
      scale: fullscreenVideo.style.scale,
      translate: fullscreenVideo.style.translate,
      transform: fullscreenVideo.style.transform,
    }
    fullscreenVideo.style.scale = '1'
    fullscreenVideo.style.translate = '0px 0px'
    fullscreenVideo.style.transform = ''
    fullscreenScale = 1
    fullscreenX = 0
    fullscreenY = 0
  }

  const onFullscreenWheel = (event: WheelEvent): void => {
    const stage = document.fullscreenElement
    if (!fullscreenVideo || !stage?.classList.contains('video-stage')) return
    event.preventDefault()
    const nextScale = Math.max(1, Math.min(5, fullscreenScale * Math.exp(-event.deltaY * 0.0015)))
    if (nextScale === fullscreenScale) return
    const bounds = stage.getBoundingClientRect()
    const pointerX = event.clientX - bounds.left - bounds.width / 2
    const pointerY = event.clientY - bounds.top - bounds.height / 2
    const position = zoomAtPointer(fullscreenX, fullscreenY, pointerX, pointerY, fullscreenScale, nextScale)
    fullscreenX = nextScale === 1 ? 0 : position.x
    fullscreenY = nextScale === 1 ? 0 : position.y
    fullscreenScale = nextScale
    fullscreenVideo.style.translate = `${fullscreenX}px ${fullscreenY}px`
    fullscreenVideo.style.scale = String(fullscreenScale)
  }

  $effect(() => {
    if (remoteScreen) {
      room.setRemoteVideo(remoteScreen)
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

  onMount(() => {
    void window.KiwiApi.getSettings().then((settings) => username = settings.username)
    const timer = setInterval(() => now = Date.now(), 1000)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('wheel', onFullscreenWheel, { passive: false })
    return () => {
      clearInterval(timer)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('wheel', onFullscreenWheel)
    }
  })

  const onMicrophoneToggle = (): void => {
    room.ToggleMicrophone()
  }

  const onCameraToggle = async (): Promise<void> => {
    await room.ToggleCamera()
  }

  const onChatClick = (): void => {
    chatOpen = !chatOpen
  }

  const onChatSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    if (!chatDraft.trim()) return
    room.sendChat(chatDraft)
    chatDraft = ''
  }

  const chatTime = (at: number): string =>
    new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const autoscrollChat = (node: HTMLDivElement) => {
    const stop = $effect.root(() => {
      $effect(() => {
        void room.chatMessages.length
        node.scrollTop = node.scrollHeight
      })
    })
    return { destroy: stop }
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

  const onBrowserSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    if (!browserUrl.trim() || browserLoading || !browserReady || !browserWebview) return
    browserLoading = true
    browserError = ''
    try {
      await room.openBrowser(browserUrl.trim(), browserWebview.getWebContentsId())
      browserPanelOpen = false
      browserFrameMinimized = false
    } catch (error) {
      browserError = error instanceof Error ? error.message : String(error)
      toast.show('error', browserError)
    } finally {
      browserLoading = false
    }
  }

  const onStopBrowser = async (): Promise<void> => {
    await room.stopBrowser()
    browserFrameMinimized = false
  }

  const attachBrowserWebview = (node: HTMLElement) => {
    const webview = node as typeof browserWebview & HTMLElement
    browserWebview = webview
    const onReady = () => browserReady = true
    const onFailed = (event: Event) => {
      const failure = event as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean }
      if (failure.isMainFrame && failure.errorCode !== -3) {
        browserError = failure.errorDescription || 'Could not load page'
        toast.show('error', browserError)
      }
    }
    webview.addEventListener('dom-ready', onReady)
    webview.addEventListener('did-fail-load', onFailed)
    return { destroy() {
      webview.removeEventListener('dom-ready', onReady)
      webview.removeEventListener('did-fail-load', onFailed)
      if (browserWebview === webview) browserWebview = null
      browserReady = false
    } }
  }

  let inviteAnotherButton: HTMLButtonElement | undefined = $state()
  let inviteAnotherTextLoading = $state('')

  const onCopyInvite = async (): Promise<void> => {
    if (inviteInFlight) return
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink)
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

  const onFullscreenClick = async (stage: HTMLElement | null | undefined): Promise<void> => {
    if (!stage) return
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen()
      return
    }
    await stage.requestFullscreen()
  }

  const onExitFullscreenClick = (e: MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    void document.exitFullscreen()
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
  <div class="call-brand"><span>a.</span><span>webo</span></div>
  {#if (appState.sessionSource === 'host' || appState.sessionSource === 'join') && appState.sessionExpiresAt}
    <div class="call-timer" role="timer" aria-live="off" title={L.expires_after_duration()}>
      <i class="fa-regular fa-clock"></i><span>{L.temporary_chat()}</span><strong>{remainingTime}</strong>
    </div>
  {/if}
  <button class="header-settings" title={L.settings()} aria-label={L.settings()} onclick={() => settingsOpen = true}>
    <i class="fa-solid fa-gear"></i>
  </button>
</header>

<div class:sidebar-hidden={!participantsOpen} class:chat-open={chatOpen} class="call-content">
<aside class="call-sidebar" aria-label={L.peer_list()}>

{#if room.presenterGone && !room.isPresenter && !room.sessionEndedReason}
  <div class="alert alert-warning mb-4">{L.presenter_left()}</div>
{/if}

{#if room.identityChanged}
  <div class="alert alert-warning mb-4">{L.identity_changed()}</div>
{/if}

<div class="sidebar-status">
  <h2>{L.session_started()}</h2>
  {#if room.e2eeActive && room.mediaE2eeActive}
    {#if room.verification}
      <details class="verification" name="e2ee-verification">
        <summary class="status-pill secure">
          <i class="fa-solid fa-lock"></i> {L.e2ee_on()}
        </summary>
        <div class="verification-content">
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
    {:else}
      <span class="status-pill secure"><i class="fa-solid fa-lock"></i> {L.e2ee_on()}</span>
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

<div class="sidebar-members">
  <h2>{L.peer_list()} <span>{room.peers.length}</span></h2>
  <div class="member-list">
    {#each room.peers as peer (peer.id)}
      <div class="member-row">
        <span class="member-avatar-wrap">
          {#if peer.avatar}
            <img class="member-avatar" src={peer.avatar} alt="" />
          {:else}
            <span class="member-avatar" style:background={peer.backgroundColor} style:color={peer.foregroundColor}>
              {peer.username.trim().charAt(0).toUpperCase() || '?'}
            </span>
          {/if}
          <span class="member-online"></span>
        </span>
        <span class="member-name" title={peer.username}>
          {peer.username}{peer.id === room.localPeerId ? ` (${L.you()})` : ''}
        </span>
        {#if peer.id === room.coordinatorId}<i class="member-role fa-solid fa-crown" title={L.coordinator()}></i>{/if}
        {#if peer.id === room.presenterId}<i class="member-role fa-solid fa-display" title={L.presenter()}></i>{/if}
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
{#if !inviteLink && showInvite && inviteFormIsVisible}
  <div class="room-invite">
    <div class="room-invite-actions">
      <input class="input {connectionInputClass}" bind:value={appState.hostUrl} aria-label={L.participant_connection_string()} />
      <button class="btn {connectButtonClass}" onclick={onConnectInvite} disabled={!connectionStringIsValid}>{L.connect()}</button>
      <button class="btn btn-ghost" onclick={() => inviteFormIsVisible = false}>{L.cancel()}</button>
    </div>
  </div>
{/if}
<div class="screen-area">
<div class:has-media={room.screenShares.length > 0 || room.cameraShares.length > 0 || room.browserShares.length > 0 || browserPanelOpen || pendingScreens.length > 0 || pendingBrowsers.length > 0} class="screen-grid">
<div class={showVideo ? '' : 'hidden'}>
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend">{presenterShare?.name ?? L.remote_screen()}</legend>
    {#if presenterShare}<button class="btn btn-ghost btn-sm self-end" onclick={() => room.watchScreen(presenterShare.peerId, false)}>{L.stop_watching()}</button>{/if}
    <div class="video-overflow video-stage relative">
      {#if showBrokenVideo}
        <div class="broken-video" aria-hidden="true">
          <img src={brokenVideoUrl} alt="" />
        </div>
      {/if}
      <video
        bind:this={remoteScreen}
        id="remote_screen"
        class="{videoClass} {showBrokenVideo ? 'video-off' : ''}"
        use:fitVideo
        autoplay
        playsinline
        muted
        disablepictureinpicture
      ></video>
      <button class="enter-fullscreen-btn btn btn-neutral btn-sm" title={L.fullscreen()} aria-label={L.fullscreen()} onclick={(e) => onFullscreenClick(e.currentTarget.parentElement)}><i class="fa-solid fa-expand"></i></button>
      <button class="exit-fullscreen-btn btn btn-neutral btn-sm" title={L.exit_fullscreen()} aria-label={L.exit_fullscreen()} onclick={onExitFullscreenClick}><i class="fa-solid fa-compress"></i></button>
    </div>
  </fieldset>
</div>
{#each otherShares as share (share.peerId)}
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend">{share.name}</legend>
    {#if share.peerId !== room.localPeerId}
      <button class="btn btn-ghost btn-sm self-end" onclick={() => room.watchScreen(share.peerId, false)}>{L.stop_watching()}</button>
    {/if}
    <div class="video-overflow video-stage relative">
      <video
        class="video rounded-lg bg-black"
        use:attachScreen={share.stream}
        use:fitVideo
        autoplay
        playsinline
        muted
        disablepictureinpicture
      ></video>
      <button class="enter-fullscreen-btn btn btn-neutral btn-sm" title={L.fullscreen()} aria-label={L.fullscreen()} onclick={(e) => onFullscreenClick(e.currentTarget.parentElement)}><i class="fa-solid fa-expand"></i></button>
      <button class="exit-fullscreen-btn btn btn-neutral btn-sm" title={L.exit_fullscreen()} aria-label={L.exit_fullscreen()} onclick={onExitFullscreenClick}><i class="fa-solid fa-compress"></i></button>
    </div>
  </fieldset>
{/each}
{#each pendingScreens as screen (screen.peerId)}
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend">{screen.name}</legend>
    <div class="screen-watch-card">
      <i class="fa-solid fa-display" aria-hidden="true"></i>
      {#if room.watchingScreens.includes(screen.peerId)}
        <span class="loading loading-spinner" aria-label={L.connecting_to_session()}></span>
        <button class="btn btn-ghost" onclick={() => room.watchScreen(screen.peerId, false)}>{L.stop_watching()}</button>
      {:else}
        <button class="invite-copy" onclick={() => room.watchScreen(screen.peerId, true)}>{L.watch_screen()}</button>
      {/if}
    </div>
  </fieldset>
{/each}
{#if browserPanelOpen || room.browserActive}
  <fieldset class="fieldset px-0 min-w-0 relative" class:browser-frame-minimized={browserFrameMinimized && room.browserActive}>
    <legend class="fieldset-legend"><i class="fa-solid fa-globe"></i> {L.browser_page()} ({L.you()})</legend>
    {#if room.browserActive}
      <div class="browser-frame-actions">
        <button class="btn btn-neutral btn-sm" title={browserFrameMinimized ? L.restore_browser_frame() : L.minimize_browser_frame()} aria-label={browserFrameMinimized ? L.restore_browser_frame() : L.minimize_browser_frame()} onclick={() => browserFrameMinimized = !browserFrameMinimized}><i class="fa-solid {browserFrameMinimized ? 'fa-window-maximize' : 'fa-window-minimize'}"></i></button>
        {#if !browserFrameMinimized}<button class="btn btn-neutral btn-sm" title={L.fullscreen()} aria-label={L.fullscreen()} onclick={(e) => onFullscreenClick(e.currentTarget.closest('fieldset')?.querySelector<HTMLElement>('.browser-viewport'))}><i class="fa-solid fa-expand"></i></button>{/if}
        <button class="btn btn-neutral btn-sm" title={L.stop_browser_share()} aria-label={L.stop_browser_share()} onclick={() => void onStopBrowser()}><i class="fa-solid fa-xmark"></i></button>
      </div>
    {/if}
    <div class="browser-viewport video-stage relative">
      <webview use:attachBrowserWebview src="data:text/html,%3Cbody%20style%3D%22background%3A%23101d26%22%3E%3C%2Fbody%3E" partition="browser-share"></webview>
      {#if !room.browserActive}<div class="browser-placeholder"><i class="fa-solid fa-globe"></i><span>{L.share_browser_page()}</span></div>{/if}
      {#if room.browserActive}
        <button class="exit-fullscreen-btn btn btn-neutral btn-sm" title={L.exit_fullscreen()} aria-label={L.exit_fullscreen()} onclick={onExitFullscreenClick}><i class="fa-solid fa-compress"></i></button>
      {/if}
    </div>
  </fieldset>
{/if}
{#each room.browserShares.filter((share) => share.peerId !== room.localPeerId) as share (share.peerId)}
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend"><i class="fa-solid fa-globe"></i> {share.name} · {L.browser_page()}</legend>
    {#if share.peerId !== room.localPeerId}
      <button class="btn btn-ghost btn-sm self-end" onclick={() => room.watchBrowser(share.peerId, false)}>{L.stop_watching()}</button>
    {/if}
    <div class="video-overflow video-stage relative">
      <video class="video rounded-lg bg-black" use:attachScreen={share.stream} use:fitVideo autoplay playsinline muted disablepictureinpicture></video>
      <button class="enter-fullscreen-btn btn btn-neutral btn-sm" title={L.fullscreen()} aria-label={L.fullscreen()} onclick={(e) => onFullscreenClick(e.currentTarget.parentElement)}><i class="fa-solid fa-expand"></i></button>
      <button class="exit-fullscreen-btn btn btn-neutral btn-sm" title={L.exit_fullscreen()} aria-label={L.exit_fullscreen()} onclick={onExitFullscreenClick}><i class="fa-solid fa-compress"></i></button>
    </div>
  </fieldset>
{/each}
{#each pendingBrowsers as browser (browser.peerId)}
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend"><i class="fa-solid fa-globe"></i> {browser.name} · {L.browser_page()}</legend>
    <div class="screen-watch-card">
      <i class="fa-solid fa-globe" aria-hidden="true"></i>
      {#if room.watchingBrowsers.includes(browser.peerId)}
        <span class="loading loading-spinner" aria-label={L.connecting_to_session()}></span>
        <button class="btn btn-ghost" onclick={() => room.watchBrowser(browser.peerId, false)}>{L.stop_watching()}</button>
      {:else}
        <button class="invite-copy" onclick={() => room.watchBrowser(browser.peerId, true)}>{L.watch_browser()}</button>
      {/if}
    </div>
  </fieldset>
{/each}
{#each room.cameraShares as camera (camera.peerId)}
  <fieldset class="fieldset px-0 min-w-0">
    <legend class="fieldset-legend"><i class="fa-solid fa-video"></i> {camera.name}{camera.peerId === room.localPeerId ? ` (${L.you()})` : ''}</legend>
    <div class="video-overflow video-stage relative">
      <video
        class="video camera-video rounded-lg bg-black"
        class:local-camera={camera.peerId === room.localPeerId}
        use:attachScreen={camera.stream}
        use:fitVideo
        autoplay
        playsinline
        muted
        disablepictureinpicture
      ></video>
      <button class="enter-fullscreen-btn btn btn-neutral btn-sm" title={L.fullscreen()} aria-label={L.fullscreen()} onclick={(e) => onFullscreenClick(e.currentTarget.parentElement)}><i class="fa-solid fa-expand"></i></button>
      <button class="exit-fullscreen-btn btn btn-neutral btn-sm" title={L.exit_fullscreen()} aria-label={L.exit_fullscreen()} onclick={onExitFullscreenClick}><i class="fa-solid fa-compress"></i></button>
    </div>
  </fieldset>
{/each}
</div>
{#if room.screenShares.length === 0 && room.cameraShares.length === 0 && room.browserShares.length === 0 && !browserPanelOpen && pendingScreens.length === 0 && pendingBrowsers.length === 0}
  <div class="call-empty">
    <i class="fa-solid fa-display"></i>
    <p>{L.not_streaming_your_display()}</p>
    <button class="invite-copy" onclick={onChangeScreen}><i class="fa-solid fa-display"></i> {L.share_your_screen()}</button>
  </div>
{/if}
</div>
  </main>
  {#if chatOpen}
    <aside class="chat-panel" aria-label={L.chat()}>
      <header class="chat-heading"><h2><i class="fa-regular fa-comment"></i> {L.chat()}</h2><span><i class="fa-solid fa-user-group"></i> {room.peers.length}</span></header>
      <div use:autoscrollChat class="chat-messages" aria-live="polite">
        {#each room.chatMessages as message (message.id)}
          {@const sender = room.peers.find((peer) => peer.id === message.from)}
          <article class="chat-message">
            {#if sender?.avatar}
              <img class="chat-avatar" src={sender.avatar} alt="" />
            {:else}
              <span class="chat-avatar chat-initial" style:background={sender?.backgroundColor ?? '#0d4b49'} style:color={sender?.foregroundColor ?? '#f4f7fa'}>{message.name.trim().charAt(0).toUpperCase() || '?'}</span>
            {/if}
            <div class="chat-message-body"><div class="chat-message-meta"><strong>{message.name}</strong><time>{chatTime(message.at)}</time></div><p>{message.text}</p></div>
          </article>
        {/each}
      </div>
      <form class="chat-compose" onsubmit={onChatSubmit}>
        <input class="input" bind:value={chatDraft} placeholder={L.chat_placeholder()} aria-label={L.chat_placeholder()} maxlength="2000" />
        <button type="submit" aria-label={L.send()} disabled={!chatDraft.trim()}><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </aside>
  {/if}
</div>

<nav class="call-controls" aria-label={L.media()}>
  {#if browserPanelOpen}
    <form class="browser-link-form" onsubmit={onBrowserSubmit}>
      <label for="browser-share-url">{L.browser_page()}</label>
      <div class="browser-link-row">
        <input id="browser-share-url" class="input" type="text" inputmode="url" bind:value={browserUrl} placeholder="https://example.com" required />
        <button class="invite-copy" type="submit" disabled={browserLoading || !browserReady}>{browserLoading ? `${L.load_page()}…` : L.load_page()}</button>
        <button class="btn btn-ghost" type="button" onclick={() => browserPanelOpen = false}>{L.cancel()}</button>
      </div>
      {#if browserError}<p class="browser-link-error" role="alert">{browserError}</p>{/if}
    </form>
  {/if}
  <button class:control-active={room.displayStreamActive} class="control-button" onclick={() => room.displayStreamActive ? onDisplayStreamToggle() : onChangeScreen()} aria-label={room.displayStreamActive ? L.streaming_your_display() : L.share_your_screen()}>
    <i class="fa-solid fa-display"></i><span>{L.share_your_screen()}</span>
  </button>
  <button class:control-active={room.browserActive} class="control-button" onclick={() => browserPanelOpen = !browserPanelOpen} aria-label={L.share_browser_page()}><i class="fa-solid fa-globe"></i><span>{room.browserActive ? L.change_browser_link() : L.share_browser_page()}</span></button>
  {#if room.browserActive}<button class="control-button compact" onclick={() => void onStopBrowser()} title={L.stop_browser_share()} aria-label={L.stop_browser_share()}><i class="fa-solid fa-xmark"></i></button>{/if}
  {#if room.displayStreamActive}
    <button class="control-button compact" onclick={onChangeScreen} title={L.change_screen()} aria-label={L.change_screen()}><i class="fa-solid fa-arrows-rotate"></i></button>
  {/if}
  <span class="control-separator"></span>
  {#if inviteLink || showInvite}
    <button class="control-button" bind:this={inviteAnotherButton} onclick={onCopyInvite} aria-label={L.copy_my_connection_string()}>
      <i class="fa-solid fa-link"></i><span>{inviteAnotherTextLoading || L.copy_my_connection_string()}</span>
    </button>
  {/if}
  {#if room.hasAudioInput}
    <button class:control-active={room.microphoneActive} class="control-button" onclick={onMicrophoneToggle} aria-label={room.microphoneActive ? L.microphone_active() : L.microphone_inactive()}>
      <span class="mic-btn-icon">
        {#if room.microphoneActive}
          <AudioVisualizer className={visualizerIsActive ? '' : 'hidden'} bind:visualizerIsActive stream={room.GetAudioStream()} />
          <i class="fas fa-microphone {visualizerIsActive ? 'hidden' : ''}"></i>
        {:else}<i class="fas fa-microphone-slash"></i>{/if}
      </span>
      <span>{L.microphone_device()}</span>
    </button>
  {/if}
  <button class:control-active={room.cameraActive} class="control-button" onclick={onCameraToggle} aria-label={room.cameraActive ? L.camera_on() : L.camera_off()}>
    <i class="fa-solid {room.cameraActive ? 'fa-video' : 'fa-video-slash'}"></i><span>{L.camera()}</span>
  </button>
  <button class:control-selected={chatOpen} class="control-button" onclick={onChatClick} aria-pressed={chatOpen}><i class="fa-solid fa-comment"></i><span>{L.chat()}</span></button>
  <button class:control-selected={participantsOpen} class="control-button" onclick={() => participantsOpen = !participantsOpen} aria-pressed={participantsOpen}>
    <i class="fa-solid fa-user-group"></i><span>{L.peer_list()}</span>
  </button>
  <span class="control-separator"></span>
  <button class="control-button control-danger" onclick={onLeaveClick}><i class="fa-solid fa-phone-slash"></i><span>{L.leave()}</span></button>
  {#if room.isCoordinator && appState.sessionSource !== 'channel'}
    <button class="control-button control-danger end-session" onclick={onEndSessionClick}><i class="fa-solid fa-power-off"></i><span>{L.end_session()}</span></button>
  {/if}
</nav>

{#if settingsOpen}
  <div class="settings-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) settingsOpen = false }}>
    <dialog open class="settings-dialog" aria-label={L.settings()}>
      <button class="settings-close" aria-label={L.dismiss()} onclick={() => settingsOpen = false}><i class="fa-solid fa-xmark"></i></button>
      <Settings />
    </dialog>
  </div>
{/if}

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
  .browser-link-form { position: absolute; bottom: calc(100% + 0.7rem); left: 50%; transform: translateX(-50%); z-index: 60; display: flex; flex-direction: column; gap: 0.65rem; width: min(34rem, calc(100vw - 2rem)); padding: 1rem; border: 1px solid #344a56; border-radius: 0.9rem; background: #15232d; box-shadow: 0 1rem 2.5rem #0009; }
  .browser-link-form label { font-size: 0.82rem; font-weight: 700; }
  .browser-link-row { display: flex; align-items: stretch; gap: 0.5rem; min-width: 0; }
  .browser-link-row .input { flex: 1; min-width: 0; background: #101d26; border-color: #425563; color: #f4f7fa; }
  .browser-link-row .invite-copy { min-height: 2.8rem; }
  .browser-link-error { color: #ffb4b8; font-size: 0.76rem; overflow-wrap: anywhere; }
  .browser-viewport { width: 100%; min-height: 20rem; flex: 1; overflow: hidden; background: #101d26; border-radius: 0.65rem; }
  .browser-frame-actions { position: absolute; top: 0.5rem; right: 0.75rem; display: flex; gap: 0.35rem; z-index: 2; }
  .screen-grid .browser-frame-minimized { position: relative; height: 3.5rem; align-self: start; }
  .browser-frame-minimized .browser-viewport { position: fixed; left: -10000px; top: 0; width: 1280px; height: 720px; min-height: 0; pointer-events: none; }
  .browser-viewport :global(webview) { display: flex; width: 100%; height: 100%; min-height: 20rem; }
  .browser-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; color: #b7c1ce; background: #101d26; pointer-events: none; }
  .browser-placeholder i { font-size: 2.5rem; }
  .call-shell {
    min-height: 100vh;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 65% 50%, #16262d, #0c171f 66%);
    color: #f4f7fa;
  }
  .call-header {
    position: relative;
    min-height: 3.8rem;
    padding: 0.6rem 2.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #101b24;
    border-bottom: 1px solid #293a46;
  }
  .call-brand {
    color: #fff;
    font-size: 1.65rem;
    font-weight: 800;
    letter-spacing: -0.05em;
  }
  .call-brand span:first-child { color: #05ad98; }
  .call-timer { position: absolute; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.75rem; border: 1px solid #425563; border-radius: 0.7rem; background: #202f3a; color: #b7c1ce; font-size: 0.8rem; white-space: nowrap; }
  .call-timer strong { color: #f4f7fa; font-variant-numeric: tabular-nums; font-size: 0.9rem; }
  .call-timer i { color: #06c7b2; }
  .header-settings {
    border: 0;
    background: transparent;
    color: #b8c3d1;
    font-size: 1.55rem;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
  }
  .header-settings:hover { color: #00c5b3; }
  .call-content {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 17.1rem minmax(0, 1fr);
    gap: 0.8rem;
    padding: 1rem 1.1rem 0;
  }
  .call-content.chat-open { grid-template-columns: 17.1rem minmax(0, 1fr) 22.5rem; }
  .call-content.sidebar-hidden { grid-template-columns: minmax(0, 1fr); }
  .call-content.sidebar-hidden.chat-open { grid-template-columns: minmax(0, 1fr) 22.5rem; }
  .sidebar-hidden .call-sidebar { display: none; }
  .call-sidebar {
    min-width: 0;
    padding: 1.25rem 1.1rem;
    border: 1px solid #273945;
    border-radius: 1rem;
    background: linear-gradient(135deg, #1a2934, #14212b);
  }
  .sidebar-status { border-bottom: 1px solid #30434e; padding-bottom: 1.15rem; margin-bottom: 1.15rem; }
  .call-sidebar h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.55rem; }
  .sidebar-members h2 { display: flex; justify-content: space-between; }
  .sidebar-members h2 span { font-size: 0.8rem; color: #aab7c4; }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid #087c73;
    border-radius: 0.75rem;
    background: #0d4b49;
    color: #d6fff6;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .status-pill i { color: #00ceba; }
  .verification-content { margin-top: 0.8rem; font-size: 0.7rem; overflow-wrap: anywhere; }
  .member-list { display: flex; flex-direction: column; gap: 0.35rem; }
  .member-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.45rem;
    border: 1px solid #334955;
    border-radius: 0.75rem;
    background: #1b2b35;
  }
  .member-avatar-wrap { position: relative; flex: none; }
  .member-avatar {
    width: 2.45rem;
    height: 2.45rem;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 0.95rem;
    font-weight: 700;
    object-fit: cover;
  }
  .member-online { position: absolute; right: -0.1rem; bottom: 0; width: 0.65rem; height: 0.65rem; border: 2px solid #1b2b35; border-radius: 50%; background: #06c7b2; }
  .member-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.77rem;
    font-weight: 600;
  }
  .member-role { color: #aab7c4; font-size: 0.8rem; }
  .call-stage {
    min-width: 0;
    min-height: 0;
    padding: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid #2d404c;
    border-radius: 1rem;
    background: linear-gradient(155deg, #15232d, #101d26);
    overflow: auto;
  }
  .chat-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid #2d404c; border-radius: 1rem; background: linear-gradient(155deg, #15232d, #101d26); overflow: hidden; }
  .chat-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 1rem 1.25rem; border-bottom: 1px solid #30434e; }
  .chat-heading h2 { display: flex; align-items: center; gap: 0.65rem; font-size: 1.1rem; font-weight: 700; }
  .chat-heading h2 i { color: #aab7c4; font-size: 1.25rem; }
  .chat-heading > span { display: flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem; border-radius: 0.5rem; background: #202f3a; color: #b7c1ce; font-size: 0.75rem; }
  .chat-messages { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; padding: 1rem; }
  .chat-message { display: flex; align-items: flex-start; gap: 0.65rem; }
  .chat-avatar { flex: none; width: 2.2rem; height: 2.2rem; border-radius: 50%; object-fit: cover; }
  .chat-initial { display: grid; place-items: center; font-weight: 700; }
  .chat-message-body { min-width: 0; }
  .chat-message-meta { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; font-size: 0.76rem; }
  .chat-message-meta strong { font-weight: 700; }
  .chat-message-meta time { color: #94a4b0; font-size: 0.7rem; }
  .chat-message-body p { display: inline-block; max-width: 100%; padding: 0.55rem 0.7rem; border-radius: 0.7rem; background: #1b2b35; color: #dbe4eb; font-size: 0.78rem; overflow-wrap: anywhere; white-space: pre-wrap; }
  .chat-compose { display: flex; gap: 0.45rem; padding: 0.65rem; border-top: 1px solid #30434e; }
  .chat-compose input { flex: 1; min-width: 0; height: 2.7rem; border: 1px solid #425563; border-radius: 0.65rem; background: #15232d; color: #f4f7fa; }
  .chat-compose button { flex: none; width: 2.7rem; border-radius: 0.65rem; background: linear-gradient(125deg, #0cc9b7, #009d91); color: white; cursor: pointer; }
  .chat-compose button:disabled { opacity: 0.5; cursor: default; }
  .room-invite {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    max-width: 55rem;
    width: 100%;
    margin: 0 auto;
    padding: 1.15rem 1.35rem;
    border: 1px solid #00c7b4;
    border-radius: 1rem;
    background: #172833;
  }
  .room-invite-actions { display: flex; gap: 0.5rem; min-width: 0; }
  .room-invite-actions input { flex: 1; min-width: 0; height: 3rem; background: #15232d; border-color: #425563; color: #f4f7fa; }
  .invite-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    min-height: 3rem;
    padding: 0.65rem 1.15rem;
    border: 1px solid #00c7b4;
    border-radius: 0.65rem;
    background: linear-gradient(125deg, #0cc9b7, #009d91);
    color: white;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .invite-copy:hover { filter: brightness(1.12); }
  .call-controls {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
    align-self: center;
    margin: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid #2d404c;
    border-radius: 1.15rem;
    background: #15232d;
  }
  .control-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: 3.15rem;
    padding: 0.65rem 0.95rem;
    border: 1px solid #425563;
    border-radius: 0.75rem;
    background: #202f3a;
    color: #f0f4f7;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .control-button i { font-size: 1.1rem; }
  .control-button:hover { background: #2a3a45; }
  .control-button.control-active, .control-button.control-selected { border-color: #00d7c3; background: linear-gradient(145deg, #08c4b4, #008f89); }
  .control-button.control-danger { border-color: #e43d49; background: #84252e; }
  .control-button.end-session { background: linear-gradient(160deg, #ee343e, #b62031); }
  .control-separator { width: 1px; height: 2rem; background: #425563; margin: 0 0.2rem; }
  .screen-area {
    flex: 1;
    min-height: 22rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border: 1px solid #344a56;
    border-radius: 1.2rem;
    background: radial-gradient(ellipse at center, #1a2b35 0, #101d26 75%);
    overflow: auto;
  }
  .call-empty {
    min-height: 22rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.1rem;
    color: #b7c1ce;
    text-align: center;
  }
  .call-empty > i { font-size: 3.5rem; }
  .call-empty p { font-size: 1rem; }
  .screen-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));
    gap: 1rem;
    padding: 1rem;
  }
  .screen-grid.has-media { height: 100%; min-height: 0; grid-auto-rows: minmax(21rem, 1fr); }
  .screen-grid > div { min-height: 0; }
  .screen-grid fieldset {
    min-width: 0;
    min-height: 0;
    padding: 0.75rem;
    border: 1px solid #344a56;
    border-radius: 1rem;
    background: #15232d;
    display: flex;
    flex-direction: column;
  }
  .screen-grid > div > fieldset { height: 100%; }
  .screen-watch-card { min-height: 13rem; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; border-radius: 0.75rem; background: #101d26; }
  .screen-watch-card > i { color: #8ca5b4; font-size: 2.5rem; }
  .screen-grid :global(.fieldset-legend) { color: #f4f7fa; }
  .camera-video { aspect-ratio: 16 / 9; object-fit: cover; }
  .camera-video.local-camera { transform: scaleX(-1); }
  .video {
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: contain;
    flex: none;
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
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }
  .video-stage { display: flex; align-items: center; justify-content: center; }
  .enter-fullscreen-btn,
  .exit-fullscreen-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 30;
    pointer-events: auto;
  }
  .exit-fullscreen-btn { display: none; }
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
  .video-stage:fullscreen .enter-fullscreen-btn,
  .video-stage:-webkit-full-screen .enter-fullscreen-btn {
    display: none;
  }
  .mic-btn-icon {
    width: 1.1rem;
    height: 1.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .settings-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; background: #0c171fd9; }
  .settings-dialog { position: relative; width: min(72rem, 100%); max-height: min(90vh, 52rem); overflow: auto; border: 1px solid #2d404c; border-radius: 1rem; background: #15232d; }
  .settings-close { position: sticky; top: 0.75rem; float: right; z-index: 2; margin: 0.75rem; width: 2rem; height: 2rem; border-radius: 0.5rem; background: #24333e; color: white; cursor: pointer; }
  @media (max-width: 900px) {
    .call-content { grid-template-columns: 12rem minmax(0, 1fr); }
    .call-content.chat-open { grid-template-columns: 12rem minmax(0, 1fr) 18rem; }
    .call-content.sidebar-hidden.chat-open { grid-template-columns: minmax(0, 1fr) 18rem; }
    .control-button { padding: 0.6rem; }
    .control-button span:not(.mic-btn-icon) { font-size: 0.7rem; }
  }
  @media (max-width: 700px) {
    .call-header { padding: 0.6rem 1rem; }
    .call-timer span { display: none; }
    .call-content { grid-template-columns: 1fr; }
    .call-content.chat-open, .call-content.sidebar-hidden.chat-open { grid-template-columns: 1fr; overflow-y: auto; }
    .call-sidebar { max-height: 16rem; overflow: auto; }
    .chat-panel { min-height: 20rem; max-height: 25rem; }
    .call-controls { gap: 0.4rem; margin: 0.6rem; }
    .control-separator { display: none; }
    .room-invite-actions { flex-direction: column; }
    .call-stage { padding: 0.7rem; }
    .room-invite { padding: 0.8rem; }
  }
</style>
