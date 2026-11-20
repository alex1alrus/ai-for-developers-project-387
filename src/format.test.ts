import { expect, test, vi } from 'vitest'

test.each([
  {
    scenario: 'shows both dates when a booking crosses midnight',
    start: '2026-11-21T16:30:00Z',
    end: '2026-11-21T17:30:00Z',
    expected: '21 ноября, 23:30 – 22 ноября, 00:30',
  },
  {
    scenario: 'shows one date when a booking starts and ends on the same day',
    start: '2026-11-18T06:00:00Z',
    end: '2026-11-18T07:00:00Z',
    expected: '18 ноября, 13:00–14:00',
  },
  {
    scenario: 'shows both dates when a booking ends exactly at midnight',
    start: '2026-11-21T16:00:00Z',
    end: '2026-11-21T17:00:00Z',
    expected: '21 ноября, 23:00 – 22 ноября, 00:00',
  },
])('bookingInterval $scenario in the guest’s time zone', async ({ start, end, expected }) => {
  vi.stubEnv('TZ', 'Asia/Bangkok')
  try {
    const { bookingInterval } = await import('./format.ts')

    expect(bookingInterval(new Date(start), new Date(end))).toBe(expected)
  } finally {
    vi.unstubAllEnvs()
  }
})
