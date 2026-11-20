import { createTheme, type CSSVariablesResolver } from '@mantine/core'

// WCAG AA needs 4.5:1 for body text. Mantine's defaults (blue.6 links and buttons, gray.6 for `c="dimmed"`) give about 3.5 and 3.3 on white (#41).
export const theme = createTheme({ primaryShade: { light: 8, dark: 8 } })

export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: { '--mantine-color-dimmed': t.colors.gray[7] },
  dark: {},
})
