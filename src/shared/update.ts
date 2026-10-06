export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  latestVersion?: string
  mandatory: boolean
  manual: boolean
  progress?: number
  error?: string
}
