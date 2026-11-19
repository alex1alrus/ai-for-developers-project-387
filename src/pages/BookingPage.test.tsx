// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useLocation } from 'react-router'
import App from '../App.tsx'
import { renderAt } from '../test/render.tsx'

// Slots are shown in the guest's local time; pin it to UTC+3 before modules create Intl formatters.
vi.hoisted(() => vi.stubEnv('TZ', 'Europe/Moscow'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-18T06:00:00.000Z'))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const intro = { id: 'intro', title: 'Знакомство', description: 'Короткий звонок', durationMinutes: 30 }
const slot = (start: string) => ({ start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString() })

function mockApi(slots: unknown, slotsStatus = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = (input as Request).url
    return url.endsWith('/slots') ? json(slots, slotsStatus) : json([intro])
  })
}

function Location() {
  const { search } = useLocation()
  return <output data-testid="search">{search}</output>
}

const search = () => screen.getByTestId('search').textContent

const open = (path: string) =>
  renderAt(
    path,
    <>
      <App />
      <Location />
    </>,
  )

test('catalog card leads to the slots page of its event type', async () => {
  mockApi([])

  open('/book')

  expect((await screen.findByRole('link', { name: /Знакомство/ })).getAttribute('href')).toBe('/book/intro')
})

test('shows dates of the window in local time and the slots of the selected date; picking a date changes ?date=', async () => {
  mockApi([slot('2026-11-18T09:00:00.000Z'), slot('2026-11-19T10:00:00.000Z'), slot('2026-11-19T10:30:00.000Z')])

  open('/book/intro')

  expect(await screen.findByRole('heading', { level: 2, name: 'Знакомство' })).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1, name: 'Выберите время' })).toBeTruthy()
  expect(search()).toBe('?date=2026-11-18')
  expect(screen.getByRole('button', { name: '12:00' })).toBeTruthy()
  expect(screen.getByText('Время указано в вашем часовом поясе: Europe/Moscow, GMT+3')).toBeTruthy()
  expect(screen.getByRole('button', { name: /20 нояб/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: /1 дек/ })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /19 нояб/ }))

  expect(search()).toBe('?date=2026-11-19')
  expect(screen.getByRole('button', { name: '13:00' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '13:30' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '12:00' })).toBeNull()
})

test('an empty date offers the nearest free date', async () => {
  mockApi([slot('2026-11-18T09:00:00.000Z'), slot('2026-11-22T09:00:00.000Z')])

  open('/book/intro?date=2026-11-20')

  expect(await screen.findByText('На эту дату свободного времени нет')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Ближайшая свободная дата: 22 ноября' }))

  expect(search()).toBe('?date=2026-11-22')
  expect(screen.getByRole('button', { name: '12:00' })).toBeTruthy()
})

test.each(['?date=2026-12-02', '?date=2026-11-17', '?date=garbage', ''])(
  'date %j outside the window or malformed is replaced by the first date with slots',
  async (query) => {
    mockApi([slot('2026-11-19T10:00:00.000Z')])

    open(`/book/intro${query}`)

    expect(await screen.findByRole('button', { name: '13:00' })).toBeTruthy()
    expect(search()).toBe('?date=2026-11-19')
  },
)

test('no slots in the whole window says so and links to the catalog', async () => {
  mockApi([])

  open('/book/intro')

  expect(await screen.findByText('В ближайшие 14 дней свободного времени нет')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'В каталог' }).getAttribute('href')).toBe('/book')
})

test('unknown event type says it is not found and links to the catalog', async () => {
  mockApi({ code: 'EVENT_TYPE_NOT_FOUND', message: 'not found' }, 404)

  open('/book/missing')

  expect(await screen.findByText('Тип встречи не найден')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'В каталог' }).getAttribute('href')).toBe('/book')
})

test('shows a loader while loading', () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

  open('/book/intro')

  expect(screen.getByRole('heading', { level: 1, name: 'Выберите время' })).toBeTruthy()
  expect(screen.getByRole('status', { name: 'Загрузка' })).toBeTruthy()
})

test('a failed request shows one alert and Повторить reloads both', async () => {
  const fetch = mockApi([slot('2026-11-18T09:00:00.000Z')])
  fetch.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))

  open('/book/intro')

  expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить данные')
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

  expect(await screen.findByRole('button', { name: '12:00' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

describe('booking a slot', () => {
  /** GET answers in turn from `slotLists` (the last one repeats); POST answers with `create`. */
  function mockBooking(slotLists: unknown[][], create: () => Promise<Response>) {
    const posted: unknown[] = []
    let slotsCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const request = input as Request
      if (request.method === 'POST') {
        posted.push(await request.json())
        return create()
      }
      if (!request.url.endsWith('/slots')) return json([intro])
      return json(slotLists[Math.min(slotsCalls++, slotLists.length - 1)])
    })
    return posted
  }

  const field = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement
  const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Записаться' }))

  async function pickAndFill(time = '12:00') {
    open('/book/intro?date=2026-11-18')
    fireEvent.click(await screen.findByRole('button', { name: time }))
    type('Имя', '  Анна  ')
    type('Email', 'anna@example.com')
  }

  const free = [slot('2026-11-18T09:00:00.000Z'), slot('2026-11-18T09:30:00.000Z')]
  const booking = {
    id: '6f1c2a3b-0000-4000-8000-000000000000',
    eventTypeId: 'intro',
    ...free[0],
    guestName: 'Анна',
    guestEmail: 'anna@example.com',
  }

  test('sends trimmed fields and replaces the form with a confirmation', async () => {
    const posted = mockBooking([free], async () => json(booking, 201))
    await pickAndFill()

    submit()

    expect(await screen.findByText('Вы записаны')).toBeTruthy()
    expect(posted).toEqual([
      { eventTypeId: 'intro', start: '2026-11-18T09:00:00.000Z', guestName: 'Анна', guestEmail: 'anna@example.com' },
    ])
    expect(screen.getByText('Знакомство')).toBeTruthy()
    expect(screen.getByText('18 ноября, 12:00')).toBeTruthy()
    expect(screen.getByText('Часовой пояс: Europe/Moscow, GMT+3')).toBeTruthy()
    expect(screen.getByText('Анна')).toBeTruthy()
    expect(screen.getByText('anna@example.com')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'В каталог' }).getAttribute('href')).toBe('/book')
    expect(screen.queryByRole('button', { name: 'Записаться' })).toBeNull()
  })

  test('Записаться is disabled while the request is in flight', async () => {
    mockBooking([free], () => new Promise(() => {}))
    await pickAndFill()

    submit()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Записаться' }).hasAttribute('disabled')).toBe(true))
  })

  test('invalid fields show errors at the fields and send nothing', async () => {
    const posted = mockBooking([free], async () => json(booking, 201))
    await pickAndFill()
    type('Имя', '   ')
    type('Email', 'anna')

    submit()

    expect(screen.getByText('Заполните поле')).toBeTruthy()
    expect(screen.getByText('Введите email вида name@example.com')).toBeTruthy()
    expect(posted).toEqual([])
  })

  test.each(['BOOKING_CONFLICT', 'INVALID_START'])(
    '%s says the time is unavailable, shows fresh slots of the same date and keeps name and email',
    async (code) => {
      mockBooking([free, [free[1]]], async () => json({ code, message: 'taken' }, code === 'INVALID_START' ? 400 : 409))
      await pickAndFill()

      submit()

      expect((await screen.findByRole('alert')).textContent).toContain('Это время уже недоступно. Выберите другое.')
      await waitFor(() => expect(screen.queryByRole('button', { name: '12:00' })).toBeNull())
      expect(search()).toBe('?date=2026-11-18')
      fireEvent.click(screen.getByRole('button', { name: '12:30' }))
      expect(field('Имя').value).toBe('  Анна  ')
      expect(field('Email').value).toBe('anna@example.com')
    },
  )

  test.each([
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Не удалось отправить. Попробуйте ещё раз.'],
    ['5xx', async () => json({ message: 'boom' }, 500), 'Не удалось отправить. Попробуйте ещё раз.'],
    ['VALIDATION_ERROR', async () => json({ code: 'VALIDATION_ERROR', message: 'bad' }, 400), 'Проверьте поля и попробуйте ещё раз'],
  ])('%s shows an alert above the form and keeps the data, without retrying', async (_case, create, message) => {
    const posted = mockBooking([free], create)
    await pickAndFill()

    submit()

    expect((await screen.findByRole('alert')).textContent).toContain(message)
    expect(field('Имя').value).toBe('  Анна  ')
    expect(field('Email').value).toBe('anna@example.com')
    expect(screen.getByRole('button', { name: 'Записаться' }).hasAttribute('disabled')).toBe(false)
    expect(posted).toHaveLength(1)
  })

  test('EVENT_TYPE_NOT_FOUND on submit shows that the event type is not found', async () => {
    mockBooking([free], async () => json({ code: 'EVENT_TYPE_NOT_FOUND', message: 'gone' }, 404))
    await pickAndFill()

    submit()

    expect(await screen.findByText('Тип встречи не найден')).toBeTruthy()
  })
})
