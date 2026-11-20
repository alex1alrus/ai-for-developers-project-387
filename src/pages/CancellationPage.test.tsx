// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { renderAt } from '../test/render.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('the guest can cancel even when the event type catalog fails to load', async () => {
  const booking = {
    id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    eventTypeId: 'intro',
    start: '2026-11-18T10:00:00.000Z',
    end: '2026-11-18T10:30:00.000Z',
    guestName: 'Анна',
    guestEmail: 'anna@example.com',
    status: 'active',
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { url, method } = input as Request
    if (url.endsWith('/api/event-types')) return json({ message: 'Unavailable' }, 503)
    if (url.endsWith('/api/bookings/cancellation')) {
      return json(method === 'POST' ? { ...booking, status: 'cancelled' } : booking)
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  })

  renderAt(`/cancel#${'A'.repeat(43)}`, <App />)

  expect(await screen.findByText('intro')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }))
  expect(await screen.findByText('Запись отменена')).toBeTruthy()
})
