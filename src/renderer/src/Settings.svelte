<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import { appState } from './appState.svelte'
  import { debugLog } from './debugLog.svelte'
  import { toast } from './toastState.svelte'
  import { normalizeRoomServer } from './session/roomServer'
  import { cloneForIpc } from './Utils'
  import { isAvatarDataUrl } from '../../shared/avatar'
  import { avatarFromFile } from './profilePhoto'
  type StoredSettings = Awaited<ReturnType<typeof window.KiwiApi.getSettings>>

  let savedSettings = $state<StoredSettings | null>(null)
  let username = $state('')
  let avatar = $state('')
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
      avatar = isAvatarDataUrl(settings.avatar) ? settings.avatar : ''
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
        avatar,
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
      await window.KiwiApi.updateSettings(cloneForIpc(settings))
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

  const chooseAvatar = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      avatar = await avatarFromFile(file)
    } catch {
      toast.show('error', L.profile_photo_invalid())
    } finally {
      input.value = ''
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
        <div class="settings-field">
          <span>{L.profile_photo()}</span>
          <div class="avatar-row">
            {#if avatar}
              <img class="avatar-preview" src={avatar} alt="" />
            {:else}
              <span class="avatar-preview avatar-initial" style:background={backgroundColor} style:color={foregroundColor}>
                {username.trim().charAt(0).toUpperCase() || '?'}
              </span>
            {/if}
            <label class="btn btn-sm settings-photo-button" for="profile-photo-input">{L.choose_photo()}</label>
            <input id="profile-photo-input" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onchange={chooseAvatar} />
            {#if avatar}<button class="btn btn-ghost btn-sm settings-remove-photo" type="button" onclick={() => avatar = ''}>{L.remove_photo()}</button>{/if}
          </div>
        </div>
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
          <input class="settings-switch" type="checkbox" bind:checked={microphoneOnConnect} />
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
          <input class="settings-switch" type="checkbox" bind:checked={debugLogsEnabled} />
          <span>{L.debug_logs()}</span>
        </label>
        {#if isLinux}
          <label class="settings-toggle">
            <input class="settings-switch" type="checkbox" bind:checked={hardwareVideoAcceleration} />
            <span>{L.hardware_video_acceleration()}</span>
          </label>
        {/if}
      </section>

      <button class="btn settings-save" type="submit" disabled={!usernameValid || !savedSettings || saving}>
        {#if saving}<span class="loading loading-spinner loading-sm"></span>{/if}
        {L.save()}
      </button>
    </form>
  </div>
</div>

<style>
  .settings-page { min-height: calc(100vh - 4.9rem); background: radial-gradient(circle at 65% 50%, #16262d, #0c171f 66%); color: #f4f7fa; }
  :global(dialog) .settings-page { min-height: 0; }
  .settings-shell { max-width: 80rem; margin: 0 auto; padding: 1.75rem 1.1rem; display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 1.15rem; }
  .settings-menu { position: sticky; top: 1rem; align-self: start; display: flex; flex-direction: column; gap: 0.3rem; padding: 1.3rem; border: 1px solid #2d404c; border-radius: 1.25rem; background: linear-gradient(135deg, #1a2934, #14212b); }
  .settings-menu h1 { font-size: 1.65rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 0.8rem; }
  .settings-menu a { display: flex; align-items: center; gap: 0.75rem; padding: 0.8rem; border: 1px solid transparent; border-radius: 0.75rem; color: #b7c1ce; font-size: 0.85rem; }
  .settings-menu a:hover, .settings-menu a:focus-visible { border-color: #425563; background: #24333e; color: #f4f7fa; }
  .settings-menu a i { color: #06c7b2; }
  .settings-content { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
  .settings-card { display: flex; flex-direction: column; gap: 1.15rem; padding: clamp(1.25rem, 2vw, 1.9rem); border: 1px solid #2d404c; border-radius: 1.25rem; background: linear-gradient(155deg, #15232d, #101d26); box-shadow: 0 14px 35px #0003; scroll-margin-top: 1rem; }
  .settings-card h2 { padding-bottom: 0.75rem; border-bottom: 1px solid #30434e; font-size: 1.2rem; font-weight: 800; }
  .settings-field { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.87rem; font-weight: 600; }
  .settings-field :global(.input), .settings-field :global(.select) { height: 3.1rem; border: 1px solid #425563; border-radius: 0.8rem; background: #15232d; color: #f4f7fa; font-weight: 400; }
  .settings-field :global(.input:focus), .settings-field :global(.select:focus) { outline: 2px solid #06c7b2; outline-offset: 1px; }
  .settings-field small { color: #aab7c4; font-size: 0.75rem; font-weight: 400; }
  .settings-toggle { display: flex; align-items: center; gap: 0.8rem; font-size: 0.85rem; cursor: pointer; }
  .settings-switch { appearance: none; position: relative; width: 2.8rem; height: 1.5rem; flex: none; border: 1px solid #425563; border-radius: 999px; background: #202f3a; cursor: pointer; transition: background 0.15s; }
  .settings-switch::before { content: ''; position: absolute; top: 0.2rem; left: 0.2rem; width: 1rem; height: 1rem; border-radius: 50%; background: #b7c1ce; transition: transform 0.15s; }
  .settings-switch:checked { border-color: #00c7b4; background: #009d91; }
  .settings-switch:checked::before { transform: translateX(1.25rem); background: white; }
  .settings-switch:focus-visible { outline: 2px solid #06c7b2; outline-offset: 2px; }
  .color-fields { display: flex; flex-wrap: wrap; gap: 1.5rem; }
  .color-fields input { width: 3.5rem; height: 2.5rem; border: 1px solid #425563; border-radius: 0.5rem; padding: 0.15rem; background: #202f3a; cursor: pointer; }
  .avatar-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
  .avatar-preview { width: 3.5rem; height: 3.5rem; flex: none; border: 2px solid #2e5260; border-radius: 50%; object-fit: cover; }
  .avatar-initial { display: grid; place-items: center; font-size: 1.25rem; font-weight: 700; }
  .settings-photo-button { border: 1px solid #425563; border-radius: 0.7rem; background: #24333e; color: #f4f7fa; }
  .settings-photo-button:hover { border-color: #00c7b4; background: #2a3a45; }
  .settings-remove-photo { color: #b7c1ce; }
  .settings-remove-photo:hover { color: #f4f7fa; background: #24333e; }
  .settings-save { align-self: flex-end; min-width: 9rem; min-height: 3.2rem; border: 0; border-radius: 0.8rem; background: linear-gradient(125deg, #0cc9b7, #009d91); color: white; font-weight: 700; }
  .settings-save:hover { filter: brightness(1.12); }
  .settings-save:disabled { opacity: 0.5; cursor: default; filter: none; }
  @media (max-width: 700px) {
    .settings-shell { grid-template-columns: 1fr; padding: 0.8rem; gap: 0.8rem; }
    .settings-menu { position: static; }
    .settings-menu a { display: none; }
  }
</style>
