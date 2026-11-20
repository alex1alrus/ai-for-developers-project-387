import { expect, test, vi } from 'vitest'

test('bookingInterval shows both dates when a booking crosses midnight in the guest’s time zone', async () => {
  vi.stubEnv('TZ', 'Asia/Bangkok')
  try {
    const { bookingInterval } = await import('./format.ts')

    expect(bookingInterval(new Date('2026-11-21T16:30:00Z'), new Date('2026-11-21T17:30:00Z')))
      .toBe('21 ноября, 23:30 – 22 ноября, 00:30')
  } finally {
    vi.unstubAllEnvs()
  }
})
