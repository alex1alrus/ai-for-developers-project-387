// Runs the Python step of .github/workflows/pr-check.yml (#21) on sample PR titles and bodies.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/pr-check.yml', import.meta.url), 'utf8')
const script = (() => {
  const lines = workflow.split('\n')
  const start = lines.findIndex((l) => l.trim() === 'run: |') + 1
  const body: string[] = []
  for (const line of lines.slice(start)) {
    if (line.trim() && !line.startsWith(' '.repeat(10))) break
    body.push(line.slice(10))
  }
  return body.join('\n')
})()

type Pr = { title?: string; body: string; ref?: string; author?: string }

function check({ title = 'feat: cancel a booking (#10)', body, ref = 'feat/cancel', author = 'alex1alrus' }: Pr) {
  const result = spawnSync('python3', ['-c', script], {
    env: { PATH: process.env.PATH, TITLE: title, BODY: body, HEAD_REF: ref, AUTHOR: author },
    encoding: 'utf8',
  })
  return { ok: result.status === 0, errors: result.stdout }
}

const sections = (tickets = 'Closes #10') =>
  [
    ['Исходное обращение', '#6'],
    ['Спецификация', '#8'],
    ['Тикеты', tickets],
    ['Согласование человеком', 'https://github.com/o/r/issues/6#issuecomment-1'],
    ['Проверки', '`mise run check` on abc123'],
    ['Риск', 'Slot release: a booked slot must not stay free.'],
    ['Откат', '`git revert` of the squash commit.'],
  ]
    .map(([name, text]) => `## ${name}\n\n<!-- hint -->\n${text}\n`)
    .join('\n')

const names = ['Исходное обращение', 'Спецификация', 'Тикеты', 'Согласование человеком', 'Проверки', 'Риск', 'Откат']

describe('pr-check title', () => {
  test.each(['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'build', 'ci', 'chore', 'revert'])(
    '%s: is a valid type',
    (type) => {
      expect(check({ title: `${type}: do a thing (#10)`, body: sections() }).ok).toBe(true)
    },
  )

  test('scope and breaking marker are allowed', () => {
    expect(check({ title: 'feat(api)!: drop v1 (#10)', body: sections() }).ok).toBe(true)
    expect(check({ title: 'fix(server/slots): edge (#10)', body: sections() }).ok).toBe(true)
  })

  test.each(['WIP feat: x', 'feat:x', 'feat: ', 'feat(a b): x', 'style: x', 'Feat x', 'Revert "feat: x"'])(
    '"%s" is rejected',
    (title) => {
      const result = check({ title, body: sections() })
      expect(result.ok).toBe(false)
      expect(result.errors).toMatch(/^::error::Заголовок не по Conventional Commits/)
    },
  )
})

describe('pr-check', () => {
  test('a filled template with a Conventional Commits title passes, also with CRLF', () => {
    expect(check({ body: sections() })).toEqual({ ok: true, errors: '' })
    expect(check({ body: sections().replace(/\n/g, '\r\n') }).ok).toBe(true)
  })

  test('a title outside Conventional Commits fails', () => {
    expect(check({ title: 'Исправлен отчёт', body: sections() }).errors).toContain('Заголовок не по Conventional Commits')
  })

  test.each(names)('missing «%s» fails', (name) => {
    expect(check({ body: sections().replace(`## ${name}\n`, `## ${name}s\n`) }).errors).toContain(`Раздел «${name}»`)
  })

  test('an empty section in the middle fails, a third-level or unspaced heading is not a section', () => {
    expect(check({ body: sections().replace('#8', '   ') }).errors).toContain('Раздел «Спецификация»')
    expect(check({ body: sections().replace('## Риск', '### Риск') }).ok).toBe(false)
    expect(check({ body: sections().replace('## Риск', '##Риск') }).ok).toBe(false)
  })

  test('a heading inside a multi-line HTML comment is not a section', () => {
    const body = sections().replace('## Риск\n', '<!--\n## Риск\nhint\n-->\n## Риски\n')
    expect(check({ body }).ok).toBe(false)
  })

  test('Closes #N must be its own line in «Тикеты»', () => {
    expect(check({ body: sections('-') + '\nCloses #10\n' }).errors).toContain('В разделе «Тикеты»')
    expect(check({ body: sections('Fixes the bug, see Closes #10 later') }).ok).toBe(false)
    expect(check({ body: sections('xCloses #10') }).ok).toBe(false)
    expect(check({ body: sections('Closes #') }).ok).toBe(false)
    expect(check({ body: sections('Closes the ticket') }).ok).toBe(false)
  })

  test.each(['Closes #10', 'closes #10', 'Fixes #10', 'Resolves #10', '- Closes #9\n- Closes #10', '* Closes #10', '- Closes #10 — отмена'])(
    '«Тикеты» with "%s" passes',
    (tickets) => {
      expect(check({ body: sections(tickets) }).ok).toBe(true)
    },
  )

  test('headings inside a code block are not sections, the block still fills its section', () => {
    expect(check({ body: '```\n' + sections() + '```\n' }).ok).toBe(false)
    expect(check({ body: '~~~\n' + sections() + '~~~\n' }).ok).toBe(false)
    expect(check({ body: sections().replace('`mise run check` on abc123', '```\n$ mise run check\n```') }).ok).toBe(true)
    // Two blocks with real sections between them: those sections stay.
    const between = sections().replace('#6', '```\na\n```').replace('Slot release', '```\nb\n```\nSlot release')
    expect(check({ body: between }).ok).toBe(true)
  })

  test('only release-please PRs by the bot skip the body check', () => {
    const release = { title: 'chore(main): release 1.3.0', body: 'release notes', ref: 'release-please--branches--main' }
    expect(check({ ...release, author: 'github-actions[bot]' }).ok).toBe(true)
    expect(check({ ...release, author: 'alex1alrus' }).ok).toBe(false)
    expect(check({ ...release, author: 'github-actions[bot]', ref: 'feat/release-please--x' }).ok).toBe(false)
    expect(check({ ...release, author: 'github-actions[bot]', ref: 'feat/x' }).ok).toBe(false)
    expect(check({ ...release, author: 'github-actions[bot]', title: 'release 1.3.0' }).ok).toBe(false)
  })
})
