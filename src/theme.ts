import { createTheme, type CSSVariablesResolver } from '@mantine/core'

// WCAG AA needs 4.5:1 for body text. Mantine's defaults on white (#41): blue.6 links and buttons 3.6,
// gray.6 `c="dimmed"` 3.3, red.6 input errors 3.3.
export const theme = createTheme({ primaryShade: 8 })

export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: { '--mantine-color-dimmed': t.colors.gray[7], '--mantine-color-error': t.colors.red[8] },
  dark: {},
})
