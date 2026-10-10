<script lang="ts">
  import { onMount } from 'svelte'
  import type { UpdateState } from '../../shared/update'

  let update = $state<UpdateState | null>(null)
  let dismissedVersion = $state('')
  const visible = $derived(
    update && update.latestVersion &&
    (update.mandatory || update.latestVersion !== dismissedVersion) &&
    ['available', 'downloading', 'ready', 'error'].includes(update.status),
  )

  onMount(() => {
    window.KiwiApi.onUpdateState((state) => { update = state })
    void window.KiwiApi.getUpdateState().then((state) => { update = state })
  })
</script>

{#if visible && update}
  <div class:mandatory={update.mandatory} class="update-layer" data-theme="business">
    <section class="update-notice" role={update.mandatory ? 'alertdialog' : 'status'} aria-label="App update">
      <div>
        <h2>{update.mandatory ? 'Update required' : 'Update available'}</h2>
        <p>
          {#if update.status === 'downloading'}
            Downloading a.webo {update.latestVersion}: {update.progress ?? 0}%
          {:else if update.status === 'ready'}
            a.webo {update.latestVersion} is ready to install. Restarting will end your current call.
          {:else if update.status === 'error'}
            Download failed. You can get a.webo {update.latestVersion} from GitHub Releases.
          {:else}
            a.webo {update.latestVersion} is available. You are using {update.currentVersion}.
            {#if update.mandatory}This version is too old to continue.{/if}
          {/if}
        </p>
      </div>
      <div class="update-actions">
        <button class="btn btn-primary" type="button" disabled={update.status === 'downloading'} onclick={() => void window.KiwiApi.installUpdate()}>
          {update.status === 'ready' ? 'Install and restart' : update.status === 'error' || update.manual ? 'Open download page' : update.status === 'downloading' ? 'Downloading…' : 'Download update'}
        </button>
        {#if !update.mandatory}
          <button class="btn btn-ghost" type="button" onclick={() => { dismissedVersion = update.latestVersion ?? '' }}>Later</button>
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .update-layer { position: fixed; top: 1rem; right: 1rem; z-index: 100; max-width: min(32rem, calc(100vw - 2rem)); }
  .update-layer.mandatory { inset: 0; max-width: none; display: grid; place-items: center; background: #080a0be0; padding: 1rem; }
  .update-notice { display: grid; gap: 0.9rem; padding: 1rem; border: 1px solid var(--ui-border); border-radius: 0.75rem; background: var(--ui-panel); color: var(--ui-text); box-shadow: 0 1rem 3rem #0008; }
  .update-notice h2 { font-size: 1rem; font-weight: 700; }
  .update-notice p { margin-top: 0.3rem; color: var(--ui-muted); font-size: 0.85rem; }
  .update-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
  .update-actions .btn-primary { background: var(--ui-accent); border-color: var(--ui-accent); color: #061917; }
</style>
