import type { Slot } from './api/types.gen.ts'

/** Half-open interval `[start, end)` in ISO 8601 UTC. A `Booking` fits as is. */
type Interval = { start: string; end: string }

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const WINDOW_DAYS = 14
const OPEN = 9 * 60 // 09:00 UTC, minutes from midnight
const CLOSE = 18 * 60
const STEP = 30

const overlaps = (start: number, end: number, booking: Interval) =>
  start < Date.parse(booking.end) && Date.parse(booking.start) < end

/** Free slots of the booking window (14 UTC dates from today), sorted by start. */
export function freeSlots(durationMinutes: number, bookings: Interval[], now: Date): Slot[] {
  const today = Math.floor(now.getTime() / DAY) * DAY
  const slots: Slot[] = []
  for (let day = 0; day < WINDOW_DAYS; day++) {
    for (let minute = OPEN; minute + durationMinutes <= CLOSE; minute += STEP) {
      const start = today + day * DAY + minute * MINUTE
      const end = start + durationMinutes * MINUTE
      if (start <= now.getTime() || bookings.some((booking) => overlaps(start, end, booking))) continue
      slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
    }
  }
  return slots
}
