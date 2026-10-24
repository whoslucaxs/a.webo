import { BrowserWindow, desktopCapturer, ipcMain, session } from 'electron'
import type { DesktopCapturerSource, NativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { browserShareFrame } from './browserShare'

const isWayland =
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY))

// PipeWire ignores this id and opens its own portal session. Passing a real
// source from getSources() would show a second chooser.
const WAYLAND_VIDEO_SOURCE = { id: 'screen:0:0', name: 'Entire Screen' }

export type ScreenShareSource = {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
  isScreen: boolean
}

const SELECT_CHANNEL = 'selectScreenShareSource'
const SELECTED_CHANNEL = 'screenShareSourceSelected'
const PICKER_TIMEOUT_MS = 120000
let pickerRequestId = 0
let selectedWindowId: string | null = null
let windowAudioCapture: { stop: () => void } | null = null
let windowAudioCaptureId = 0

const processIdForWindow = async (sourceId: string): Promise<number> => {
  const handle = /^window:(\d+):\d+$/.exec(sourceId)?.[1]
  if (!handle) throw new Error('Invalid window source')
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WindowPid { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'; [uint32]$windowProcessId = 0; [void][WindowPid]::GetWindowThreadProcessId([IntPtr][long]${handle}, [ref]$windowProcessId); Write-Output $windowProcessId`
  const { stdout } = await promisify(execFile)('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
  ], { timeout: 8000, windowsHide: true })
  const pid = Number(stdout.trim())
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Could not identify the selected application')
  return pid
}

const nativeImageToDataUrl = (image?: NativeImage | null): string | null => {
  if (!image || image.isEmpty()) return null
  return image.toDataURL()
}

const serializeSource = (source: DesktopCapturerSource): ScreenShareSource => {
  const isScreen = source.id.startsWith('screen:') || Boolean(source.display_id)
  return {
    id: source.id,
    name: source.name,
    thumbnail: nativeImageToDataUrl(source.thumbnail) ?? '',
    appIcon: nativeImageToDataUrl(source.appIcon),
    isScreen,
  }
}

const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

const getDesktopSources = async (): Promise<DesktopCapturerSource[]> => {
  await nextTick()
  const screenThumbnails = { width: 320, height: 180 }
  const screens = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: screenThumbnails,
  })

  try {
    const windows = await Promise.race([
      desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 160, height: 90 },
        fetchWindowIcons: true,
      }),
      new Promise<DesktopCapturerSource[]>((resolve) => {
        setTimeout(() => resolve([]), 5000)
      }),
    ])
    return [...screens, ...windows]
  } catch (err) {
    console.error('desktopCapturer.getSources(window) failed', err)
    return screens
  }
}

const respondOnce = (
  callback: (streams: Electron.Streams) => void,
): ((streams: Electron.Streams) => void) => {
  let responded = false
  return (streams): void => {
    if (responded) return
    responded = true
    try {
      callback(streams)
    } catch (err) {
      console.error('setDisplayMediaRequestHandler callback failed', err)
    }
  }
}

const askRendererToPickSource = async (
  win: BrowserWindow,
  sources: ScreenShareSource[],
): Promise<string | null> => {
  if (win.isMinimized()) win.restore()
  const bounds = win.getBounds()
  const minWidth = 680
  const minHeight = 520
  if (bounds.width < minWidth || bounds.height < minHeight) {
    win.setSize(Math.max(bounds.width, minWidth), Math.max(bounds.height, minHeight))
  }
  const wasAlwaysOnTop = win.isAlwaysOnTop()
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.show()
  win.focus()
  win.moveTop()
  if (process.platform === 'win32') {
    win.flashFrame(true)
  }

  const requestId = ++pickerRequestId

  try {
    return await new Promise<string | null>((resolve) => {
      const finish = (sourceId: string | null): void => {
        clearTimeout(timeoutId)
        ipcMain.removeListener(SELECTED_CHANNEL, onSelected)
        resolve(sourceId)
      }
      const onSelected = (
        _event: Electron.IpcMainEvent,
        payload: { requestId: number; sourceId: string | null },
      ): void => {
        if (payload?.requestId !== requestId) return
        finish(payload.sourceId)
      }
      const timeoutId = setTimeout(() => finish(null), PICKER_TIMEOUT_MS)
      ipcMain.on(SELECTED_CHANNEL, onSelected)
      win.webContents.send(SELECT_CHANNEL, { requestId, sources })
    })
  } finally {
    if (process.platform === 'win32') {
      win.flashFrame(false)
    }
    win.setAlwaysOnTop(wasAlwaysOnTop)
  }
}

export const installDisplayMediaHandler = (getMainWindow: () => BrowserWindow): void => {
  getMainWindow().once('closed', () => {
    windowAudioCapture?.stop()
    windowAudioCapture = null
    windowAudioCaptureId++
  })
  ipcMain.removeHandler('window-audio:start')
  ipcMain.handle('window-audio:start', async (event) => {
    if (event.senderFrame !== getMainWindow().webContents.mainFrame) throw new Error('Window audio capture denied')
    if (process.platform !== 'win32' || !selectedWindowId) return 0
    windowAudioCapture?.stop()
    windowAudioCapture = null
    const pid = await processIdForWindow(selectedWindowId)
    const { LoopbackCapture } = require('loopback-capture')
    const capture = new LoopbackCapture()
    const win = getMainWindow()
    const captureId = ++windowAudioCaptureId
    capture.start(pid, true, (chunk: Buffer) => {
      if (captureId === windowAudioCaptureId && !win.isDestroyed()) win.webContents.send('window-audio:packet', captureId, chunk)
    })
    windowAudioCapture = capture
    return captureId
  })
  ipcMain.removeHandler('window-audio:stop')
  ipcMain.handle('window-audio:stop', (event, captureId: number) => {
    if (event.senderFrame !== getMainWindow().webContents.mainFrame) return
    if (captureId !== windowAudioCaptureId) return
    windowAudioCapture?.stop()
    windowAudioCapture = null
    windowAudioCaptureId++
  })
  session.defaultSession.setPermissionCheckHandler(() => true)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })

  const handler = async (
    request: Electron.DisplayMediaRequestHandlerHandlerRequest,
    callback: (streams: Electron.Streams) => void,
  ): Promise<void> => {
    const respond = respondOnce(callback)
    try {
      const frame = request.frame === getMainWindow().webContents.mainFrame ? browserShareFrame() : null
      if (frame && request.frame === getMainWindow().webContents.mainFrame) {
        respond({ video: frame, audio: frame, enableLocalEcho: true })
        return
      }
      if (isWayland) {
        respond({ video: WAYLAND_VIDEO_SOURCE })
        return
      }
      const capturerSources = await getDesktopSources()
      const win = getMainWindow()
      if (!win || win.isDestroyed()) {
        respond({})
        return
      }

      const selectedId = await askRendererToPickSource(win, capturerSources.map(serializeSource))
      const selected = capturerSources.find((source) => source.id === selectedId)
      if (!selected) {
        respond({})
        return
      }
      const isScreen = selected.id.startsWith('screen:') || Boolean(selected.display_id)
      selectedWindowId = process.platform === 'win32' && !isScreen ? selected.id : null
      respond({ video: selected, audio: process.platform === 'win32' && !selectedWindowId && request.audioRequested ? 'loopback' : undefined })
    } catch (err) {
      console.error('display media request failed', err)
      respond({})
    }
  }

  session.defaultSession.setDisplayMediaRequestHandler(handler)
}
