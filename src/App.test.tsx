// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from './App.tsx'
import { renderAt } from './test/render.tsx'

afterEach(cleanup)

test('home page tells about the service and links to the catalog', () => {
  renderAt('/', <App />)

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Запишитесь на звонок')
  expect(screen.getByRole('link', { name: 'Записаться' })).toBeTruthy()
})

test('Записаться link opens the event type catalog', () => {
  renderAt('/', <App />)

  fireEvent.click(screen.getByRole('link', { name: 'Записаться' }))

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Каталог типов встреч')
})
