import { expect, test } from 'vitest'
import { freeSlots } from './slots.ts'

const now = new Date('2026-11-18T06:00:00.000Z')
const starts = (durationMinutes: number, bookings = [], at = now) =>
  freeSlots(durationMinutes, bookings, at).map((slot) => slot.start)

test('30-minute slots run every 30 minutes from 09:00 to 17:30 UTC', () => {
  const slots = freeSlots(30, [], now)

  expect(slots[0]).toEqual({ start: '2026-11-18T09:00:00.000Z', end: '2026-11-18T09:30:00.000Z' })
  expect(slots[1].start).toBe('2026-11-18T09:30:00.000Z')
  expect(slots.filter((slot) => slot.start.startsWith('2026-11-18')).at(-1)).toEqual({
    start: '2026-11-18T17:30:00.000Z',
    end: '2026-11-18T18:00:00.000Z',
  })
})

test('a 540-minute event type has a single slot at 09:00 each day', () => {
  const slots = freeSlots(540, [], now)

  expect(slots.filter((slot) => slot.start.startsWith('2026-11-18'))).toEqual([
    { start: '2026-11-18T09:00:00.000Z', end: '2026-11-18T18:00:00.000Z' },
  ])
})

test('a slot ends no later than 18:00: the last slot of a 45-minute event type starts at 17:00', () => {
  const today = starts(45).filter((start) => start.startsWith('2026-11-18'))

  expect(today.at(-1)).toBe('2026-11-18T17:00:00.000Z')
})

test('the window is 14 UTC dates starting today, sorted by start', () => {
  const all = starts(540)

  expect(all).toHaveLength(14)
  expect(all[0]).toBe('2026-11-18T09:00:00.000Z')
  expect(all.at(-1)).toBe('2026-12-01T09:00:00.000Z')
  expect(starts(30)).toHaveLength(14 * 18)
})

test('only slots that start strictly after now are free', () => {
  const at = new Date('2026-11-18T09:30:00.000Z')

  expect(starts(30, [], at)[0]).toBe('2026-11-18T10:00:00.000Z')
  expect(starts(30, [], new Date('2026-11-18T09:29:59.999Z'))[0]).toBe('2026-11-18T09:30:00.000Z')
})

test('a slot of another duration that overlaps a booking is taken; adjoining slots stay free', () => {
  const booking = { start: '2026-11-18T09:00:00.000Z', end: '2026-11-18T09:45:00.000Z' }
  const today = freeSlots(60, [booking], now)
    .map((slot) => slot.start)
    .filter((start) => start.startsWith('2026-11-18'))

  expect(today.slice(0, 2)).toEqual(['2026-11-18T10:00:00.000Z', '2026-11-18T10:30:00.000Z'])
  expect(freeSlots(15, [booking], now)[0].start).toBe('2026-11-18T10:00:00.000Z')
  expect(freeSlots(30, [{ start: '2026-11-18T09:30:00.000Z', end: '2026-11-18T10:00:00.000Z' }], now).slice(0, 2)).toEqual([
    { start: '2026-11-18T09:00:00.000Z', end: '2026-11-18T09:30:00.000Z' },
    { start: '2026-11-18T10:00:00.000Z', end: '2026-11-18T10:30:00.000Z' },
  ])
})
