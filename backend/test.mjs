import assert from 'node:assert/strict'
import { Room } from './src/index.js'

const values = new Map()
const state = {
  storage: {
    get: async (key) => values.get(key),
    put: async (key, value) => values.set(key, value),
    setAlarm: async () => {},
    deleteAll: async () => values.clear(),
  },
}
const room = new Room(state, {})
const base = 'https://signal.example.com/rooms/00000000-0000-4000-8000-000000000000'
const call = async (path, method = 'GET', body, hostKey) => {
  const response = await room.fetch(
    new Request(base + path, {
      method,
      headers: hostKey ? { authorization: `Bearer ${hostKey}` } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  )
  return { status: response.status, data: await response.json() }
}

const key = 'host-token-with-enough-random-characters'
assert.equal((await call('/create', 'POST', { hostKey: key })).status, 201)
assert.equal((await call('/host')).status, 401)
const joined = await call('/join', 'POST')
assert.equal(joined.status, 201)
const { joinId } = joined.data
assert.equal((await call(`/join/${joinId}`)).data.status, 'waiting')
assert.equal((await call('/offer', 'POST', { joinId, offer: 'kiwi://h/test' }, key)).status, 200)
assert.equal((await call(`/join/${joinId}`)).data.offer, 'kiwi://h/test')
assert.equal((await call('/answer', 'POST', { joinId, answer: 'kiwi://p/test' })).status, 200)
assert.equal((await call('/host', 'GET', undefined, key)).data.joins[0].answer, 'kiwi://p/test')
assert.equal((await call('/done', 'POST', { joinId }, key)).status, 200)
assert.equal((await call('/', 'DELETE', undefined, key)).status, 200)
assert.equal((await call('/host', 'GET', undefined, key)).status, 404)
const customKey = 'temporary-host-token-with-enough-characters'
assert.equal((await call('/create', 'POST', { hostKey: customKey, durationMinutes: 30, maxParticipants: 2 })).status, 201)
assert.ok(values.get('room').expiresAt - Date.now() <= 30 * 60 * 1000)
const occupied = (await call('/join', 'POST')).data.joinId
assert.equal((await call('/offer', 'POST', { joinId: occupied, offer: 'kiwi://h/test' }, customKey)).status, 200)
assert.equal((await call('/answer', 'POST', { joinId: occupied, answer: 'kiwi://p/test' })).status, 200)
assert.equal((await call('/done', 'POST', { joinId: occupied }, customKey)).status, 200)
assert.equal((await call('/join', 'POST')).status, 409)
assert.equal((await call(`/join/${occupied}`, 'POST')).status, 200)
values.get('room').joins[occupied].lastSeenAt = Date.now() - 46 * 1000
const replacement = (await call('/join', 'POST')).data.joinId
assert.equal((await call(`/join/${occupied}`)).status, 404)
assert.equal((await call('/join', 'POST')).status, 409)
assert.equal((await call(`/join/${replacement}`, 'DELETE')).status, 200)
assert.equal((await call('/join', 'POST')).status, 201)
assert.equal((await call('/', 'DELETE', undefined, customKey)).status, 200)
assert.equal((await call('/create', 'POST', { hostKey: customKey, durationMinutes: 300, maxParticipants: 2 })).status, 400)
const channelAuth = 'A'.repeat(43)
const channelKey = 'permanent-host-token-with-enough-characters'
assert.equal((await call('/create', 'POST', { hostKey: channelKey, permanent: true, joinAuth: channelAuth })).status, 201)
assert.equal((await call('/join', 'POST')).status, 401)
assert.equal((await call('/join', 'POST', undefined, channelAuth)).status, 201)
assert.equal((await call('/claim', 'POST', {}, channelAuth)).data.role, 'guest')
assert.equal((await call('/host', 'GET', undefined, channelKey)).status, 200)
assert.equal((await call('/release', 'POST', {}, channelKey)).status, 200)
assert.equal((await call('/host', 'GET', undefined, 'null')).status, 401)
const claimed = await call('/claim', 'POST', {}, channelAuth)
assert.equal(claimed.data.role, 'host')
assert.equal((await call('/host', 'GET', undefined, channelKey)).status, 401)
assert.equal((await call('/host', 'GET', undefined, claimed.data.hostKey)).status, 200)
values.get('room').leaseUntil = Date.now() - 1
const recovered = await call('/claim', 'POST', {}, channelAuth)
assert.equal(recovered.data.role, 'host')
assert.notEqual(recovered.data.hostKey, claimed.data.hostKey)
assert.equal((await call('/', 'DELETE', undefined, recovered.data.hostKey)).status, 403)
assert.equal((await call('/release', 'POST', {}, recovered.data.hostKey)).status, 200)
const simultaneous = await Promise.all([call('/claim', 'POST', {}, channelAuth), call('/claim', 'POST', {}, channelAuth)])
assert.deepEqual(simultaneous.map((entry) => entry.data.role).sort(), ['guest', 'host'])
console.log('room signaling check passed')
