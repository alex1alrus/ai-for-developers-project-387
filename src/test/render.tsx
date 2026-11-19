import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { client } from '../api/client.gen.ts'

// jsdom lacks these browser APIs; Mantine needs them.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Node's Request rejects relative URLs like '/api/...'; a browser resolves them against the page.
client.setConfig({ baseUrl: window.location.origin })

export function renderAt(path: string, ui: ReactNode) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </MantineProvider>,
  )
}
