import { parseInviteFragment, type InviteCrypto } from '../crypto/invite'

export type RoomLink = { server: string; roomId: string; invite: InviteCrypto | null; name?: string }
export type ChannelLink = { server: string; roomId: string; invite: InviteCrypto; name?: string; description?: string }
type HostJoin = { joinId: string; status: 'waiting' | 'offered' | 'answered' | 'done'; answer: string | null }

const roomPath = (server: string, roomId: string, suffix = ''): string =>
  `${server}/rooms/${roomId}${suffix}`

const request = async <T>(url: string, method = 'GET', body?: unknown, hostKey?: string): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(hostKey ? { authorization: `Bearer ${hostKey}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || `Server error ${response.status}`)
  return result
}

export const normalizeRoomServer = (value: string): string => {
  if (!value.trim()) throw new Error('Set the room server URL in Settings')
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
    throw new Error('Room server must use HTTPS')
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid room server URL')
  }
  return url.origin
}

export const parseRoomLink = (text: string): RoomLink | null => {
  try {
    const url = new URL(text.trim())
    if (url.protocol !== 'kiwi:' || url.hostname !== 'room') return null
    const roomId = url.pathname.slice(1)
    if (!/^[a-f0-9-]{36}$/.test(roomId)) return null
    const server = normalizeRoomServer(url.searchParams.get('server') ?? '')
    const name = url.searchParams.get('name')?.trim().slice(0, 48)
    return { server, roomId, invite: parseInviteFragment(url.hash), ...(name ? { name } : {}) }
  } catch {
    return null
  }
}

export const makeRoomLink = (server: string, roomId: string, fragment: string, name = ''): string =>
  `kiwi://room/${roomId}?server=${encodeURIComponent(server)}${name ? `&name=${encodeURIComponent(name)}` : ''}${fragment ? `#${fragment}` : ''}`

export const parseChannelLink = (text: string): ChannelLink | null => {
  try {
    const url = new URL(text.trim())
    if (url.protocol !== 'kiwi:' || url.hostname !== 'channel') return null
    const roomId = url.pathname.slice(1)
    if (!/^[a-f0-9-]{36}$/.test(roomId)) return null
    const server = normalizeRoomServer(url.searchParams.get('server') ?? '')
    const invite = parseInviteFragment(url.hash)
    const name = url.searchParams.get('name')?.trim().slice(0, 48)
    const description = url.searchParams.get('description')?.trim().slice(0, 160)
    return invite ? { server, roomId, invite, ...(name ? { name } : {}), ...(description ? { description } : {}) } : null
  } catch {
    return null
  }
}

export const makeChannelLink = (server: string, roomId: string, fragment: string, name = '', description = ''): string =>
  `kiwi://channel/${roomId}?server=${encodeURIComponent(server)}${name ? `&name=${encodeURIComponent(name)}` : ''}${description ? `&description=${encodeURIComponent(description)}` : ''}#${fragment}`

export const createChannel = (server: string, joinAuth: string): Promise<{ roomId: string; hostKey: string }> =>
  request(`${server}/channels`, 'POST', { joinAuth })

export const claimChannel = (
  server: string,
  roomId: string,
  joinAuth: string,
  joinId?: string,
): Promise<{ role: 'host' | 'guest'; hostKey?: string }> =>
  request(roomPath(server, roomId, '/claim'), 'POST', { joinId }, joinAuth)

export const releaseChannel = (server: string, roomId: string, hostKey: string): Promise<unknown> =>
  request(roomPath(server, roomId, '/release'), 'POST', {}, hostKey)

export const createRoom = (server: string, durationMinutes = 240, maxParticipants = 4): Promise<{ roomId: string; hostKey: string }> =>
  request(`${server}/rooms`, 'POST', { durationMinutes, maxParticipants })

export const roomIceServers = async (server: string, roomId: string, token?: string): Promise<RTCIceServer[]> =>
  (await request<{ iceServers: RTCIceServer[] }>(roomPath(server, roomId, '/ice'), 'GET', undefined, token)).iceServers

export const joinRoom = (server: string, roomId: string, token?: string): Promise<{ joinId: string }> =>
  request(roomPath(server, roomId, '/join'), 'POST', undefined, token)

export const joinStatus = (
  server: string,
  roomId: string,
  joinId: string,
  token?: string,
): Promise<{ status: HostJoin['status']; offer: string | null }> =>
  request(roomPath(server, roomId, `/join/${joinId}`), 'GET', undefined, token)

export const keepJoinAlive = (server: string, roomId: string, joinId: string, token?: string): Promise<unknown> =>
  request(roomPath(server, roomId, `/join/${joinId}`), 'POST', undefined, token)

export const leaveJoin = (server: string, roomId: string, joinId: string, token?: string): Promise<unknown> =>
  request(roomPath(server, roomId, `/join/${joinId}`), 'DELETE', undefined, token)

export const hostStatus = (
  server: string,
  roomId: string,
  hostKey: string,
): Promise<{ joins: HostJoin[] }> => request(roomPath(server, roomId, '/host'), 'GET', undefined, hostKey)

export const sendOffer = (
  server: string,
  roomId: string,
  hostKey: string,
  joinId: string,
  offer: string,
): Promise<unknown> =>
  request(roomPath(server, roomId, '/offer'), 'POST', { joinId, offer }, hostKey)

export const sendAnswer = (
  server: string,
  roomId: string,
  joinId: string,
  answer: string,
  token?: string,
): Promise<unknown> => request(roomPath(server, roomId, '/answer'), 'POST', { joinId, answer }, token)

export const finishJoin = (
  server: string,
  roomId: string,
  hostKey: string,
  joinId: string,
): Promise<unknown> => request(roomPath(server, roomId, '/done'), 'POST', { joinId }, hostKey)

export const closeRoom = (
  server: string,
  roomId: string,
  hostKey: string,
): Promise<unknown> => request(roomPath(server, roomId), 'DELETE', undefined, hostKey)
