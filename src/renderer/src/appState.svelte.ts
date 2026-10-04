import type { ViewName } from './types'

export type SessionSource = 'host' | 'join' | 'channel' | 'bonjour'

class AppState {
  activeView = $state<ViewName>('home')
  navigationEnabled = $state(true)
  isHosting = $state(false)
  isWatching = $state(false)
  isCoordinator = $state(false)
  debugLogsEnabled = $state(false)
  bonjourEnabled = $state(false)
  bonjourVisible = $state(false)
  hostUrl = $state('')
  roomLink = $state('')
  sessionTitle = $state('')
  sessionDescription = $state('')
  sessionExpiresAt = $state<number | null>(null)
  participantUrl = $state('')
  sessionSource = $state<SessionSource | null>(null)
  private sessionReset: (() => void) | null = null

  beginSession(source: SessionSource, reset: () => void): void {
    this.sessionSource = source
    this.sessionReset = reset
  }

  clearSession(): void {
    this.sessionSource = null
    this.sessionReset = null
    this.sessionExpiresAt = null
  }

  resetSession(): void {
    this.sessionReset?.()
  }
}

export const appState = new AppState()
