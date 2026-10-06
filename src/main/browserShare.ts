import { BrowserWindow, ipcMain, session, webContents } from 'electron'
import type { WebContents } from 'electron'

let browser: WebContents | null = null
let armedUntil = 0
const INITIAL_PAGE = 'data:text/html,%3Cbody%20style%3D%22background%3A%23101d26%22%3E%3C%2Fbody%3E'

const parseUrl = (input: string): string => {
  if (typeof input !== 'string') throw new Error('Invalid browser link')
  const url = new URL(input.includes('://') ? input : `https://${input}`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS links are supported')
  if (url.username || url.password) throw new Error('Links with credentials are not supported')
  return url.href
}

export const browserShareFrame = (): Electron.WebFrameMain | null => {
  if (Date.now() > armedUntil || !browser || browser.isDestroyed()) return null
  armedUntil = 0
  return browser.mainFrame
}

export const registerBrowserShare = (main: BrowserWindow): void => {
  ipcMain.removeAllListeners('browser-share:prepare')
  ipcMain.removeHandler('browser-share:open')
  ipcMain.removeHandler('browser-share:close')
  const browserSession = session.fromPartition('browser-share')
  browserSession.setPermissionCheckHandler(() => false)
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  main.webContents.on('will-attach-webview', (event, preferences, params) => {
    if (params.partition !== 'browser-share' || params.src !== INITIAL_PAGE) {
      event.preventDefault()
      return
    }
    delete preferences.preload
    preferences.nodeIntegration = false
    preferences.contextIsolation = true
    preferences.sandbox = true
    preferences.webSecurity = true
  })
  main.webContents.on('did-attach-webview', (_event, guest) => {
    if (guest.session !== browserSession) return
    browser = guest
    guest.setWindowOpenHandler(({ url }) => {
      try {
        void guest.loadURL(parseUrl(url)).catch(() => undefined)
      } catch {
        // Unsupported links stay in the current page.
      }
      return { action: 'deny' }
    })
    guest.on('will-navigate', (event, url) => {
      try { parseUrl(url) } catch { event.preventDefault() }
    })
    guest.on('destroyed', () => {
      if (browser === guest) browser = null
      armedUntil = 0
      if (!main.isDestroyed()) main.webContents.send('browser-share:closed')
    })
  })

  const ownedBrowser = (sender: WebContents, id: number): WebContents => {
    const guest = webContents.fromId(id)
    if (sender !== main.webContents || !guest || guest !== browser ||
      guest.getType() !== 'webview' || guest.hostWebContents !== main.webContents ||
      guest.session !== browserSession) throw new Error('Browser frame is not ready')
    return guest
  }
  ipcMain.on('browser-share:prepare', (event, id: number, input: string) => {
    try {
      ownedBrowser(event.sender, id)
      const url = parseUrl(input)
      armedUntil = Date.now() + 5000
      event.returnValue = { url }
    } catch (error) {
      event.returnValue = { error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('browser-share:open', async (event, id: number, input: string) => {
    const guest = ownedBrowser(event.sender, id)
    const url = parseUrl(input)
    // Sites may immediately start another navigation; Electron rejects this promise with
    // ERR_ABORTED even when the replacement page loads successfully.
    void guest.loadURL(url).catch((error) => {
      if (!String(error).includes('ERR_ABORTED')) console.error('browser page load failed', error)
    })
    return url
  })
  ipcMain.handle('browser-share:close', (event) => {
    if (event.sender !== main.webContents) return
    armedUntil = 0
  })
}
