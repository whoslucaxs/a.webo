import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PeerLink } from './peerLink'
import { CAMERA_PROFILES, SCREEN_PROFILES, AUDIO_PROFILE } from './adaptive/qualityProfiles'
import { ICE_GATHERING_TIMEOUT_MS } from './constants'

class MockDataChannel {
  label: string
  readyState = 'connecting'
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  onmessage: ((e: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onbufferedamountlow: (() => void) | null = null
  send = vi.fn()
  constructor(label: string) {
    this.label = label
  }
}

const createSender = (track: MediaStreamTrack) => {
  const params: RTCRtpSendParameters = {
    encodings: [{ maxBitrate: 0, active: true, scaleResolutionDownBy: 1 }],
    transactionId: 't',
    codecs: [],
    headerExtensions: [],
    rtcp: {},
  }
  const sender = {
    track,
    replaceTrack: vi.fn(async (next: MediaStreamTrack | null) => {
      sender.track = next
    }),
    getParameters: vi.fn(() => params),
    setParameters: vi.fn(async (next: RTCRtpSendParameters) => {
      params.encodings = next.encodings
      params.degradationPreference = next.degradationPreference
    }),
  }
  return sender
}

class MockRTCPeerConnection {
  localDescription: RTCSessionDescriptionInit | null = null
  iceGatheringState = 'complete'
  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  ondatachannel: ((e: RTCDataChannelEvent) => void) | null = null
  ontrack: ((e: RTCTrackEvent) => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  onnegotiationneeded: (() => void) | null = null
  private senders: Array<ReturnType<typeof createSender>> = []

  createDataChannel = vi.fn(
    (label: string, _opts?: RTCDataChannelInit) => new MockDataChannel(label),
  )
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'v=0' }))
  createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'v=0' }))
  setLocalDescription = vi.fn(async (desc?: RTCSessionDescriptionInit) => {
    if (desc) this.localDescription = desc
  })
  setRemoteDescription = vi.fn(async (_desc?: RTCSessionDescriptionInit) => undefined)
  addTrack = vi.fn((track: MediaStreamTrack, _stream: MediaStream) => {
    const sender = createSender(track)
    this.senders.push(sender)
    return sender
  })
  getSenders = vi.fn(() => this.senders)
  getTransceivers = vi.fn(() => [])
  getStats = vi.fn(async () => ({
    forEach: () => undefined,
  }))
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  addIceCandidate = vi.fn(async () => undefined)
  close = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
})

const events = {
  onControl: vi.fn(),
  onTrack: vi.fn(),
  onIceConnectionStateChange: vi.fn(),
  onConnectionStateChange: vi.fn(),
  onControlOpen: vi.fn(),
  onNegotiationOffer: vi.fn(),
}

describe('PeerLink video senders', () => {
  it('prefers AV1 and keeps other supported codecs as fallback', async () => {
    const codecs = ['video/VP8', 'video/H264', 'video/AV1', 'video/VP9'].map((mimeType) => ({ mimeType, clockRate: 90_000 }))
    vi.stubGlobal('RTCRtpSender', { getCapabilities: () => ({ codecs, headerExtensions: [] }) })
    try {
      for (const [chosen, first] of [['AV1', 'video/AV1'], ['VP8', 'video/VP8']] as const) {
        const link = new PeerLink({ rtcConfig: { iceServers: [] }, localPeerId: 'local', pendingId: 'pending', isOfferer: true, videoCodec: chosen, events })
        const preferences = vi.fn()
        const pc = link.pc as unknown as MockRTCPeerConnection
        pc.getTransceivers.mockImplementation(() => [{ sender: pc.getSenders()[0], setCodecPreferences: preferences }])
        await link.setDisplayTrack({ id: 'screen', kind: 'video' } as MediaStreamTrack, { id: 'screen' } as MediaStream)
        expect(preferences.mock.calls[0][0][0].mimeType).toBe(first)
        expect(preferences.mock.calls[0][0]).toHaveLength(4)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('sends screen audio only while the display is watched, independently of the microphone', async () => {
    const link = new PeerLink({ rtcConfig: { iceServers: [] }, localPeerId: 'local', pendingId: 'pending', isOfferer: true, events })
    const microphone = { id: 'mic', kind: 'audio' } as MediaStreamTrack
    const video = { id: 'display-video', kind: 'video' } as MediaStreamTrack
    const audio = { id: 'display-audio', kind: 'audio' } as MediaStreamTrack
    const stream = { id: 'display', getAudioTracks: () => [audio] } as unknown as MediaStream
    link.addTrack(microphone, { id: 'microphone' } as MediaStream)

    await link.setDisplayTrack(video, stream)
    expect(link.pc.getSenders().map((sender) => sender.track)).toEqual([microphone, video, audio])
    await link.setDisplayTrack(null, null)
    expect(link.pc.getSenders().map((sender) => sender.track)).toEqual([microphone, null, null])
    await link.setDisplayTrack(video, stream)
    expect(link.pc.getSenders().map((sender) => sender.track)).toEqual([microphone, video, audio])
  })

  it('keeps browser audio off the compressed RTP sender and sends PCM only over its data channel', async () => {
    const link = new PeerLink({ rtcConfig: { iceServers: [] }, localPeerId: 'local', pendingId: 'pending', isOfferer: true, events })
    const microphone = { id: 'mic', kind: 'audio' } as MediaStreamTrack
    const video = { id: 'browser-video', kind: 'video' } as MediaStreamTrack
    const audio = { id: 'browser-audio', kind: 'audio' } as MediaStreamTrack
    const stream = { id: 'browser', getVideoTracks: () => [video], getAudioTracks: () => [audio] } as unknown as MediaStream
    link.addTrack(microphone, { id: 'microphone' } as MediaStream)
    expect(link.pc.getSenders()).toHaveLength(1)
    const pcm = (link.pc.createDataChannel as ReturnType<typeof vi.fn>).mock.results[2].value as MockDataChannel
    pcm.readyState = 'open'
    pcm.onmessage?.({ data: 'ready' } as MessageEvent)
    await link.setBrowserStream(stream)
    expect(link.pc.getSenders().map((sender) => sender.track)).toEqual([microphone, video])
    expect(link.pc.getSenders()[0].getParameters().encodings[0].maxBitrate).toBe(0)
    expect(pcm.label).toBe('browser-pcm')
    const packet = new ArrayBuffer(16)
    expect(link.sendBrowserPcm(packet)).toBe(true)
    expect(pcm.send).toHaveBeenCalledWith(packet)
    pcm.bufferedAmount = 65 * 1024
    expect(link.sendBrowserPcm(packet)).toBe(false)
    await link.setBrowserStream(null)
    expect(link.pc.getSenders().map((sender) => sender.track)).toEqual([microphone, null])
  })
  it('keeps Opus audio for older clients without the PCM handshake', async () => {
    const link = new PeerLink({ rtcConfig: { iceServers: [] }, localPeerId: 'local', pendingId: 'pending', isOfferer: true, events })
    const video = { id: 'browser-video', kind: 'video' } as MediaStreamTrack
    const audio = { id: 'browser-audio', kind: 'audio' } as MediaStreamTrack
    const stream = { id: 'browser', getVideoTracks: () => [video], getAudioTracks: () => [audio] } as unknown as MediaStream
    await link.setBrowserStream(stream)
    expect(link.pc.getSenders().map((sender) => sender.track)).toEqual([video, audio])
    expect(link.pc.getSenders()[1].getParameters().encodings[0].maxBitrate).toBe(320_000)
    const pcm = (link.pc.createDataChannel as ReturnType<typeof vi.fn>).mock.results[2].value as MockDataChannel
    pcm.onmessage?.({ data: 'ready' } as MessageEvent)
    await link.setBrowserStream(stream)
    expect(link.pc.getSenders()[1].track).toBe(null)
  })
  it('keeps display and camera tracks on separate senders', async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events,
    })
    const display = { id: 'display', kind: 'video' } as MediaStreamTrack
    const camera = { id: 'camera', kind: 'video' } as MediaStreamTrack
    const other = { id: 'other', kind: 'video' } as MediaStreamTrack
    const stream = { id: 's' } as MediaStream

    await link.setVideoTrack(display, stream)
    await link.setCameraTrack(camera, stream)
    const senders = link.pc.getSenders()
    expect(senders).toHaveLength(2)
    expect(senders[0].track).toBe(display)
    expect(senders[1].track).toBe(camera)

    await link.setVideoTrack(other, stream)
    expect(link.pc.getSenders()[0].track).toBe(other)
    expect(link.pc.getSenders()[1].track).toBe(camera)
    expect(senders[0].replaceTrack).toHaveBeenCalledWith(other)
    expect(senders[1].replaceTrack).not.toHaveBeenCalled()
  })

  it('stops sending after a rapid watch then stop', async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events,
    })
    const stream = { id: 'screen' } as MediaStream
    const firstTrack = { id: 'first', kind: 'video' } as MediaStreamTrack
    const nextTrack = { id: 'next', kind: 'video' } as MediaStreamTrack
    await link.setDisplayTrack(firstTrack, stream)
    const sender = link.pc.getSenders()[0] as unknown as {
      track: MediaStreamTrack | null
      replaceTrack: (track: MediaStreamTrack | null) => Promise<void>
    }
    let release!: () => void
    const gate = new Promise<void>((resolve) => release = resolve)
    sender.replaceTrack = vi.fn(async (track: MediaStreamTrack | null) => {
      if (track === nextTrack) await gate
      sender.track = track
    })

    const watch = link.setDisplayTrack(nextTrack, stream)
    const stop = link.setDisplayTrack(null, null)
    await vi.waitFor(() => expect(sender.replaceTrack).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([watch, stop])
    expect(sender.track).toBeNull()
  })

  it('applies media e2ee to remembered senders after setMediaE2ee', async () => {
    const attachSender = vi.fn(async () => undefined)
    const attachReceiver = vi.fn(async () => undefined)
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events,
    })
    const display = { id: 'display', kind: 'video' } as MediaStreamTrack
    const stream = { id: 's' } as MediaStream
    await link.setDisplayTrack(display, stream)
    expect(attachSender).not.toHaveBeenCalled()
    link.setMediaE2ee({ attachSender, attachReceiver } as never)
    await link.applyMediaE2ee()
    expect(attachSender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sender: 'local',
        kind: 'screen',
        streamId: 's',
      }),
    )
  })

  it('holds senders instead of sending plaintext when media e2ee is required', async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      requireMediaE2ee: true,
      events,
    })
    const display = { id: 'display', kind: 'video', enabled: true } as MediaStreamTrack
    const stream = { id: 's' } as MediaStream
    await link.setDisplayTrack(display, stream)
    expect(display.enabled).toBe(false)
    const attachSender = vi.fn(async () => undefined)
    link.setMediaE2ee({ attachSender, attachReceiver: vi.fn() } as never)
    await link.applyMediaE2ee()
    expect(attachSender).toHaveBeenCalled()
    expect(display.enabled).toBe(true)
  })

  it('emits trickle ICE candidates when wired', () => {
    const onIceCandidate = vi.fn()
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events: { ...events, onIceCandidate },
    })
    const pc = link.pc as unknown as { onicecandidate: ((e: { candidate: null }) => void) | null }
    pc.onicecandidate?.({ candidate: null })
    expect(onIceCandidate).toHaveBeenCalledWith(null)
  })

  it('creates signaling and browser PCM channels', () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events,
    })
    const pc = link.pc as unknown as MockRTCPeerConnection
    expect(pc.createDataChannel.mock.calls.map((call) => call[0])).toEqual(['control', 'mls', 'browser-pcm'])
  })
})

describe('PeerLink adaptive profiles', () => {
  const openLink = async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events,
    })
    const display = {
      id: 'display',
      kind: 'video',
      getSettings: () => ({ height: 2160 }),
    } as MediaStreamTrack
    const camera = {
      id: 'camera',
      kind: 'video',
      getSettings: () => ({ height: 720 }),
    } as MediaStreamTrack
    const audio = { id: 'audio', kind: 'audio' } as MediaStreamTrack
    const stream = { id: 's' } as MediaStream
    await link.setDisplayTrack(display, stream)
    await link.setCameraTrack(camera, stream)
    link.addTrack(audio, stream)
    return link
  }

  it('applies screen and camera profiles via setParameters without replaceTrack', async () => {
    const link = await openLink()
    const senders = link.getAdaptiveSenders()
    const displayReplace = senders.display?.replaceTrack as ReturnType<typeof vi.fn>
    await expect(link.applyDisplayProfile(SCREEN_PROFILES.medium)).resolves.toBe(true)
    await expect(link.applyCameraProfile(CAMERA_PROFILES.low)).resolves.toBe(true)
    await expect(link.applyAudioProfile(AUDIO_PROFILE)).resolves.toBe(true)
    expect(senders.display?.setParameters).toHaveBeenCalled()
    expect(senders.camera?.setParameters).toHaveBeenCalled()
    expect(senders.audio?.setParameters).toHaveBeenCalled()
    const displayParams = senders.display?.getParameters()
    expect(displayParams?.encodings[0].maxBitrate).toBe(SCREEN_PROFILES.medium.maxBitrate)
    expect(displayParams?.encodings[0].maxFramerate).toBe(SCREEN_PROFILES.medium.maxFramerate)
    expect(displayParams?.encodings[0].scaleResolutionDownBy).toBe(2)
    expect(displayParams?.degradationPreference).toBe('maintain-resolution')
    expect(senders.camera?.getParameters().encodings[0].active).toBe(true)
    await link.setCameraTransportEnabled(false)
    expect(senders.camera?.getParameters().encodings[0].active).toBe(false)
    expect(displayReplace).not.toHaveBeenCalled()
  })

  it('catches setParameters failure and keeps the call usable', async () => {
    const link = await openLink()
    const sender = link.getAdaptiveSenders().display
    sender!.setParameters = vi.fn(async () => {
      throw new Error('invalid modification')
    })
    await expect(link.applyDisplayProfile(SCREEN_PROFILES.low)).resolves.toBe(false)
    expect(link.connectionState).toBe('new')
  })

  it('does not re-attach E2EE when only RTP parameters change', async () => {
    const attachSender = vi.fn(async () => undefined)
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      events,
    })
    const display = {
      id: 'display',
      kind: 'video',
      getSettings: () => ({ height: 1080 }),
    } as MediaStreamTrack
    const stream = { id: 's' } as MediaStream
    await link.setDisplayTrack(display, stream)
    link.setMediaE2ee({ attachSender, attachReceiver: vi.fn() } as never)
    await link.applyMediaE2ee()
    expect(attachSender).toHaveBeenCalledTimes(1)
    const sender = link.getAdaptiveSenders().display
    await link.applyDisplayProfile(SCREEN_PROFILES.high)
    expect(attachSender).toHaveBeenCalledTimes(1)
    expect(sender).toBe(link.getAdaptiveSenders().display)
  })
})

describe('PeerLink ICE diagnostics', () => {
  it('uses an available TURN relay without waiting for ICE gathering to finish', async () => {
    const link = new PeerLink({ rtcConfig: { iceServers: [] }, localPeerId: 'local', pendingId: 'pending', isOfferer: true, events })
    const pc = link.pc as unknown as MockRTCPeerConnection
    pc.iceGatheringState = 'gathering'
    pc.localDescription = { type: 'offer', sdp: 'v=0\r\n' }
    const pending = link.waitForIceGatheringComplete()
    let resolved = false
    void pending.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)

    pc.localDescription.sdp += 'a=candidate:1 1 UDP 1 192.0.2.1 3478 typ relay\r\n'
    const candidateListener = pc.addEventListener.mock.calls.find(([name]) => name === 'icecandidate')?.[1] as EventListener
    candidateListener(new Event('icecandidate'))
    await pending
    expect(link.iceEvidence().gatheringTimedOut).toBe(false)
    expect(pc.removeEventListener).toHaveBeenCalledWith('icecandidate', candidateListener)
  })

  it('records candidate types, server errors, and a gathering timeout', async () => {
    vi.useFakeTimers()
    try {
      const link = new PeerLink({
        rtcConfig: { iceServers: [] },
        localPeerId: 'local',
        pendingId: 'pending',
        isOfferer: true,
        events,
      })
      const pc = link.pc as unknown as MockRTCPeerConnection & {
        onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null
        onicecandidateerror: ((event: RTCPeerConnectionIceErrorEvent) => void) | null
      }
      pc.iceGatheringState = 'gathering'
      pc.onicecandidate?.({
        candidate: {
          candidate: 'candidate:1 1 UDP 1 10.0.0.1 9 typ host',
          toJSON: () => ({ candidate: 'candidate:1 1 UDP 1 10.0.0.1 9 typ host', sdpMid: '0' }),
        },
      } as RTCPeerConnectionIceEvent)
      pc.onicecandidateerror?.({
        url: 'stun:stun.l.google.com:19302',
        errorCode: 701,
        errorText: 'STUN server timed out',
      } as RTCPeerConnectionIceErrorEvent)
      pc.onicecandidateerror?.({
        url: 'turn:user:pass@turn.example:3478?transport=tcp',
        errorCode: 701,
        errorText: 'TURN allocate failed',
      } as RTCPeerConnectionIceErrorEvent)
      const pending = link.waitForIceGatheringComplete()
      await vi.advanceTimersByTimeAsync(ICE_GATHERING_TIMEOUT_MS)
      await pending
      const recorded = link.iceEvidence()
      expect(recorded).toEqual({
        candidates: [{ type: 'host', protocol: 'udp', addressFamily: 'ipv4' }],
        serverErrors: [
          {
            url: 'stun:stun.l.google.com:19302',
            code: 701,
            text: 'STUN server timed out',
          },
          {
            url: 'turn:turn.example:3478?transport=tcp',
            code: 701,
            text: 'TURN allocate failed',
          },
        ],
        gatheringTimedOut: true,
      })
      expect(JSON.stringify(recorded)).not.toContain('10.0.0.1')
      expect(JSON.stringify(recorded)).not.toContain('user:pass@')
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips IPv6 trickle candidates when this host has no routable IPv6', async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      keepRoutableIpv6: false,
      events,
    })
    const pc = link.pc as unknown as MockRTCPeerConnection
    await link.addIceCandidate({
      candidate: 'candidate:1 1 udp 1 2001:db8::20 9 typ srflx',
      sdpMid: '0',
    })
    await link.addIceCandidate({
      candidate: 'candidate:2 1 udp 1 192.168.1.20 9 typ host',
      sdpMid: '0',
    })
    expect(pc.addIceCandidate).toHaveBeenCalledTimes(1)
    await link.setRemoteDescription({
      type: 'offer',
      sdp: 'c=IN IP6 2001:db8::10\r\na=candidate:1 1 udp 1 2001:db8::20 9 typ srflx\r\n',
    })
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'c=IN IP4 0.0.0.0\r\n',
    })
  })

  it('drops remote IPv6 when this host gathered only IPv4', async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: true,
      keepRoutableIpv6: true,
      events,
    })
    const pc = link.pc as unknown as MockRTCPeerConnection
    pc.localDescription = {
      type: 'offer',
      sdp: [
        'a=candidate:1 1 udp 2122260223 192.168.31.193 56956 typ host',
        'a=candidate:2 1 udp 1686052607 178.223.144.163 56956 typ srflx',
        'a=candidate:3 1 udp 58663167 116.203.208.7 52975 typ relay',
      ].join('\r\n'),
    }
    await link.setRemoteDescription({
      type: 'answer',
      sdp: [
        'a=candidate:1 1 udp 2122129151 192.168.178.90 45952 typ host',
        'a=candidate:2 1 udp 2122265343 fd6a:d108:e0b4:0:dbe8:54d0:50ce:81ac 35743 typ host',
        'a=candidate:3 1 udp 2122197247 2003:e0:a74b:ef00:ba26:41c8:b9fe:20a1 55316 typ host',
        'a=candidate:4 1 udp 1685921535 79.217.221.166 45952 typ srflx',
        'a=candidate:5 1 udp 58532095 116.203.208.7 59259 typ relay',
      ].join('\r\n'),
    })
    const applied = pc.setRemoteDescription.mock.calls[0]?.[0] as RTCSessionDescriptionInit
    expect(applied.sdp).toContain('192.168.178.90')
    expect(applied.sdp).toContain('79.217.221.166')
    expect(applied.sdp).toContain('116.203.208.7')
    expect(applied.sdp).not.toContain('fd6a:')
    expect(applied.sdp).not.toContain('2003:')
    await link.addIceCandidate({
      candidate: 'candidate:6 1 udp 1 2003:e0::9 9 typ host',
      sdpMid: '0',
    })
    await link.addIceCandidate({
      candidate: 'candidate:7 1 udp 1 192.168.178.91 9 typ host',
      sdpMid: '0',
    })
    expect(pc.addIceCandidate).toHaveBeenCalledTimes(1)
  })

  it('keeps remote IPv6 before local candidates are gathered', async () => {
    const link = new PeerLink({
      rtcConfig: { iceServers: [] },
      localPeerId: 'local',
      pendingId: 'pending',
      isOfferer: false,
      keepRoutableIpv6: true,
      events,
    })
    const pc = link.pc as unknown as MockRTCPeerConnection
    const remote = [
      'a=candidate:1 1 udp 1 2001:db8::20 9 typ srflx',
      'a=candidate:2 1 udp 1 192.168.1.20 9 typ host',
    ].join('\r\n')
    await link.setRemoteDescription({ type: 'offer', sdp: remote })
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: remote })
    expect(link.offerHasUsableIpv6).toBe(true)
  })
})
