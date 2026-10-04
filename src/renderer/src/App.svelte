<script lang="ts">
  import Navigation from './Navigation.svelte'
  import Join from './Join.svelte'
  import Host from './Host.svelte'
  import Channels from './Channels.svelte'
  import Settings from './Settings.svelte'
  import Debug from './Debug.svelte'
  import Bonjour from './Bonjour.svelte'
  import ScreenPicker from './ScreenPicker.svelte'
  import Toast from './Toast.svelte'
  import SessionStage from './SessionStage.svelte'
  import IncomingCallNotice from './IncomingCallNotice.svelte'
  import { appState } from './appState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { L } from './translations'
  import { getDataFromKiwiUrl } from './Utils'
  import { parseChannelLink, parseRoomLink } from './session/roomServer'
  import { sessionRoom as room } from './session/sessionStore.svelte'
  import { onMount } from 'svelte'

  let screenPicker: ScreenPicker | undefined = $state()
  let channelsComponent: { join: (url: string) => Promise<void> } | undefined = $state()
  let homeSection = $state('home')
  let closedDrawerForCall = false

  const joining = $derived(appState.sessionSource === 'join' || (appState.sessionSource === 'channel' && !appState.isHosting))
  const connected = $derived(room.isLive && room.connectionState === 'connected' && room.peers.some((peer) => peer.id !== room.localPeerId) && (!room.e2eeRequired || room.secureConnectionReady))
  const connecting = $derived(joining && !connected && !room.sessionEndedReason)
  const presenting = $derived(!connecting && Boolean(appState.sessionSource === 'host' || appState.sessionSource === 'channel' || room.isLive || room.sessionEndedReason))
  const hideHome = $derived(connecting || presenting)
  const showInvite = $derived(room.isCoordinator || appState.sessionSource === 'channel')

  const cancelJoining = async (): Promise<void> => {
    await room.Disconnect().catch(() => undefined)
    appState.resetSession()
  }

  $effect(() => {
    const liveBonjour = appState.sessionSource === 'bonjour' && room.isLive
    if (liveBonjour && !closedDrawerForCall) {
      closedDrawerForCall = true
      appState.bonjourVisible = false
    }
    if (!room.isLive || appState.sessionSource !== 'bonjour') closedDrawerForCall = false
  })

  onMount(async () => {
    window.KiwiApi.onSelectScreenShareSource((sources) =>
      screenPicker ? screenPicker.pick(sources) : Promise.resolve(null),
    )
    const settings = await window.KiwiApi.getSettings()
    appState.debugLogsEnabled = settings.debugLogsEnabled
    appState.bonjourEnabled = settings.bonjourEnabled === true
    debugLog.setEnabled(settings.debugLogsEnabled)
    if (settings.debugLogsEnabled) debugLog.info('app', 'debug logs enabled')
  })

  window.onmessage = async (evt: MessageEvent): Promise<void> => {
    const { data } = evt
    if (data.type !== 'openKiwiURL') return
    if (parseRoomLink(data.url)) {
      appState.activeView = 'home'
      appState.participantUrl = data.url
      return
    }
    if (parseChannelLink(data.url)) {
      appState.activeView = 'home'
      appState.participantUrl = data.url
      return
    }
    const urlData = await getDataFromKiwiUrl(data.url)
    switch (urlData.type) {
      case 'host':
        appState.activeView = 'home'
        appState.participantUrl = data.url
        break
      case 'participant':
        if (!appState.isCoordinator) return
        appState.hostUrl = data.url
        break
    }
  }
</script>

<div class="drawer drawer-end">
  <input id="bonjour-drawer" type="checkbox" onchange={(evt)=>{
    appState.bonjourVisible = (evt.target as HTMLInputElement).checked
    }} class="drawer-toggle" checked={appState.bonjourVisible ? true : false} />
  <div class="drawer-content">
    {#if !hideHome}<Navigation />{/if}
    <Toast />
    <div class={hideHome ? 'hidden' : ''}>
      {#if appState.activeView === 'home'}
        <main class="home-page" data-theme="business">
          <aside class="home-sidebar" aria-label={L.audio_chats()}>
            <a class="home-sidebar-link" class:selected={homeSection === 'home'} href="#home-top" onclick={() => homeSection = 'home'}><i class="fa-solid fa-house"></i><span>{L.home()}</span></a>
            <a class="home-sidebar-link" class:selected={homeSection === 'temporary'} href="#temporary-card" onclick={() => homeSection = 'temporary'}><i class="fa-regular fa-clock"></i><span>{L.temporary_chat()}</span></a>
            <a class="home-sidebar-link" class:selected={homeSection === 'channels'} href="#channel-card" onclick={() => homeSection = 'channels'}><i class="fa-solid fa-hashtag"></i><span>{L.permanent_channels()}</span></a>
            <a class="home-sidebar-link" class:selected={homeSection === 'saved'} href="#saved-channels" onclick={() => homeSection = 'saved'}><i class="fa-regular fa-bookmark"></i><span>{L.saved_channels()}</span></a>
            <div class="home-sidebar-divider"></div>
            <button class="home-sidebar-link" onclick={() => appState.activeView = 'settings'}><i class="fa-solid fa-gear"></i><span>{L.settings()}</span></button>
          </aside>
          <div id="home-top" class="home-main">
            <div class="home-heading">
              <div><h1>{L.audio_chats()}</h1><p>{L.audio_chats_description()}</p></div>
              <span class="home-motto"><i class="fa-solid fa-wave-square"></i>{L.talk_share()}</span>
            </div>
            <div class="home-options">
              <section id="temporary-card" class="home-card"><Host /></section>
              <section id="channel-card" class="home-card home-card-channel"><Channels bind:this={channelsComponent} /></section>
              <section id="join-card" class="home-card"><Join onChannelJoin={(url) => void channelsComponent?.join(url)} /></section>
            </div>
          </div>
        </main>
      {:else if appState.activeView === 'settings'}
        <Settings />
      {:else if appState.activeView === 'debug'}
        <Debug />
      {/if}
    </div>
    {#if connecting}
      <main class="connection-wait" data-theme="business">
        <span class="loading loading-spinner loading-lg" aria-hidden="true"></span>
        <h1>{L.connecting_to_session()}</h1>
        <button class="btn btn-ghost" onclick={cancelJoining}>{L.cancel()}</button>
      </main>
    {/if}
    {#if presenting}
      <SessionStage {room} {showInvite} onReset={() => appState.resetSession()} />
    {/if}
  </div>
  <div class="drawer-side">
    <label for="bonjour-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
    <div class="menu bg-base-200 min-h-full w-120 p-4">
      {#if appState.bonjourEnabled}
        <Bonjour />
      {/if}
    </div>
  </div>
</div>

<IncomingCallNotice />
<ScreenPicker bind:this={screenPicker} />
