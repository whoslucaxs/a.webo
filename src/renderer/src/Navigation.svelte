<script lang="ts">
  import { appState } from './appState.svelte'
  import { L } from './translations'
  import type { ViewName } from './types'

  const handleTopButtonsClick = (evt: MouseEvent): void => {
    evt.preventDefault()
    const target = evt.target as HTMLButtonElement
    const root = target.closest('button')
    const action = root?.dataset.action as ViewName | undefined
    if (action) appState.activeView = action
  }
</script>

<div class="navbar bg-base-100 px-5 border-b border-base-content/10" data-theme="business">
  <div class="navbar-start flex flex-wrap gap-2">
    <button
      class="btn {appState.activeView === 'home' ? 'btn-primary' : 'btn-ghost'}"
      data-action="home"
      onclick={handleTopButtonsClick}
      disabled={!appState.navigationEnabled}
    >
      <span class="icon">
        <i class="fa-solid fa-house"></i>
      </span>
      <strong>p2p.kiwi</strong>
    </button>
    <button
      class="btn {appState.activeView === 'settings' ? 'btn-primary' : 'btn-ghost'}"
      data-action="settings"
      onclick={handleTopButtonsClick}
      disabled={!appState.navigationEnabled}
    >
      <span class="icon">
        <i class="fa-solid fa-gear"></i>
      </span>
      <strong>{L.settings()}</strong>
    </button>
    {#if appState.debugLogsEnabled}
      <button
        class="btn {appState.activeView === 'debug' ? 'btn-primary' : 'btn-ghost'}"
        data-action="debug"
        onclick={handleTopButtonsClick}
      >
        <span class="icon">
          <i class="fa-solid fa-bug"></i>
        </span>
        <strong>{L.debug()}</strong>
      </button>
    {/if}
  </div>
  <div class="navbar-end">
    {#if appState.bonjourEnabled}
      <button
        class="btn {appState.bonjourVisible === true ? 'btn-active' : 'btn-ghost'}"
        aria-label={L.bonjour()}
        onclick={()=> (appState.bonjourVisible = !appState.bonjourVisible)}
      >
        <span class="tooltip tooltip-left" data-tip={L.bonjour()}>
          <span class="icon">
            <i class="fa-solid fa-address-book"></i>
          </span>
        </span>
      </button>
    {/if}
  </div>
</div>
