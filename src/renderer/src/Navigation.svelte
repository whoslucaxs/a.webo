<script lang="ts">
  import { appState } from './appState.svelte'
  import { L } from './translations'
</script>

<header class="app-topbar" data-theme="business">
  <button class="app-brand" disabled={!appState.navigationEnabled} onclick={() => appState.activeView = 'home'}>
    <span class="app-brand-mark"><i class="fa-solid fa-house"></i></span>
    <strong>p2p.kiwi</strong>
  </button>
  <div class="app-topbar-actions">
    {#if appState.debugLogsEnabled}
      <button class="app-topbar-button" onclick={() => appState.activeView = 'debug'}><i class="fa-solid fa-bug"></i>{L.debug()}</button>
    {/if}
    {#if appState.bonjourEnabled}
      <button class="app-topbar-button" aria-label={L.bonjour()} onclick={() => appState.bonjourVisible = !appState.bonjourVisible}><i class="fa-solid fa-address-book"></i></button>
    {/if}
    <button class="app-topbar-button" disabled={!appState.navigationEnabled} onclick={() => appState.activeView = 'settings'}><i class="fa-solid fa-gear"></i>{L.settings()}</button>
  </div>
</header>
