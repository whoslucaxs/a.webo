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
console.log('room signaling check passed')
