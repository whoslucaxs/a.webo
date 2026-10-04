const ROOM_LIFETIME_MS = 4 * 60 * 60 * 1000
const LEADER_LEASE_MS = 20 * 1000
const JOIN_LIFETIME_MS = 45 * 1000
const MAX_JOINERS = 3
const MAX_BODY_BYTES = 64 * 1024

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

const error = (message, status = 400) => json({ error: message }, status)

const readBody = async (request) => {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) throw new Error('request too large')
  return JSON.parse(raw)
}
const joinIsActive = (join) => (join.lastSeenAt ?? join.createdAt) + JOIN_LIFETIME_MS >= Date.now()

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        },
      })
    }
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return json({ ok: true, turnConfigured: Boolean(env.TURN_KEY_ID && env.TURN_API_TOKEN) })
    }
    let roomId = /^\/(?:rooms|channels)\/([a-f0-9-]{36})(?:\/|$)/.exec(url.pathname)?.[1]
    let forwarded = request
    if ((url.pathname === '/rooms' || url.pathname === '/channels') && request.method === 'POST') {
      roomId = crypto.randomUUID()
      const permanent = url.pathname === '/channels'
      const body = await readBody(request).catch(() => null)
      if (permanent && (typeof body?.joinAuth !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.joinAuth))) {
        return error('invalid channel authentication')
      }
      if (!permanent && body && (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 10 || body.durationMinutes > 240 || !Number.isInteger(body.maxParticipants) || body.maxParticipants < 2 || body.maxParticipants > 4)) {
        return error('invalid room options')
      }
      forwarded = new Request(`${url.origin}/rooms/${roomId}/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostKey: crypto.randomUUID(), permanent, joinAuth: body?.joinAuth, durationMinutes: body?.durationMinutes, maxParticipants: body?.maxParticipants }),
      })
    }
    if (!roomId) return error('not found', 404)
    const room = env.ROOMS.get(env.ROOMS.idFromName(roomId))
    const response = await room.fetch(forwarded)
    const headers = new Headers(response.headers)
    headers.set('access-control-allow-origin', '*')
    headers.set('cache-control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  },
}

export class Room {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.claiming = false
  }

  async fetch(request) {
    try {
      const url = new URL(request.url)
      const action = url.pathname.split('/').slice(3).filter(Boolean)
      let room = await this.state.storage.get('room')
      if (action[0] === 'create' && request.method === 'POST') {
        if (room) return error('room already exists', 409)
        const { hostKey, permanent, joinAuth, durationMinutes, maxParticipants } = await readBody(request)
        if (typeof hostKey !== 'string' || hostKey.length < 30) return error('invalid host key')
        if (permanent && (typeof joinAuth !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(joinAuth))) return error('invalid channel authentication')
        if (!permanent && (durationMinutes !== undefined || maxParticipants !== undefined) && (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 240 || !Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 4)) return error('invalid room options')
        room = { hostKey, permanent: Boolean(permanent), joinAuth, leaseUntil: permanent ? Date.now() + LEADER_LEASE_MS : 0, expiresAt: Date.now() + (durationMinutes ?? ROOM_LIFETIME_MS / 60000) * 60000, maxJoiners: permanent ? MAX_JOINERS : (maxParticipants ?? 4) - 1, joins: {}, iceIssues: 0, iceWindowAt: Date.now() }
        await this.state.storage.put('room', room)
        if (!permanent) await this.state.storage.setAlarm(room.expiresAt)
        return json({ roomId: url.pathname.split('/')[2], hostKey, ...(!room.permanent && { expiresAt: room.expiresAt }) }, 201)
      }
      if (!room || (!room.permanent && room.expiresAt < Date.now())) return error('room expired or missing', 404)
      const authorized = typeof room.hostKey === 'string' && request.headers.get('authorization') === `Bearer ${room.hostKey}`
      const member = !room.permanent || authorized || request.headers.get('authorization') === `Bearer ${room.joinAuth}`
      if (!member) return error('unauthorized', 401)
      if (room.permanent && action[0] === 'claim' && request.method === 'POST') {
        if (this.claiming) return json({ role: 'guest' })
        this.claiming = true
        try {
          room = await this.state.storage.get('room')
          if (room.leaseUntil > Date.now()) return json({ role: 'guest' })
          const body = await readBody(request)
          if (body?.joinId) delete room.joins[body.joinId]
          room.hostKey = crypto.randomUUID()
          room.leaseUntil = Date.now() + LEADER_LEASE_MS
          await this.state.storage.put('room', room)
          return json({ role: 'host', hostKey: room.hostKey })
        } finally {
          this.claiming = false
        }
      }
      if (room.permanent && action[0] === 'release' && request.method === 'POST') {
        if (!authorized) return error('unauthorized', 401)
        room.leaseUntil = 0
        room.hostKey = null
        await this.state.storage.put('room', room)
        return json({ ok: true })
      }
      if (action[0] === 'ice' && request.method === 'GET') {
        if (!this.env.TURN_KEY_ID || !this.env.TURN_API_TOKEN) return error('TURN is not configured', 503)
        if (room.permanent && room.iceWindowAt + 60 * 60 * 1000 < Date.now()) {
          room.iceWindowAt = Date.now()
          room.iceIssues = 0
        }
        if (room.iceIssues >= 32) return error('room credential limit reached', 429)
        room.iceIssues += 1
        await this.state.storage.put('room', room)
        const response = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${this.env.TURN_KEY_ID}/credentials/generate-ice-servers`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.env.TURN_API_TOKEN}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ ttl: 14400 }),
          },
        )
        if (!response.ok) return error('TURN credential request failed', 502)
        const credentials = await response.json()
        return json({ iceServers: credentials.iceServers })
      }
      if (action[0] === 'join' && action.length === 1 && request.method === 'POST') {
        room.joins = Object.fromEntries(Object.entries(room.joins).filter(([, join]) => joinIsActive(join)))
        if (Object.keys(room.joins).length >= (room.maxJoiners ?? MAX_JOINERS)) return error('room is full', 409)
        const joinId = crypto.randomUUID()
        room.joins[joinId] = { status: 'waiting', createdAt: Date.now(), lastSeenAt: Date.now() }
        await this.state.storage.put('room', room)
        return json({ joinId, ...(!room.permanent && { expiresAt: room.expiresAt }) }, 201)
      }
      if (action[0] === 'join' && action[1] && request.method === 'GET') {
        const join = room.joins[action[1]]
        if (!join || !joinIsActive(join)) return error('join expired', 404)
        return json({ status: join.status, offer: join.offer ?? null })
      }
      if (action[0] === 'join' && action[1] && action.length === 2 && request.method === 'POST') {
        const join = room.joins[action[1]]
        if (!join || !joinIsActive(join)) return error('join expired', 404)
        join.lastSeenAt = Date.now()
        await this.state.storage.put('room', room)
        return json({ ok: true })
      }
      if (action[0] === 'join' && action[1] && action.length === 2 && request.method === 'DELETE') {
        delete room.joins[action[1]]
        await this.state.storage.put('room', room)
        return json({ ok: true })
      }
      if (action[0] === 'host' && request.method === 'GET') {
        if (!authorized) return error('unauthorized', 401)
        if (room.permanent) {
          room.leaseUntil = Date.now() + LEADER_LEASE_MS
          await this.state.storage.put('room', room)
        }
        return json({
          joins: Object.entries(room.joins)
            .filter(([, join]) => joinIsActive(join))
            .map(([joinId, join]) => ({ joinId, status: join.status, answer: join.answer ?? null })),
        })
      }
      if (['offer', 'answer', 'done'].includes(action[0]) && request.method === 'POST') {
        if (action[0] !== 'answer' && !authorized) return error('unauthorized', 401)
        const body = await readBody(request)
        const join = room.joins[body.joinId]
        if (!join || !joinIsActive(join)) return error('join expired', 404)
        if (action[0] === 'offer') {
          if (join.status !== 'waiting' || typeof body.offer !== 'string' || !body.offer.startsWith('kiwi://h/')) return error('invalid offer')
          join.offer = body.offer
          join.status = 'offered'
        } else if (action[0] === 'answer') {
          if (join.status !== 'offered' || typeof body.answer !== 'string' || !body.answer.startsWith('kiwi://p/')) return error('invalid answer')
          join.answer = body.answer
          join.status = 'answered'
        } else {
          if (join.status !== 'answered') return error('invalid join state')
          join.status = 'done'
          delete join.offer
          delete join.answer
        }
        await this.state.storage.put('room', room)
        return json({ ok: true })
      }
      if (action.length === 0 && request.method === 'DELETE') {
        if (room.permanent) return error('permanent channel cannot be closed', 403)
        if (!authorized) return error('unauthorized', 401)
        await this.state.storage.deleteAll()
        return json({ ok: true })
      }
      return error('not found', 404)
    } catch {
      return error('invalid request')
    }
  }

  async alarm() {
    await this.state.storage.deleteAll()
  }
}
