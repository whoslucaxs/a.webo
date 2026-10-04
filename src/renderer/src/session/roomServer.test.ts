import { describe, expect, it } from 'vitest'
import { makeChannelLink, makeRoomLink, parseChannelLink, parseRoomLink } from './roomServer'

describe('room link', () => {
  const roomId = '12345678-1234-4234-8234-123456789abc'

  it('keeps the encryption invite in the link fragment', () => {
    const fragment = 'YWJj.ZGZmZ2hpamtsbW5vcHFyc3R1dnd4eXo'
    const link = makeRoomLink('https://signal.nyxlink.online', roomId, fragment)
    expect(link.startsWith('webo://room/')).toBe(true)
    expect(parseRoomLink(link)).toEqual({
      server: 'https://signal.nyxlink.online',
      roomId,
      invite: { roomId: 'YWJj', bootstrapSecret: 'ZGZmZ2hpamtsbW5vcHFyc3R1dnd4eXo' },
    })
    expect(parseRoomLink(link.replace('webo://', 'kiwi://'))).toBeNull()
  })

  it('rejects insecure server URLs', () => {
    expect(parseRoomLink(makeRoomLink('http://example.com', roomId, ''))).toBeNull()
  })

  it('keeps a permanent channel link reusable and requires its secret', () => {
    const fragment = 'YWJj.ZGZmZ2hpamtsbW5vcHFyc3R1dnd4eXo'
    const link = makeChannelLink('https://signal.nyxlink.online', roomId, fragment)
    expect(link.startsWith('webo://channel/')).toBe(true)
    expect(parseChannelLink(link)).toEqual({
      server: 'https://signal.nyxlink.online',
      roomId,
      invite: { roomId: 'YWJj', bootstrapSecret: 'ZGZmZ2hpamtsbW5vcHFyc3R1dnd4eXo' },
    })
    expect(parseChannelLink(link.split('#')[0])).toBeNull()
    expect(parseChannelLink(link.replace('webo://', 'kiwi://'))).toBeNull()
  })

  it('carries display names in invitation links', () => {
    expect(parseRoomLink(makeRoomLink('https://signal.nyxlink.online', roomId, '', 'Coffee chat'))?.name).toBe('Coffee chat')
    const channel = parseChannelLink(makeChannelLink('https://signal.nyxlink.online', roomId, 'YWJj.ZGZmZ2hpamtsbW5vcHFyc3R1dnd4eXo', 'Study room', 'Weekly study group'))
    expect(channel?.name).toBe('Study room')
    expect(channel?.description).toBe('Weekly study group')
  })
})
