import { expect, it } from 'vitest'
import { Room } from './room.svelte'

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
