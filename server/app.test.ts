import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from './app.ts'

test('app starts and answers health check', async () => {
  const app = buildApp()
  const res = await app.inject({ method: 'GET', url: '/api/health' })

  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ status: 'ok' })
  await app.close()
})

test('GET /api/event-types returns an empty catalog', async () => {
  const app = buildApp()
  const res = await app.inject({ method: 'GET', url: '/api/event-types' })

  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual([])
  await app.close()
})

describe('SPA fallback', () => {
  let webRoot: string
  beforeEach(() => {
    webRoot = mkdtempSync(join(tmpdir(), 'web-'))
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html><div id="root"></div>')
    writeFileSync(join(webRoot, 'app.js'), 'console.log(1)')
  })
  afterEach(() => rmSync(webRoot, { recursive: true }))

  test('GET of a page path returns index.html', async () => {
    const app = buildApp({ webRoot })
    const res = await app.inject({ method: 'GET', url: '/owner/bookings' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/html/)
    expect(res.body).toContain('<div id="root">')
    await app.close()
  })

  test('GET of a built asset returns the file', async () => {
    const app = buildApp({ webRoot })
    const res = await app.inject({ method: 'GET', url: '/app.js' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('console.log(1)')
    await app.close()
  })

  test('GET of a page path with a query returns index.html', async () => {
    const app = buildApp({ webRoot })
    const res = await app.inject({ method: 'GET', url: '/cancel?token=a.b' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<div id="root">')
    await app.close()
  })

  test.each(['/robots.txt', '/llms.txt', '/.well-known/ard.json', '/.well-known/security'])(
    'GET of a missing file %s returns 404 JSON, not the page',
    async (url) => {
      const app = buildApp({ webRoot })
      const res = await app.inject({ method: 'GET', url })

      expect(res.statusCode).toBe(404)
      expect(res.json()).toMatchObject({ code: 'NOT_FOUND' })
      await app.close()
    },
  )

  test('unknown API path returns 404 JSON, not the page', async () => {
    const app = buildApp({ webRoot })
    const res = await app.inject({ method: 'GET', url: '/api/unknown' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'GET /api/unknown not found' })
    await app.close()
  })

  test('non-GET outside the API returns 404 JSON', async () => {
    const app = buildApp({ webRoot })
    const res = await app.inject({ method: 'POST', url: '/owner/bookings' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' })
    await app.close()
  })
})

const intro = { id: 'intro', title: 'Знакомство', description: 'Короткий звонок', durationMinutes: 30 }

const createEventType = (app: ReturnType<typeof buildApp>, payload: object) =>
  app.inject({ method: 'POST', url: '/api/event-types', payload })

const listEventTypes = async (app: ReturnType<typeof buildApp>) =>
  (await app.inject({ method: 'GET', url: '/api/event-types' })).json()

test('POST /api/event-types creates an event type that the catalog lists sorted by title', async () => {
  const app = buildApp()
  const deep = { id: 'deep-dive', title: 'Разбор проекта', description: '', durationMinutes: 540 }

  const res = await createEventType(app, deep)
  await createEventType(app, intro)

  expect(res.statusCode).toBe(201)
  expect(res.json()).toEqual(deep)
  expect(await listEventTypes(app)).toEqual([intro, deep])
  await app.close()
})

test.each([
  ['id with uppercase', { id: 'Intro' }],
  ['id with a trailing hyphen', { id: 'intro-' }],
  ['id longer than 64', { id: 'a'.repeat(65) }],
  ['empty title', { title: '' }],
  ['title with surrounding spaces', { title: ' Знакомство' }],
  ['title with a line break', { title: 'Знако\nмство' }],
  ['title longer than 100', { title: 'a'.repeat(101) }],
  ['missing description', { description: undefined }],
  ['description longer than 500', { description: 'a'.repeat(501) }],
  ['duration below 15', { durationMinutes: 0 }],
  ['duration above 540', { durationMinutes: 555 }],
  ['duration not a multiple of 15', { durationMinutes: 20 }],
  ['fractional duration', { durationMinutes: 15.5 }],
])('POST /api/event-types rejects %s with VALIDATION_ERROR', async (_case, patch) => {
  const app = buildApp()
  const res = await createEventType(app, { ...intro, ...patch })

  expect(res.statusCode).toBe(400)
  expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.any(String) })
  expect(await listEventTypes(app)).toEqual([])
  await app.close()
})

test('POST /api/event-types rejects a taken id with EVENT_TYPE_EXISTS', async () => {
  const app = buildApp()
  await createEventType(app, intro)

  const res = await createEventType(app, { ...intro, title: 'Другой' })

  expect(res.statusCode).toBe(409)
  expect(res.json()).toMatchObject({ code: 'EVENT_TYPE_EXISTS', message: expect.any(String) })
  expect(await listEventTypes(app)).toEqual([intro])
  await app.close()
})

describe('GET /api/event-types/{id}/slots', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T17:10:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  test('returns free slots of the window sorted by start', async () => {
    const app = buildApp()
    await createEventType(app, intro)

    const res = await app.inject({ method: 'GET', url: '/api/event-types/intro/slots' })

    expect(res.statusCode).toBe(200)
    const slots = res.json()
    expect(slots.slice(0, 2)).toEqual([
      { start: '2026-11-18T17:30:00.000Z', end: '2026-11-18T18:00:00.000Z' },
      { start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T09:30:00.000Z' },
    ])
    expect(slots.at(-1)).toEqual({ start: '2026-12-01T17:30:00.000Z', end: '2026-12-01T18:00:00.000Z' })
    expect(slots).toHaveLength(1 + 13 * 18)
    await app.close()
  })

  test('answers 404 EVENT_TYPE_NOT_FOUND for an unknown event type', async () => {
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/event-types/missing/slots' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: 'EVENT_TYPE_NOT_FOUND', message: expect.any(String) })
    await app.close()
  })
})

describe('POST /api/bookings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T06:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  const hour = { id: 'hour', title: 'Час', description: '', durationMinutes: 60 }
  const guest = { guestName: 'Анна', guestEmail: 'anna@example.com' }

  const book = (app: ReturnType<typeof buildApp>, eventTypeId: string, start: string, patch: object = {}) =>
    app.inject({ method: 'POST', url: '/api/bookings', payload: { eventTypeId, start, ...guest, ...patch } })

  const slotStarts = async (app: ReturnType<typeof buildApp>, id: string): Promise<string[]> =>
    (await app.inject({ method: 'GET', url: `/api/event-types/${id}/slots` }))
      .json()
      .map((slot: { start: string }) => slot.start)

  const listBookings = async (app: ReturnType<typeof buildApp>) =>
    (await app.inject({ method: 'GET', url: '/api/bookings' })).json()

  const cancel = (app: ReturnType<typeof buildApp>, cancellationCode?: string) =>
    app.inject({ method: 'POST', url: '/api/bookings/cancellation', payload: { cancellationCode } })

  // Not returning the app: a Fastify instance is thenable, so an async function would await it.
  async function addTypes(app: ReturnType<typeof buildApp>) {
    await createEventType(app, intro)
    await createEventType(app, hour)
  }

  test('books a free slot and issues a secret cancellation link only to the guest', async () => {
    const app = buildApp()
    await addTypes(app)

    const res = await book(app, 'hour', '2026-11-18T10:00:00.000Z')

    expect(res.statusCode).toBe(201)
    const { cancellationCode, cancellationUrl, ...booking } = res.json()
    expect(booking).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      eventTypeId: 'hour',
      start: '2026-11-18T10:00:00.000Z',
      end: '2026-11-18T11:00:00.000Z',
      status: 'active',
      ...guest,
    })
    expect(cancellationCode).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cancellationUrl).toBe(`/cancel#${cancellationCode}`)
    expect(res.headers['cache-control']).toBe('no-store')

    const other = await book(app, 'intro', '2026-11-18T11:00:00.000Z')
    expect(other.statusCode).toBe(201)
    expect(other.json().cancellationCode).not.toBe(cancellationCode)
    expect((await listBookings(app))[0]).toEqual(booking)
    await app.close()
  })

  test('partial overlap of different durations: 60 min at 10:00, then 30 min at 10:30 of another type is BOOKING_CONFLICT', async () => {
    const app = buildApp()
    await addTypes(app)
    expect((await book(app, 'hour', '2026-11-18T10:00:00.000Z')).statusCode).toBe(201)

    const res = await book(app, 'intro', '2026-11-18T10:30:00.000Z', { guestName: 'Борис' })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: 'BOOKING_CONFLICT', message: expect.any(String) })
    expect((await listBookings(app)).map((b: { guestName: string }) => b.guestName)).toEqual(['Анна'])
    await app.close()
  })

  test('only the correct code opens booking details, and reading them leaves the slot occupied', async () => {
    const app = buildApp()
    await addTypes(app)
    await book(app, 'hour', '2026-11-18T09:00:00.000Z', { guestName: 'Борис' })
    const res = await book(app, 'hour', '2026-11-18T10:00:00.000Z')
    const { cancellationCode, cancellationUrl: _url, ...booking } = res.json()

    const details = (code?: string) => app.inject({
      method: 'GET',
      url: '/api/bookings/cancellation',
      headers: code === undefined ? {} : { 'x-cancellation-code': code },
    })
    for (const code of [undefined, 'invalid', 'a'.repeat(43)]) {
      const invalid = await details(code)
      expect(invalid.statusCode).toBe(404)
      expect(invalid.json()).toEqual({ code: 'INVALID_CANCELLATION_CODE', message: expect.any(String) })
      expect(invalid.headers['cache-control']).toBe('no-store')
    }
    for (let read = 0; read < 2; read++) {
      const found = await details(cancellationCode)
      expect(found.statusCode).toBe(200)
      expect(found.headers['cache-control']).toBe('no-store')
      expect(found.json()).toEqual({ ...booking, status: 'active' })
    }
    expect(await listBookings(app)).toContainEqual({ ...booking, status: 'active' })
    expect(await slotStarts(app, 'intro')).not.toContain('2026-11-18T10:30:00.000Z')
    await app.close()
  })

  test('cancellation keeps the booking in the owner list and releases a partially overlapping slot of another type', async () => {
    const app = buildApp()
    await addTypes(app)
    const longCall = { ...hour, id: 'long-call', durationMinutes: 90 }
    await createEventType(app, longCall)
    const later = await book(app, 'intro', '2026-11-18T12:00:00.000Z', { guestName: 'Вера' })
    const { cancellationCode: _laterCode, cancellationUrl: _laterUrl, ...active } = later.json()

    const created = await book(app, 'hour', '2026-11-18T10:00:00.000Z')
    expect(created.statusCode).toBe(201)
    const { cancellationCode, cancellationUrl: _url, ...booking } = created.json()
    const overlappingStart = '2026-11-18T10:30:00.000Z' // [10:30, 12:00) overlaps [10:00, 11:00) only in part.
    expect(await listBookings(app)).toEqual([booking, active])
    expect(await slotStarts(app, longCall.id)).not.toContain(overlappingStart)
    const conflict = await book(app, longCall.id, overlappingStart)
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toMatchObject({ code: 'BOOKING_CONFLICT' })

    const response = await cancel(app, cancellationCode)
    const cancelled = { ...booking, status: 'cancelled' }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(cancelled)
    expect(await listBookings(app)).toEqual([cancelled, active])
    expect(await slotStarts(app, longCall.id)).toContain(overlappingStart)
    const replacement = await book(app, longCall.id, overlappingStart, { guestName: 'Борис' })
    expect(replacement.statusCode).toBe(201)

    vi.setSystemTime(new Date('2026-11-18T11:00:00.000Z'))
    expect(await listBookings(app)).toEqual([
      expect.objectContaining({ id: replacement.json().id, status: 'active' }),
      active,
    ])
    await app.close()
  })

  test('an already cancelled booking takes precedence over time, and bad codes cannot change any booking', async () => {
    const app = buildApp()
    await addTypes(app)
    const created = await book(app, 'hour', '2026-11-18T10:00:00.000Z')
    expect(created.statusCode).toBe(201)
    const { cancellationCode, cancellationUrl: _url, ...booking } = created.json()
    const overlap = '2026-11-18T10:30:00.000Z'
    expect(await slotStarts(app, 'intro')).not.toContain(overlap)

    const missing = await cancel(app)
    expect(missing.statusCode).toBe(400)
    expect(missing.json()).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String) })
    for (const code of ['', 'invalid', 'a'.repeat(43)]) {
      const wrong = await cancel(app, code)
      expect(wrong.statusCode, JSON.stringify(code)).toBe(404)
      expect(wrong.json()).toEqual({ code: 'INVALID_CANCELLATION_CODE', message: expect.any(String) })
    }
    expect(await listBookings(app)).toEqual([booking])
    expect(await slotStarts(app, 'intro')).not.toContain(overlap)
    expect((await cancel(app, cancellationCode)).statusCode).toBe(200)

    for (const now of ['2026-11-18T09:45:00.000Z', '2026-11-18T10:15:00.000Z']) {
      vi.setSystemTime(new Date(now))
      const repeated = await cancel(app, cancellationCode)
      expect(repeated.statusCode, now).toBe(409)
      expect(repeated.json(), now).toEqual({ code: 'BOOKING_ALREADY_CANCELLED', message: expect.any(String) })
      expect(await listBookings(app)).toEqual([{ ...booking, status: 'cancelled' }])
      expect(await slotStarts(app, 'intro')).toContain(overlap)
    }
    await app.close()
  })

  test('cancellation rejects an active booking at its start, during the call, and after its end', async () => {
    const app = buildApp()
    await addTypes(app)
    const start = '2026-11-18T10:00:00.000Z'
    const created = await book(app, 'hour', start)
    expect(created.statusCode).toBe(201)
    const { cancellationCode, cancellationUrl: _url, ...booking } = created.json()

    for (const [now, listed] of [
      [start, true],
      ['2026-11-18T10:15:00.000Z', true],
      ['2026-11-18T11:00:00.001Z', false],
    ] as const) {
      vi.setSystemTime(new Date(now))
      const before = await slotStarts(app, 'intro')
      const response = await cancel(app, cancellationCode)
      expect(response.statusCode, now).toBe(409)
      expect(response.json(), now).toEqual({ code: 'BOOKING_ALREADY_STARTED', message: expect.any(String) })
      const details = await app.inject({
        method: 'GET', url: '/api/bookings/cancellation', headers: { 'x-cancellation-code': cancellationCode },
      })
      expect(details.json()).toEqual(booking)
      expect(await listBookings(app)).toEqual(listed ? [booking] : [])
      expect(await slotStarts(app, 'intro')).toEqual(before)
    }
    await app.close()
  })

  test('adjacent bookings are allowed: [10:00, 10:30) and [10:30, 11:00) both get 201', async () => {
    const app = buildApp()
    await addTypes(app)

    expect((await book(app, 'intro', '2026-11-18T10:00:00.000Z')).statusCode).toBe(201)
    expect((await book(app, 'intro', '2026-11-18T10:30:00.000Z')).statusCode).toBe(201)
    await app.close()
  })

  test('race: two parallel POSTs on overlapping intervals of different types give exactly one 201 and one 409', async () => {
    const app = buildApp()
    await addTypes(app)
    await createEventType(app, { ...hour, id: 'call', title: 'Звонок' })

    // [10:00, 11:00) and [10:30, 11:30): each leaves a half hour the other does not cover.
    const responses = await Promise.all([
      book(app, 'hour', '2026-11-18T10:00:00.000Z'),
      book(app, 'call', '2026-11-18T10:30:00.000Z'),
    ])

    expect(responses.map((res) => res.statusCode).toSorted()).toEqual([201, 409])
    const stored = await listBookings(app)
    expect(stored).toHaveLength(1)
    const { cancellationCode: _code, cancellationUrl: _url, ...created } = responses.find((res) => res.statusCode === 201)!.json()
    expect(stored[0]).toEqual(created)
    const introStarts = await slotStarts(app, 'intro')
    const freeEdges = ['2026-11-18T10:00:00.000Z', '2026-11-18T11:00:00.000Z'].filter((s) => introStarts.includes(s))
    expect(freeEdges).toHaveLength(1) // one booking stored: two would block both edges
    await app.close()
  })

  test('a booked interval disappears from the slots of another event type', async () => {
    const app = buildApp()
    await addTypes(app)

    await book(app, 'hour', '2026-11-18T10:00:00.000Z')

    const starts = await slotStarts(app, 'intro')
    expect(starts).toContain('2026-11-18T09:30:00.000Z')
    expect(starts).not.toContain('2026-11-18T10:00:00.000Z')
    expect(starts).not.toContain('2026-11-18T10:30:00.000Z')
    expect(starts).toContain('2026-11-18T11:00:00.000Z')
    await app.close()
  })

  test.each([
    ['off the 30-minute grid', 'intro', '2026-11-18T10:15:00.000Z'],
    ['before the window (yesterday)', 'intro', '2026-11-17T10:00:00.000Z'],
    ['after the window (day 15)', 'intro', '2026-12-02T10:00:00.000Z'],
    ['already started today', 'intro', '2026-11-18T05:30:00.000Z'],
    ['ending after 18:00', 'hour', '2026-11-18T17:30:00.000Z'],
  ])('rejects a start %s with INVALID_START', async (_case, eventTypeId, start) => {
    const app = buildApp()
    await addTypes(app)

    const res = await book(app, eventTypeId, start)

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: 'INVALID_START', message: expect.any(String) })
    await app.close()
  })

  test('a start that has just passed is INVALID_START, not a conflict', async () => {
    const app = buildApp()
    await addTypes(app)
    vi.setSystemTime(new Date('2026-11-18T10:00:00.000Z'))

    const res = await book(app, 'intro', '2026-11-18T10:00:00.000Z')

    expect(res.json()).toMatchObject({ code: 'INVALID_START' })
    await app.close()
  })

  test.each([
    ['empty name', { guestName: '' }],
    ['name with surrounding spaces', { guestName: ' Анна' }],
    ['name longer than 100', { guestName: 'a'.repeat(101) }],
    ['email without @', { guestEmail: 'anna.example.com' }],
    ['email longer than 254', { guestEmail: `${'a'.repeat(250)}@b.cd` }],
    ['start that is not a date-time', { start: 'tomorrow' }],
    ['missing eventTypeId', { eventTypeId: undefined }],
  ])('rejects %s with VALIDATION_ERROR', async (_case, patch) => {
    const app = buildApp()
    await addTypes(app)

    const res = await book(app, 'intro', '2026-11-18T10:00:00.000Z', patch)

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.any(String) })
    await app.close()
  })

  test('answers 404 EVENT_TYPE_NOT_FOUND for an unknown event type', async () => {
    const app = buildApp()
    await addTypes(app)

    const res = await book(app, 'missing', '2026-11-18T10:00:00.000Z')

    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: 'EVENT_TYPE_NOT_FOUND', message: expect.any(String) })
    await app.close()
  })
  test('GET /api/bookings lists upcoming bookings sorted by start: ended hidden, ongoing shown', async () => {
    const app = buildApp()
    await addTypes(app)
    await book(app, 'intro', '2026-11-18T12:00:00.000Z', { guestName: 'Вера' })
    await book(app, 'hour', '2026-11-18T10:00:00.000Z', { guestName: 'Глеб' })
    await book(app, 'intro', '2026-11-18T09:30:00.000Z', { guestName: 'Борис' })
    await book(app, 'intro', '2026-11-18T09:00:00.000Z')
    vi.setSystemTime(new Date('2026-11-18T10:15:00.000Z'))

    const res = await app.inject({ method: 'GET', url: '/api/bookings' })

    expect(res.statusCode).toBe(200)
    // 09:00-09:30 and 09:30-10:00 have ended; 10:00-11:00 is ongoing.
    expect(res.json().map((b: { start: string; guestName: string }) => [b.start, b.guestName])).toEqual([
      ['2026-11-18T10:00:00.000Z', 'Глеб'],
      ['2026-11-18T12:00:00.000Z', 'Вера'],
    ])
    await app.close()
  })

  test('GET /api/bookings hides a booking the moment it ends', async () => {
    const app = buildApp()
    await addTypes(app)
    await book(app, 'intro', '2026-11-18T09:00:00.000Z')
    vi.setSystemTime(new Date('2026-11-18T09:29:59.999Z'))
    expect(await listBookings(app)).toHaveLength(1)

    vi.setSystemTime(new Date('2026-11-18T09:30:00.000Z'))

    expect(await listBookings(app)).toEqual([])
    await app.close()
  })
})

describe.each(['/api/event-types', '/api/bookings', '/api/bookings/cancellation'])('POST %s with a malformed body', (url) => {
  test.each([
    ['invalid JSON', { 'content-type': 'application/json' }, '{"id":'],
    ['text/plain', { 'content-type': 'text/plain' }, 'hello'],
    ['no content type and no body', {}, undefined],
  ])('answers %s with 400 VALIDATION_ERROR', async (_case, headers, payload) => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url, headers, payload })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ code: 'VALIDATION_ERROR', message: expect.any(String) })
    await app.close()
  })
})
