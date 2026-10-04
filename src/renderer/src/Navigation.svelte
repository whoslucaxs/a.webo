<script lang="ts">
  import { appState } from './appState.svelte'
  import { L } from './translations'
</script>

<header class="app-topbar" data-theme="business">
  <button class="app-brand" disabled={!appState.navigationEnabled} onclick={() => appState.activeView = 'home'}>
    <strong>p2p.<span>kiwi</span></strong>
  </button>
  <div class="app-topbar-actions">
    {#if appState.debugLogsEnabled}
      <button class="app-topbar-button" aria-label={L.debug()} title={L.debug()} onclick={() => appState.activeView = 'debug'}><i class="fa-solid fa-bug"></i></button>
    {/if}
    {#if appState.bonjourEnabled}
      <button class="app-topbar-button" aria-label={L.bonjour()} onclick={() => appState.bonjourVisible = !appState.bonjourVisible}><i class="fa-solid fa-address-book"></i></button>
    {/if}
    <button class="app-topbar-button" aria-label={L.settings()} title={L.settings()} disabled={!appState.navigationEnabled} onclick={() => appState.activeView = 'settings'}><i class="fa-solid fa-gear"></i></button>
  </div>
</header>
