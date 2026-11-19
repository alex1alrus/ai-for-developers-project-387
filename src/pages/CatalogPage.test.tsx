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

test('catalog shows a loader while event types load', () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

  renderAt('/book', <App />)

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Каталог типов встреч')
  expect(screen.getByRole('status', { name: 'Загрузка' })).toBeTruthy()
})

test('empty catalog says the owner has not added event types yet', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([]))

  renderAt('/book', <App />)

  expect(await screen.findByText('Владелец пока не добавил типы встреч.')).toBeTruthy()
  expect(screen.queryByRole('status', { name: 'Загрузка' })).toBeNull()
})

test('catalog lists event types with title, description and duration', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    json([
      { id: 'intro', title: 'Знакомство', description: 'Короткий звонок', durationMinutes: 15 },
      { id: 'deep', title: 'Разбор проекта', description: 'Подробно', durationMinutes: 60 },
    ]),
  )

  renderAt('/book', <App />)

  expect(await screen.findByText('Знакомство')).toBeTruthy()
  expect(screen.getByText('Короткий звонок')).toBeTruthy()
  expect(screen.getByText('15 мин')).toBeTruthy()
  expect(screen.getByText('Разбор проекта')).toBeTruthy()
  expect(screen.getByText('60 мин')).toBeTruthy()
})

test.each([
  ['server error', () => Promise.resolve(json({ code: 'INTERNAL', message: 'boom' }, 500))],
  ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
])('catalog load failure (%s) shows an alert and Повторить reloads', async (_case, fail) => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(fail)

  renderAt('/book', <App />)

  expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить данные')

  fetch.mockResolvedValueOnce(
    json([{ id: 'intro', title: 'Знакомство', description: '', durationMinutes: 30 }]),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

  expect(await screen.findByText('Знакомство')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
