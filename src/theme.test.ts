import { DEFAULT_THEME, luminance, mergeMantineTheme } from '@mantine/core'
import { expect, test } from 'vitest'
import { cssVariablesResolver, theme } from './theme.ts'

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('primary and dimmed text reach WCAG AA (4.5:1) on white', () => {
  const merged = mergeMantineTheme(DEFAULT_THEME, theme)
  const shade = typeof merged.primaryShade === 'number' ? merged.primaryShade : merged.primaryShade.light
  const primary = merged.colors[merged.primaryColor][shade]
  const dimmed = cssVariablesResolver(merged).light['--mantine-color-dimmed']

  expect(contrast(primary, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  expect(contrast(dimmed, '#ffffff')).toBeGreaterThanOrEqual(4.5)
})
