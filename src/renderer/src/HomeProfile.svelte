<script lang="ts">
  import { onMount } from 'svelte'
  import { L } from './translations'
  import { toast } from './toastState.svelte'
  import { cloneForIpc } from './Utils'
  import { isAvatarDataUrl } from '../../shared/avatar'
  import { avatarFromFile } from './profilePhoto'

  let username = $state('')
  let avatar = $state('')
  let backgroundColor = $state('#0099ff')
  let foregroundColor = $state('#ffffff')
  let saving = $state(false)
  const valid = $derived(username.trim().length > 0 && username.trim().length < 32)

  onMount(async () => {
    const settings = await window.KiwiApi.getSettings()
    username = settings.username
    avatar = isAvatarDataUrl(settings.avatar) ? settings.avatar : ''
    backgroundColor = settings.backgroundColor
    foregroundColor = settings.foregroundColor
  })

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

  const save = async (): Promise<void> => {
    if (!valid || saving) return
    saving = true
    try {
      const settings = await window.KiwiApi.getSettings()
      await window.KiwiApi.updateSettings(cloneForIpc({ ...settings, username: username.trim(), avatar }))
      toast.show('success', L.settings_saved())
    } catch {
      toast.show('error', L.settings_save_failed())
    } finally {
      saving = false
    }
  }
</script>

<aside class="profile-panel">
  <div class="profile-summary">
    <div class="profile-avatar-wrap">
      {#if avatar}
        <img class="profile-avatar" src={avatar} alt="" />
      {:else}
        <span class="profile-avatar profile-avatar-initial" style:background={backgroundColor} style:color={foregroundColor}>{username.trim().charAt(0).toUpperCase() || '?'}</span>
      {/if}
    </div>
    <div class="profile-summary-copy"><strong>{username || L.username()}</strong><span>{L.basic()}</span></div>
    <label class="profile-camera" for="home-profile-photo" aria-label={L.choose_photo()} title={L.choose_photo()}><i class="fa-solid fa-camera"></i></label>
  </div>
  <input id="home-profile-photo" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onchange={chooseAvatar} />
  <label class="profile-name-field"><span>{L.username()}</span><input class="input" bind:value={username} maxlength="31" /></label>
  <button class="profile-save" disabled={!valid || saving} onclick={save}>{L.save_profile()}</button>
</aside>
