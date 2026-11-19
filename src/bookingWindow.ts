/** Booking window as README.md defines it; the server applies the same rules in `server/slots.ts`. */
export const WINDOW_DAYS = 14
const OPEN = 9 * 60 // 09:00 UTC, minutes from midnight
const CLOSE = 18 * 60
const STEP = 30

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Local `YYYY-MM-DD` of the guest's browser. */
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Local dates that can hold a slot of the window: from the first slot start to the last one (14 or 15 dates). */
export function windowDates(now: number) {
  const today = Math.floor(now / DAY) * DAY
  const last = localDate(new Date(today + (WINDOW_DAYS - 1) * DAY + (CLOSE - STEP) * MINUTE))
  const first = new Date(today + OPEN * MINUTE)
  const dates: string[] = []
  for (let day = 0; dates.at(-1) !== last; day++) {
    dates.push(localDate(new Date(first.getFullYear(), first.getMonth(), first.getDate() + day)))
  }
  return dates
}
