export type CallChatMessage = {
  id: string
  from: string
  name: string
  text: string
  at: number
  attachment?: { fileName: string; mime: string; size: number; dataUrl: string }
}

export type CallPeerInfo = {
  id: string
  name: string
  foregroundColor: string
  backgroundColor: string
  avatar?: string
  cameraEnabled: boolean
  isLocal: boolean
}

export type CallCameraMid = {
  mid: string
  peerId: string
}
