import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/update'
import { isBelowMinimumVersion } from './updatePolicy'

const RELEASES_URL = 'https://github.com/whoslucaxs/a.webo/releases/latest'
const POLICY_URL = 'https://raw.githubusercontent.com/whoslucaxs/a.webo/main/update-policy.json'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function registerUpdates(getWindow: () => BrowserWindow | null): void {
  const manual = process.platform === 'win32'
    ? Boolean(process.env.PORTABLE_EXECUTABLE_FILE)
    : process.platform !== 'linux' || !process.env.APPIMAGE
  let state: UpdateState = {
    status: 'idle',
    currentVersion: app.getVersion(),
    mandatory: false,
    manual,
  }
  let checking: Promise<void> | null = null
  let minimumVersion: unknown

  const publish = (next: Partial<UpdateState>): void => {
    state = { ...state, ...next }
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('updates:state', state)
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('update-available', (info) => {
    publish({ status: 'available', latestVersion: info.version, error: undefined })
  })
  autoUpdater.on('update-not-available', () => {
    publish({ status: 'idle', latestVersion: undefined, mandatory: false, error: undefined })
  })
  autoUpdater.on('download-progress', ({ percent }) => {
    publish({ status: 'downloading', progress: Math.round(percent) })
  })
  autoUpdater.on('update-downloaded', () => {
    publish({ status: 'ready', progress: 100 })
  })
  autoUpdater.on('error', (error) => {
    publish({ status: 'error', error: error.message })
  })

  const check = (showError = false): Promise<void> => {
    if (checking) return checking
    checking = (async () => {
      if (!app.isPackaged) {
        publish({ status: 'error', error: 'Update checks are available in packaged builds.' })
        return
      }
      if (state.status === 'downloading' || state.status === 'ready') return
      publish({ status: 'checking', error: undefined })
      try {
        try {
          const response = await net.fetch(POLICY_URL, { signal: AbortSignal.timeout(10000) })
          if (response.ok) minimumVersion = (await response.json()).minimumVersion
        } catch {
          // A missing policy never blocks someone from using the app offline.
        }
        const result = await autoUpdater.checkForUpdates()
        if (result?.updateInfo && state.status === 'available') {
          publish({ mandatory: isBelowMinimumVersion(app.getVersion(), minimumVersion) })
        }
      } catch (error) {
        publish({ status: showError ? 'error' : 'idle', error: showError ? String(error) : undefined })
      }
    })().finally(() => { checking = null })
    return checking
  }

  ipcMain.handle('updates:state', () => state)
  ipcMain.handle('updates:check', () => check(true))
  ipcMain.handle('updates:install', async () => {
    if (!['available', 'ready', 'error'].includes(state.status) || !state.latestVersion) return
    if (manual || state.status === 'error') {
      await shell.openExternal(RELEASES_URL)
      return
    }
    if (state.status === 'ready') {
      autoUpdater.quitAndInstall()
      return
    }
    try {
      publish({ status: 'downloading', progress: 0, error: undefined })
      await autoUpdater.downloadUpdate()
    } catch (error) {
      publish({ status: 'error', error: String(error) })
    }
  })

  const startup = setTimeout(() => void check(), 10000)
  startup.unref()
  const periodic = setInterval(() => void check(), CHECK_INTERVAL_MS)
  periodic.unref()
}
