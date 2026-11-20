import { createTheme, darken, type CSSVariablesResolver } from '@mantine/core'

// WCAG AA needs 4.5:1 for body text. Mantine's defaults on white (#41): blue.6 links and buttons 3.6,
// gray.6 `c="dimmed"` 3.3, red.6 input errors 3.3. Light variants (buttons, alerts) put shade 9 on shade 1,
// and on shade 2 on hover: 4.0 for blue, 3.4 for green; 35% darker text keeps every palette, yellow included, above 4.5.
export const theme = createTheme({ primaryShade: 8 })

export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-dimmed': t.colors.gray[7],
    '--mantine-color-error': t.colors.red[8],
    ...Object.fromEntries(
      Object.entries(t.colors).map(([name, shades]) => [`--mantine-color-${name}-light-color`, darken(shades[9], 0.35)]),
    ),
  },
  dark: {},
})
