// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { renderAt } from '../test/render.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const intro = { id: 'intro', title: 'Знакомство', description: 'Короткий звонок', durationMinutes: 30 }

// Routes the SDK's fetch calls: GET lists event types, POST creates one.
function mockApi(list: () => unknown[], create: (body: unknown) => Promise<Response>) {
  const posted: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request
    if (request.method === 'GET') return json(list())
    const body = await request.json()
    posted.push(body)
    return create(body)
  })
  return posted
}

const field = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })

function fillForm() {
  type('Идентификатор', 'intro')
  type('Название', '  Знакомство  ')
  type('Описание', 'Короткий звонок')
  fireEvent.change(field('Длительность'), { target: { value: '30' } })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Создать' }))

test('Типы встреч tab opens the event types page from the owner area', async () => {
  mockApi(() => [], () => Promise.reject(new Error('unexpected POST')))
  renderAt('/owner', <App />)

  fireEvent.click(screen.getByRole('tab', { name: 'Типы встреч' }))

  expect(screen.getByRole('tab', { name: 'Типы встреч', selected: true })).toBeTruthy()
  expect(await screen.findByText('Типов встреч пока нет. Создайте первый в форме ниже.')).toBeTruthy()
})

test('owner event types tab lists existing event types', async () => {
  mockApi(() => [intro], () => Promise.reject(new Error('unexpected POST')))
  renderAt('/owner/event-types', <App />)

  expect(await screen.findByText('Знакомство')).toBeTruthy()
  expect(screen.getByText('/book/intro · 30 мин')).toBeTruthy()
})

test('form shows field errors on submit without calling the API and clears them on edit', async () => {
  const posted = mockApi(() => [], () => Promise.reject(new Error('unexpected POST')))
  renderAt('/owner/event-types', <App />)
  await screen.findByText('Типов встреч пока нет. Создайте первый в форме ниже.')

  type('Идентификатор', 'Intro!')
  type('Описание', 'a'.repeat(501))
  submit()

  expect(screen.getByText('Только строчные латинские буквы и цифры, слова через дефис')).toBeTruthy()
  expect(screen.getByText('Заполните поле')).toBeTruthy()
  expect(screen.getByText('Не больше 500 символов')).toBeTruthy()
  expect(posted).toEqual([])

  type('Идентификатор', 'intro')

  expect(screen.queryByText('Только строчные латинские буквы и цифры, слова через дефис')).toBeNull()
  expect(screen.getByText('Заполните поле')).toBeTruthy()
})

test('created event type shows a success alert and appears in the list', async () => {
  let eventTypes: unknown[] = []
  const posted = mockApi(
    () => eventTypes,
    async (body) => {
      eventTypes = [body]
      return json(body, 201)
    },
  )
  renderAt('/owner/event-types', <App />)
  await screen.findByText('Типов встреч пока нет. Создайте первый в форме ниже.')

  fillForm()
  submit()

  expect((await screen.findByRole('alert')).textContent).toContain('Тип встречи создан')
  expect(posted).toEqual([intro])
  expect(await screen.findByText('/book/intro · 30 мин')).toBeTruthy()

  type('Идентификатор', 'next')

  expect(screen.queryByRole('alert')).toBeNull()
})

test('submit button is disabled while the request is in flight', async () => {
  mockApi(() => [], () => new Promise(() => {}))
  renderAt('/owner/event-types', <App />)
  await screen.findByText('Типов встреч пока нет. Создайте первый в форме ниже.')

  fillForm()
  submit()

  await waitFor(() => expect(screen.getByRole('button', { name: 'Создать' }).hasAttribute('disabled')).toBe(true))
})

test('EVENT_TYPE_EXISTS is shown at the id field', async () => {
  mockApi(
    () => [],
    async () => json({ code: 'EVENT_TYPE_EXISTS', message: 'exists' }, 409),
  )
  renderAt('/owner/event-types', <App />)
  await screen.findByText('Типов встреч пока нет. Создайте первый в форме ниже.')

  fillForm()
  submit()

  expect(await screen.findByText('Тип встречи с таким идентификатором уже есть')).toBeTruthy()
  expect(field('Идентификатор').getAttribute('aria-invalid')).toBe('true')
})

test.each([
  ['validation error', () => Promise.resolve(json({ code: 'VALIDATION_ERROR', message: 'bad' }, 400)), 'Проверьте поля и попробуйте ещё раз'],
  ['server error', () => Promise.resolve(json({ code: 'INTERNAL', message: 'boom' }, 500)), 'Не удалось отправить. Попробуйте ещё раз.'],
  ['network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Не удалось отправить. Попробуйте ещё раз.'],
])('%s on create shows an alert and keeps the form data', async (_case, fail, message) => {
  mockApi(() => [], fail)
  renderAt('/owner/event-types', <App />)
  await screen.findByText('Типов встреч пока нет. Создайте первый в форме ниже.')

  fillForm()
  submit()

  expect((await screen.findByRole('alert')).textContent).toContain(message)
  expect(field('Идентификатор').value).toBe('intro')
  expect(field('Название').value).toBe('  Знакомство  ')
  expect(field('Описание').value).toBe('Короткий звонок')
  expect(field('Длительность').value).toBe('30')
  expect(screen.getByRole('button', { name: 'Создать' }).hasAttribute('disabled')).toBe(false)
})
