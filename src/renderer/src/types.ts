type IceServer = {
  urls: string
  username?: string
  credential?: string
}
import type { VideoCodec } from '../../shared/videoCodec'

export type SettingsData = {
  username: string
  foregroundColor: string
  backgroundColor: string
  avatar?: string
  language?: string
  isMicrophoneEnabledOnConnect: boolean
  hardwareVideoAcceleration: boolean
  debugLogsEnabled: boolean
  e2eeEnabled?: boolean
  mediaE2eeEnabled?: boolean
  cameraDeviceId?: string
  microphoneDeviceId?: string
  videoCodec?: VideoCodec
  iceServers: IceServer[]
  roomServerUrl?: string
  bonjourEnabled?: boolean
  bonjourServerUrl?: string
}

export type ScreenShareSource = {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
  isScreen: boolean
}

export type ViewName = 'home' | 'settings' | 'debug' | 'bonjour'
