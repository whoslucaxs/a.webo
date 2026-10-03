<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { toast } from './toastState.svelte'
  import { normalizeRoomServer } from './session/roomServer'
  type StoredSettings = Awaited<ReturnType<typeof window.KiwiApi.getSettings>>

  let savedSettings = $state<StoredSettings | null>(null)
  let username = $state('')
  let foregroundColor = $state('#ffffff')
  let backgroundColor = $state('#0099ff')
  let language = $state('en')
  let roomServerUrl = $state('')
  let cameraDeviceId = $state('')
  let microphoneDeviceId = $state('')
  let microphoneOnConnect = $state(true)
  let hardwareVideoAcceleration = $state(true)
  let debugLogsEnabled = $state(false)
  let cameras = $state<MediaDeviceInfo[]>([])
  let microphones = $state<MediaDeviceInfo[]>([])
  let saving = $state(false)
  const isLinux = window.electron.process.platform === 'linux'
  const languages = ['en', 'de', 'fr', 'pt-br', 'zh']
  const usernameValid = $derived(username.trim().length > 0 && username.trim().length < 32)

  const refreshDevices = async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      cameras = devices.filter((device) => device.kind === 'videoinput' && device.deviceId)
      microphones = devices.filter((device) => device.kind === 'audioinput' && device.deviceId)
    } catch (error) {
      debugLog.warn('settings', 'could not list media devices', error)
    }
  }

  const deviceLabel = (device: MediaDeviceInfo, index: number): string =>
    device.label || `${device.kind} ${index + 1}`

  onMount(() => {
    void (async () => {
      const settings = await window.KiwiApi.getSettings()
      savedSettings = settings
      username = settings.username
      foregroundColor = settings.foregroundColor
      backgroundColor = settings.backgroundColor
      language = settings.language || 'en'
      roomServerUrl = settings.roomServerUrl || ''
      cameraDeviceId = settings.cameraDeviceId || ''
      microphoneDeviceId = settings.microphoneDeviceId || ''
      microphoneOnConnect = settings.isMicrophoneEnabledOnConnect
      hardwareVideoAcceleration = settings.hardwareVideoAcceleration
      debugLogsEnabled = settings.debugLogsEnabled
      await refreshDevices()
    })().catch((error) => {
      debugLog.error('settings', 'could not load settings', error)
      toast.show('error', L.settings_save_failed())
    })
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  })

  const save = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    if (!savedSettings || !usernameValid || saving) return
    saving = true
    try {
      const settings: StoredSettings = {
        ...savedSettings,
        username: username.trim(),
        foregroundColor,
        backgroundColor,
        language,
        roomServerUrl: normalizeRoomServer(roomServerUrl),
        cameraDeviceId,
        microphoneDeviceId,
        isMicrophoneEnabledOnConnect: microphoneOnConnect,
        hardwareVideoAcceleration,
        debugLogsEnabled,
        bonjourEnabled: false,
        e2eeEnabled: true,
        mediaE2eeEnabled: true,
      }
      await window.KiwiApi.updateSettings(settings)
      savedSettings = settings
      appState.debugLogsEnabled = debugLogsEnabled
      appState.bonjourEnabled = false
      appState.bonjourVisible = false
      debugLog.setEnabled(debugLogsEnabled)
      toast.show('success', L.settings_saved())
    } catch (error) {
      debugLog.error('settings', 'could not save settings', error)
      toast.show('error', error instanceof Error ? error.message : L.settings_save_failed())
    } finally {
      saving = false
    }
  }
</script>

<div class="settings-page" data-theme="business">
  <div class="settings-shell">
    <aside class="settings-menu">
      <h1>{L.settings()}</h1>
      <a href="#profile"><i class="fa-solid fa-user"></i> {L.basic()}</a>
      <a href="#media"><i class="fa-solid fa-video"></i> {L.media()}</a>
      <a href="#connection"><i class="fa-solid fa-link"></i> {L.room_server_url()}</a>
      <a href="#advanced"><i class="fa-solid fa-sliders"></i> {L.advanced()}</a>
    </aside>

    <form class="settings-content" onsubmit={save}>
      <section id="profile" class="settings-card">
        <h2>{L.basic()}</h2>
        <label class="settings-field">
          <span>{L.username()}</span>
          <input class="input w-full" class:input-error={!usernameValid} bind:value={username} maxlength="31" required />
        </label>
        <div class="color-fields">
          <label class="settings-field">
            <span>{L.foreground_color()}</span>
            <input type="color" bind:value={foregroundColor} aria-label={L.foreground_color()} />
          </label>
          <label class="settings-field">
            <span>{L.background_color()}</span>
            <input type="color" bind:value={backgroundColor} aria-label={L.background_color()} />
          </label>
        </div>
        <label class="settings-field">
          <span>{L.language()}</span>
          <select class="select w-full" bind:value={language}>
            {#each languages as option}<option value={option}>{option}</option>{/each}
          </select>
          <small>{L.language_description()}</small>
        </label>
      </section>

      <section id="media" class="settings-card">
        <h2>{L.media()}</h2>
        <label class="settings-field">
          <span>{L.camera_device()}</span>
          <select class="select w-full" bind:value={cameraDeviceId}>
            <option value="">{L.default_media_device()}</option>
            {#each cameras as device, index (device.deviceId)}
              <option value={device.deviceId}>{deviceLabel(device, index)}</option>
            {/each}
          </select>
        </label>
        <label class="settings-field">
          <span>{L.microphone_device()}</span>
          <select class="select w-full" bind:value={microphoneDeviceId}>
            <option value="">{L.default_media_device()}</option>
            {#each microphones as device, index (device.deviceId)}
              <option value={device.deviceId}>{deviceLabel(device, index)}</option>
            {/each}
          </select>
        </label>
        <label class="settings-toggle">
          <input class="toggle toggle-primary" type="checkbox" bind:checked={microphoneOnConnect} />
          <span>{L.is_microphone_active_on_connect()}</span>
        </label>
      </section>

      <section id="connection" class="settings-card">
        <h2>{L.room_server_url()}</h2>
        <label class="settings-field">
          <span>{L.room_server_url()}</span>
          <input class="input w-full" type="url" bind:value={roomServerUrl} placeholder="https://signal.nyxlink.online" required />
        </label>
      </section>

      <section id="advanced" class="settings-card">
        <h2>{L.advanced()}</h2>
        <label class="settings-toggle">
          <input class="toggle toggle-primary" type="checkbox" bind:checked={debugLogsEnabled} />
          <span>{L.debug_logs()}</span>
        </label>
        {#if isLinux}
          <label class="settings-toggle">
            <input class="toggle toggle-primary" type="checkbox" bind:checked={hardwareVideoAcceleration} />
            <span>{L.hardware_video_acceleration()}</span>
          </label>
        {/if}
      </section>

      <button class="btn btn-primary settings-save" type="submit" disabled={!usernameValid || !savedSettings || saving}>
        {#if saving}<span class="loading loading-spinner loading-sm"></span>{/if}
        {L.save()}
      </button>
    </form>
  </div>
</div>

<style>
  .settings-page { min-height: calc(100vh - 4rem); background: #232428; color: #f2f3f5; }
  .settings-shell { max-width: 72rem; margin: 0 auto; padding: 2rem; display: grid; grid-template-columns: 12rem minmax(0, 1fr); gap: 2rem; }
  .settings-menu { position: sticky; top: 1.5rem; align-self: start; display: flex; flex-direction: column; gap: 0.25rem; }
  .settings-menu h1 { font-size: 1.5rem; font-weight: 750; margin-bottom: 1rem; }
  .settings-menu a { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem; border-radius: 0.6rem; color: #b5bac1; font-size: 0.85rem; }
  .settings-menu a:hover { background: #35373c; color: #fff; }
  .settings-content { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  .settings-card { display: flex; flex-direction: column; gap: 1.1rem; padding: 1.5rem; border: 1px solid #41434a; border-radius: 1rem; background: #2b2d31; scroll-margin-top: 1rem; }
  .settings-card h2 { font-size: 1.1rem; font-weight: 700; }
  .settings-field { display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.85rem; }
  .settings-field small { color: #b5bac1; font-size: 0.75rem; }
  .settings-toggle { display: flex; align-items: center; gap: 0.8rem; font-size: 0.85rem; }
  .color-fields { display: flex; gap: 1.5rem; }
  .color-fields input { width: 3.5rem; height: 2.5rem; border: 0; padding: 0; background: transparent; cursor: pointer; }
  .settings-save { align-self: flex-end; min-width: 8rem; }
  @media (max-width: 700px) {
    .settings-shell { grid-template-columns: 1fr; padding: 1rem; gap: 1rem; }
    .settings-menu { position: static; }
    .settings-menu a { display: none; }
  }
</style>
