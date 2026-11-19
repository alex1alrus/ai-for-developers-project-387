// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useLocation } from 'react-router'
import App from '../App.tsx'
import { renderAt } from '../test/render.tsx'

// Booking times are shown in the owner's local time; pin it to UTC+3 before modules create Intl formatters.
vi.hoisted(() => vi.stubEnv('TZ', 'Europe/Moscow'))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const intro = { id: 'intro', title: 'Знакомство', description: 'Короткий звонок', durationMinutes: 30 }
const hour = { id: 'hour', title: 'Час', description: '', durationMinutes: 60 }
const booking = {
  id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
  eventTypeId: 'hour',
  start: '2026-11-18T10:00:00.000Z',
  end: '2026-11-18T11:00:00.000Z',
  guestName: 'Анна',
  guestEmail: 'anna@example.com',
}

// Routes the SDK's fetch calls: /api/bookings vs /api/event-types.
function mockApi(bookings: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    (input as Request).url.endsWith('/api/bookings') ? bookings() : json([hour, intro]),
  )
}

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

test('/owner redirects to the bookings tab', async () => {
  mockApi(() => json([]))
  renderAt('/owner', <><App /><Path /></>)

  expect(screen.getByRole('tab', { name: 'Записи', selected: true })).toBeTruthy()
  expect(screen.getByTestId('path').textContent).toBe('/owner/bookings')
  await screen.findByText('Предстоящих записей нет.')
})

test('Владельцу link in the header opens the bookings tab', async () => {
  mockApi(() => json([]))
  renderAt('/', <App />)

  fireEvent.click(screen.getByRole('link', { name: 'Владельцу' }))

  expect(await screen.findByText('Предстоящих записей нет.')).toBeTruthy()
})

test('lists upcoming bookings with event type title, local time and guest', async () => {
  mockApi(() =>
    json([booking, { ...booking, id: 'b2', eventTypeId: 'intro', start: '2026-11-19T06:30:00.000Z', end: '2026-11-19T07:00:00.000Z', guestName: 'Борис', guestEmail: 'boris@example.com' }]),
  )
  renderAt('/owner/bookings', <App />)

  expect(screen.getByRole('status', { name: 'Загрузка' })).toBeTruthy()
  const items = await screen.findAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual([
    'Час18 ноября, 13:00–14:00Анна · anna@example.com',
    'Знакомство19 ноября, 09:30–10:00Борис · boris@example.com',
  ])
})

test('empty list says so and links to the catalog', async () => {
  mockApi(() => json([]))
  renderAt('/owner/bookings', <App />)

  expect(await screen.findByText('Предстоящих записей нет.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Открыть каталог' }).getAttribute('href')).toBe('/book')
})

test('load error shows an alert, Повторить reloads', async () => {
  const fetch = mockApi(() => json({ code: 'X', message: 'boom' }, 500))
  renderAt('/owner/bookings', <App />)

  expect(await screen.findByText('Не удалось загрузить данные')).toBeTruthy()

  fetch.mockImplementation(async (input) =>
    (input as Request).url.endsWith('/api/bookings') ? json([booking]) : json([hour]),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

  expect(await screen.findByText('Анна · anna@example.com')).toBeTruthy()
})
