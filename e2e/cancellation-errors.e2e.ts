import { expect, test, type Request } from '@playwright/test'
import { buildApp } from '../server/app.ts'

test('the cancellation page explains an invalid link, a started booking, and an already cancelled booking', async ({ page, request }) => {
  // A separate real server lets only this scenario advance past a scheduled start.
  let now = Date.parse('2026-11-18T09:00:00.000Z')
  const app = buildApp({ now: () => now })
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 })
    const eventType = await request.post(`${origin}/api/event-types`, {
      data: { id: 'intro', title: 'Знакомство', description: '', durationMinutes: 30 },
    })
    expect(eventType.status()).toBe(201)

    async function book(start: string) {
      const response = await request.post(`${origin}/api/bookings`, {
        data: { eventTypeId: 'intro', start, guestName: 'Анна', guestEmail: 'anna@example.com' },
      })
      expect(response.status()).toBe(201)
      return response.json()
    }

    const start = '2026-11-18T10:00:00.000Z'
    const starting = await book(start)
    const later = await book('2026-11-18T11:00:00.000Z')
    const cancel = page.getByRole('button', { name: 'Отменить запись' })

    const cancellationPath = '/api/bookings/cancellation'
    await test.step('a malformed link is rejected without sending its fragment to the API', async () => {
      const lookups: string[] = []
      const recordLookup = (request: Request) => {
        if (new URL(request.url()).pathname === cancellationPath) lookups.push(request.method())
      }
      page.on('request', recordLookup)
      await page.goto(`${origin}/cancel#${'A'.repeat(20_000)}`)
      await expect(page.getByRole('alert')).toHaveText('Ссылка отмены недействительна')
      expect(lookups).toEqual([])
      page.off('request', recordLookup)
    })

    await test.step('the server rejects an unknown but well-formed code', async () => {
      const code = 'A'.repeat(43)
      const lookup = page.waitForResponse((response) =>
        new URL(response.url()).pathname === cancellationPath && response.request().method() === 'GET')
      await page.goto(`${origin}/cancel#${code}`)
      const response = await lookup
      expect(response.request().headers()['x-cancellation-code']).toBe(code)
      expect(response.status()).toBe(404)
      expect(await response.json()).toMatchObject({ code: 'INVALID_CANCELLATION_CODE' })
      await expect(page.getByRole('alert')).toHaveText('Ссылка отмены недействительна')
    })

    await test.step('a booking starts while the guest is viewing its details', async () => {
      await page.goto(`${origin}${starting.cancellationUrl}`)
      await expect(cancel).toBeVisible()
      now = Date.parse(start)
      await cancel.click()
      await expect(page.getByRole('alert')).toHaveText('Запись уже началась, отменить её нельзя')
    })

    await test.step('another tab cancelled the booking, and reopening the link shows the same reason', async () => {
      await page.goto(`${origin}${later.cancellationUrl}`)
      await expect(cancel).toBeVisible()
      const first = await request.post(`${origin}/api/bookings/cancellation`, {
        data: { cancellationCode: later.cancellationCode },
      })
      expect(first.status()).toBe(200)

      await cancel.click()
      await expect(page.getByRole('alert')).toHaveText('Запись уже отменена')
      await page.reload()
      await expect(page.getByRole('alert')).toHaveText('Запись уже отменена')
      await expect(cancel).toHaveCount(0)
    })
  } finally {
    await app.close()
  }
})
