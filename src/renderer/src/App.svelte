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
  import { getDataFromKiwiUrl } from './Utils'
  import { parseChannelLink, parseRoomLink } from './session/roomServer'
  import { sessionRoom as room } from './session/sessionStore.svelte'
  import { onMount } from 'svelte'

  let screenPicker: ScreenPicker | undefined = $state()
  let closedDrawerForCall = false

  const presenting = $derived(Boolean(appState.sessionSource === 'host' || appState.sessionSource === 'channel' || room.isLive || room.sessionEndedReason))
  const showInvite = $derived(room.isCoordinator || appState.sessionSource === 'channel')

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
      appState.channelUrl = data.url
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
    {#if !presenting}<Navigation />{/if}
    <Toast />
    <div class={presenting ? 'hidden' : ''}>
      {#if appState.activeView === 'home'}
        <main class="home-page" data-theme="business">
          <div class="home-heading">
            <h1>p2p.kiwi</h1>
          </div>
          <div class="home-options">
            <section class="home-card"><Host /></section>
            <section class="home-card"><Join /></section>
            <section class="home-card" style="grid-column: 1 / -1"><Channels /></section>
          </div>
        </main>
      {:else if appState.activeView === 'settings'}
        <Settings />
      {:else if appState.activeView === 'debug'}
        <Debug />
      {/if}
    </div>
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
