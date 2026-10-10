import { expect, it, vi } from 'vitest'
import { Room } from './room.svelte'
import type { PeerLink } from './peerLink'
import type { ControlMessage } from './controlProtocol'

it('shows local and remote cameras alongside an existing screen share', () => {
  const room = new Room()
  const local = { id: 'local' } as MediaStream
  const remote = { id: 'remote' } as MediaStream
  const screen = { id: 'screen' } as MediaStream
  const internals = room as unknown as {
    cameraStream: MediaStream
    remoteCameraStreams: Map<string, MediaStream>
    remoteCameraState: Map<string, { enabled: boolean; streamId: string }>
    syncCallOverlay: () => void
  }

  room.localPeerId = 'local'
  room.screenShares = [{ peerId: 'remote', name: 'Alex', stream: screen }]
  internals.cameraStream = local
  internals.remoteCameraStreams.set('remote', remote)
  internals.remoteCameraState.set('remote', { enabled: true, streamId: 'remote' })
  internals.syncCallOverlay()

  expect(room.cameraShares.map(({ peerId, stream }) => [peerId, stream.id])).toEqual([
    ['local', 'local'],
    ['remote', 'remote'],
  ])
  expect(room.screenShares).toEqual([{ peerId: 'remote', name: 'Alex', stream: screen }])

  internals.remoteCameraState.set('remote', { enabled: false, streamId: '' })
  internals.syncCallOverlay()
  expect(room.cameraShares.map(({ peerId }) => peerId)).toEqual(['local'])
})

it('sends screen video only to viewers who requested it', async () => {
  const room = new Room()
  const track = { kind: 'video' } as MediaStreamTrack
  const stream = { id: 'screen', getVideoTracks: () => [track] } as MediaStream
  const setDisplayTrack = vi.fn(async () => undefined)
  const applyDisplayProfile = vi.fn(async () => true)
  const link = { remotePeerId: 'viewer', setDisplayTrack, applyDisplayProfile } as unknown as PeerLink
  const internals = room as unknown as {
    displayStream: MediaStream
    addLocalMediaToLink: (link: PeerLink) => Promise<void>
    onScreenWatch: (link: PeerLink, watching: boolean) => Promise<void>
    pushVideoToAll: (track: MediaStreamTrack, stream: MediaStream) => Promise<void>
  }
  internals.displayStream = stream
  room.displayStreamActive = true

  await internals.addLocalMediaToLink(link)
  await internals.pushVideoToAll(track, stream)
  expect(setDisplayTrack).not.toHaveBeenCalled()

  await internals.onScreenWatch(link, true)
  expect(setDisplayTrack).toHaveBeenCalledWith(track, stream)
  expect(applyDisplayProfile).toHaveBeenCalledWith(expect.objectContaining({
    maxHeight: 720, maxFramerate: 30, maxBitrate: 1_500_000,
  }))
  await internals.onScreenWatch(link, false)
  expect(setDisplayTrack).toHaveBeenLastCalledWith(null, null)
  setDisplayTrack.mockClear()
  await internals.pushVideoToAll(track, stream)
  expect(setDisplayTrack).not.toHaveBeenCalled()
})

it('opens a browser page without capturing audio when the option is off', async () => {
  const room = new Room()
  room.localPeerId = 'local'
  const video = { kind: 'video', stop: vi.fn() } as unknown as MediaStreamTrack
  const stream = {
    id: 'browser',
    getVideoTracks: () => [video],
    getAudioTracks: () => [],
    getTracks: () => [video],
  } as MediaStream
  const getDisplayMedia = vi.fn(async () => stream)
  const openBrowserShare = vi.fn(async () => 'https://example.com')
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } })
  vi.stubGlobal('window', { KiwiApi: {
    prepareBrowserShare: () => 'https://example.com',
    openBrowserShare,
    closeBrowserShare: vi.fn(async () => undefined),
  } })
  try {
    await room.openBrowser('https://example.com', 7, false)
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false })
    expect(room.browserActive).toBe(true)
    expect(openBrowserShare).toHaveBeenCalledWith(7, 'https://example.com')
    await room.stopBrowser()
    expect(video.stop).toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('plays watched screen audio separately from microphone audio and stops it on unwatch', () => {
  const room = new Room()
  const audioElements: Array<{ srcObject: MediaStream | null; play: ReturnType<typeof vi.fn> }> = []
  vi.stubGlobal('document', {
    createElement: () => {
      const audio = { srcObject: null, style: {}, setAttribute: vi.fn(), play: vi.fn(async () => undefined), remove: vi.fn() }
      audioElements.push(audio)
      return audio
    },
    body: { appendChild: vi.fn() },
  })
  try {
    const internals = room as unknown as {
      remoteDisplayStreamIds: Map<string, string>
      remoteAudioElements: Map<string, { srcObject: MediaStream | null }>
      attachRemoteAudio: (peerId: string, stream: MediaStream) => void
      sendTo: () => boolean
    }
    internals.sendTo = () => true
    internals.remoteDisplayStreamIds.set('viewer', 'display')
    const microphone = { id: 'mic', getVideoTracks: () => [] } as unknown as MediaStream
    const display = { id: 'display', getVideoTracks: () => [{}] } as unknown as MediaStream
    room.watchingScreens = ['viewer']
    internals.attachRemoteAudio('viewer', microphone)
    internals.attachRemoteAudio('viewer', display)
    expect(audioElements).toHaveLength(2)
    expect(internals.remoteAudioElements.get('viewer')?.srcObject).toBe(microphone)
    expect(internals.remoteAudioElements.get('viewer:screen')?.srcObject).toBe(display)
    room.watchScreen('viewer', false)
    expect(internals.remoteAudioElements.get('viewer:screen')?.srcObject).toBeNull()
    expect(internals.remoteAudioElements.get('viewer')?.srcObject).toBe(microphone)
    room.watchingScreens = ['viewer']
    internals.attachRemoteAudio('viewer', display)
    internals.sendTo = () => false
    room.watchScreen('viewer', false)
    expect(internals.remoteAudioElements.get('viewer:screen')?.srcObject).toBeNull()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('reannounces active media after a returning peer joins the encrypted group', async () => {
  const room = new Room()
  const sent: ControlMessage[] = []
  const internals = room as unknown as {
    crypto: {
      isReady: () => boolean
      leafOf: () => undefined
      decodeKeyPackage: () => object
      addMember: () => Promise<{ welcome: Uint8Array; commit: Uint8Array }>
      epoch: number
    }
    displayStream: MediaStream
    browserStream: MediaStream
    cameraSendStreamId: string
    refreshVerification: () => void
    sendMlsFrame: () => void
    broadcastMls: () => void
    activateMediaE2ee: () => Promise<void>
    flushAfterMls: () => Promise<void>
    sendEncrypted: (_link: PeerLink, msg: ControlMessage) => Promise<void>
    commitAdd: (link: PeerLink, peerId: string, keyPackage: Uint8Array) => Promise<void>
  }
  room.localPeerId = 'new-host'
  room.displayStreamActive = true
  room.browserActive = true
  room.cameraActive = true
  internals.displayStream = { id: 'screen' } as MediaStream
  internals.browserStream = { id: 'browser' } as MediaStream
  internals.cameraSendStreamId = 'camera'
  internals.crypto = {
    isReady: () => true,
    leafOf: () => undefined,
    decodeKeyPackage: () => ({}),
    addMember: async () => ({ welcome: new Uint8Array([1]), commit: new Uint8Array([2]) }),
    epoch: 2,
  }
  internals.refreshVerification = vi.fn()
  internals.sendMlsFrame = vi.fn()
  internals.broadcastMls = vi.fn()
  internals.activateMediaE2ee = vi.fn(async () => undefined)
  internals.flushAfterMls = vi.fn(async () => undefined)
  internals.sendEncrypted = vi.fn(async (_link, msg) => { sent.push(msg) })

  await internals.commitAdd({} as PeerLink, 'returning-peer', new Uint8Array([3]))

  expect(sent).toMatchObject([
    { t: 'display-state', active: true, streamId: 'screen' },
    { t: 'browser-state', active: true, streamId: 'browser' },
    { t: 'camera-state', enabled: true, streamId: 'camera' },
  ])

  const returning = new Room()
  returning.peers = [{ id: 'new-host', username: 'Alex', foregroundColor: '#fff', backgroundColor: '#000' }]
  const receiver = returning as unknown as {
    onDisplayState: (msg: Extract<ControlMessage, { t: 'display-state' }>) => void
    onBrowserState: (msg: Extract<ControlMessage, { t: 'browser-state' }>) => void
  }
  receiver.onDisplayState(sent[0] as Extract<ControlMessage, { t: 'display-state' }>)
  receiver.onBrowserState(sent[1] as Extract<ControlMessage, { t: 'browser-state' }>)
  expect(returning.availableScreens).toEqual([{ peerId: 'new-host', name: 'Alex' }])
  expect(returning.availableBrowsers).toEqual([{ peerId: 'new-host', name: 'Alex' }])
})
