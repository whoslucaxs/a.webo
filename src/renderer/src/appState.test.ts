import { describe, expect, it } from 'vitest'
import { appState } from './appState.svelte'

describe('appState', () => {
  it('starts on the home view', () => {
    expect(appState.activeView).toBe('home')
    expect(appState.navigationEnabled).toBe(true)
    expect(appState.isHosting).toBe(false)
    expect(appState.isWatching).toBe(false)
    expect(appState.isCoordinator).toBe(false)
  })

  it('updates view and session flags', () => {
    appState.activeView = 'settings'
    appState.isHosting = true
    appState.navigationEnabled = false
    appState.hostUrl = 'kiwi://host?username=Kiwi&token=abc'

    expect(appState.activeView).toBe('settings')
    expect(appState.isHosting).toBe(true)
    expect(appState.navigationEnabled).toBe(false)
    expect(appState.hostUrl).toContain('kiwi://')

    appState.activeView = 'home'
    appState.isHosting = false
    appState.navigationEnabled = true
    appState.hostUrl = ''
  })

  it('hides bonjour until enabled', () => {
    expect(appState.bonjourEnabled).toBe(false)
    appState.bonjourEnabled = true
    expect(appState.bonjourEnabled).toBe(true)
    appState.bonjourEnabled = false
  })
})
