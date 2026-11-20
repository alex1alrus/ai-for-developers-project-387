// Runs the "Build review payload" step of .github/workflows/review.yml (#24) on sample model output.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/review.yml', import.meta.url), 'utf8')
const script = (() => {
  const lines = workflow.split('\n')
  const step = lines.findIndex((l) => l.includes('- name: Build review payload'))
  const start = lines.findIndex((l, i) => i > step && l.trim() === 'run: |') + 1
  const body: string[] = []
  for (const line of lines.slice(start)) {
    if (line.trim() && !line.startsWith(' '.repeat(10))) break
    body.push(line.slice(10))
  }
  return body.join('\n')
})()

const head = 'a'.repeat(40)
const diff = [
  'diff --git a/server/app.ts b/server/app.ts',
  '--- a/server/app.ts',
  '+++ b/server/app.ts',
  '@@ -10,3 +10,4 @@ export function build() {',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
  '+const c = 4',
  ' return a',
  'diff --git a/old.ts b/old.ts',
  '--- a/old.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-gone',
  'diff --git a/docs/a.md b/docs/a.md',
  '--- a/docs/a.md',
  '+++ b/docs/a.md',
  '@@ -1,2 +1,2 @@',
  '-old',
  '+++ b/fake.md', // an added line whose text is "++ b/fake.md"
  ' same',
  '\\ No newline at end of file',
  '@@ -40 +40,2 @@',
  ' ctx',
  '+added',
].join('\n')

type Comment = { path: string; line: number; side: string; body: string }
type Payload = { commit_id: string; event: string; body: string; comments: Comment[] }

function build(modelText: string) {
  const dir = mkdtempSync(join(tmpdir(), 'review-'))
  try {
    mkdirSync(join(dir, 'review-input'))
    writeFileSync(join(dir, 'review-input', 'pr.diff'), diff)
    writeFileSync(join(dir, 'review.txt'), modelText)
    const result = spawnSync('python3', ['-c', script], {
      cwd: dir,
      env: { PATH: process.env.PATH, RUNNER_TEMP: dir, HEAD_SHA: head },
      encoding: 'utf8',
    })
    expect(result.stderr).toBe('')
    const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Payload
    return { payload: read('review-payload.json'), fallback: read('review-fallback.json') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const finding = (severity: string, path: string | null, line: number | null, body = `${severity} issue`) => ({
  severity,
  path,
  line,
  body,
  fix: `fix ${severity}`,
})

describe('diff lines', () => {
  const lines = (path: string, line: number | string) =>
    build(JSON.stringify({ findings: [finding('minor', path, line as number)] })).payload.comments.length

  test('later hunks restart the line count, a no-newline marker is not a line', () => {
    expect(lines('docs/a.md', 1)).toBe(1) // the added "++ b/fake.md" line
    expect(lines('docs/a.md', 2)).toBe(1) // " same"
    expect(lines('docs/a.md', 3)).toBe(0) // the "\ No newline" marker
    expect(lines('docs/a.md', 40)).toBe(1)
    expect(lines('docs/a.md', 41)).toBe(1)
  })

  test('a +++ row inside a hunk is content, not a new file', () => {
    expect(lines('fake.md', 1)).toBe(0)
  })

  test('a line given as a string still matches and is sent as a number', () => {
    expect(lines('server/app.ts', '11')).toBe(1)
    const c = build(JSON.stringify({ findings: [finding('minor', 'server/app.ts', '11' as unknown as number)] })).payload.comments[0]
    expect(c.line).toBe(11)
  })

  test('a line that is not a number goes to the summary', () => {
    // "1e999" is valid JSON that Python reads as infinity.
    for (const line of ['"abc"', '1e999', 'true']) {
      const { payload: p } = build(JSON.stringify({ findings: [finding('minor', 'server/app.ts', 0)] }).replace('"line":0', `"line":${line}`))
      expect(p.comments).toEqual([])
      expect(p.body).toContain('minor issue')
    }
  })
})

describe('review payload', () => {
  const model = {
    summary: 'Итог.',
    findings: [
      finding('minor', 'server/app.ts', 13),
      finding('blocker', 'server/app.ts', 11),
      finding('major', 'server/app.ts', 99),
      finding('BLOCKER', null, null, 'general'),
      finding('urgent', 'old.ts', 1),
    ],
    gaps: ['CI не завершён'],
  }
  const { payload, fallback } = build(JSON.stringify(model))

  test('is a COMMENT review on the head SHA with the summary marker the next review looks for', () => {
    expect(payload.commit_id).toBe(head)
    expect(payload.event).toBe('COMMENT')
    expect(payload.body.startsWith(`### Авторевью ${head}\n`)).toBe(true)
  })

  test('counts findings by severity, unknown severity counts as major', () => {
    expect(payload.body).toContain('🔴 blocker: 2 · 🟠 major: 2 · 🟡 minor: 1 · ⚪ пробелы: 1')
  })

  test('puts findings on diff lines of the new file as line comments, sorted by severity', () => {
    expect(payload.comments.map((c) => [c.path, c.line, c.side])).toEqual([
      ['server/app.ts', 11, 'RIGHT'],
      ['server/app.ts', 13, 'RIGHT'],
    ])
    expect(payload.comments[0].body).toBe('🔴 **blocker** — blocker issue\n\n**Как исправить:** fix blocker')
  })

  test('keeps findings off the diff, without a line or on a deleted file in the summary', () => {
    const offDiff = payload.body.slice(payload.body.indexOf('#### Замечания вне строк diff'), payload.body.indexOf('#### Пробелы'))
    expect(offDiff).toContain('🔴 **blocker** — general')
    expect(offDiff).toContain('`server/app.ts:99` 🟠 **major** — major issue')
    expect(offDiff).toContain('`old.ts:1` 🟠 **major** — urgent issue')
    expect(offDiff.indexOf('general')).toBeLessThan(offDiff.indexOf('major issue'))
    expect(offDiff.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(3)
  })

  test('lists gaps separately', () => {
    expect(payload.body).toContain('#### Пробелы в согласовании и проверках\n\n- ⚪ CI не завершён')
  })

  test('the fallback has no line comments and carries them in the summary', () => {
    expect(fallback.comments).toEqual([])
    expect(fallback.commit_id).toBe(head)
    expect(fallback.event).toBe('COMMENT')
    for (const part of ['Итог.', '#### Замечания вне строк diff', '#### Пробелы в согласовании и проверках', '#### Замечания к строкам']) {
      expect(fallback.body).toContain(part)
    }
    expect(fallback.body).toContain('`server/app.ts:11` 🔴 **blocker** — blocker issue')
    expect(fallback.body).toContain('`server/app.ts:13` 🟡 **minor** — minor issue')
  })

  test('a context line is commentable, a removed line is not', () => {
    const { payload: p } = build(JSON.stringify({ findings: [finding('minor', 'server/app.ts', 10), finding('minor', 'server/app.ts', 14)] }))
    expect(p.comments.map((c) => c.line)).toEqual([10])
  })

  test('JSON in a code block is accepted', () => {
    expect(build('```json\n' + JSON.stringify(model) + '\n```').payload.comments).toHaveLength(2)
    expect(build('```\n' + JSON.stringify(model) + '\n```').payload.comments).toHaveLength(2)
  })

  test('text that is not JSON is shown as is, without counters or a no-defects claim', () => {
    const { payload: p } = build('Обычный текст ревью.')
    expect(p.comments).toEqual([])
    expect(p.body).toContain('⚠️ Формат ответа модели не распознан')
    expect(p.body).toContain('Обычный текст ревью.')
    expect(p.body).not.toContain('blocker: 0')
    expect(p.body).not.toContain('Подтверждённых дефектов нет.')
  })

  test('JSON of another shape is shown as is, never as a clean review', () => {
    for (const text of [
      JSON.stringify([finding('blocker', null, null)]),
      'Обработчик возвращает {} вместо ApiError',
      JSON.stringify({ review: model }),
      JSON.stringify({ findings: finding('blocker', null, null) }),
    ]) {
      const { payload: p } = build(text)
      expect(p.body).toContain('⚠️ Формат ответа модели не распознан')
      expect(p.body).not.toContain('Подтверждённых дефектов нет.')
    }
  })

  test('an array answer is shown as is, even with a single review object', () => {
    const { payload: p } = build(JSON.stringify([{ summary: 'ok', findings: [], gaps: [] }]))
    expect(p.body).toContain('⚠️ Формат ответа модели не распознан')
    expect(p.body).not.toContain('Подтверждённых дефектов нет.')
  })

  test('a suggestion block is turned into plain code, so GitHub offers no patch to apply', () => {
    const fixed = '```suggestion\nconst b = 3\n```'
    const { payload: p } = build(JSON.stringify({ summary: fixed, findings: [{ ...finding('major', 'server/app.ts', 11), fix: fixed }, { ...finding('minor', null, null), body: fixed }] }))
    expect(JSON.stringify(p)).not.toContain('```suggestion')
    expect(p.comments[0].body).toContain('```text\nconst b = 3')
  })

  test('findings and gaps come before a long summary, so the cut keeps them', () => {
    const { payload: p, fallback: f } = build(
      JSON.stringify({ summary: 'x'.repeat(70000), findings: [finding('blocker', null, null, 'off')], gaps: ['gap'] }),
    )
    for (const body of [p.body, f.body]) {
      expect(body).toContain('🔴 **blocker** — off')
      expect(body).toContain('- ⚪ gap')
    }
  })

  test('findings dropped for a missing body are counted, not hidden behind a no-defects claim', () => {
    const { payload: p } = build(JSON.stringify({ findings: [{ severity: 'blocker', description: 'lost' }] }))
    expect(p.body).toContain('⚠️ Пропущено замечаний без текста или не в формате: 1')
    expect(p.body).not.toContain('Подтверждённых дефектов нет.')
  })

  test('JSON with a sentence around it is still parsed', () => {
    expect(build('Вот ревью:\n```json\n' + JSON.stringify(model) + '\n```\nГотово.').payload.comments).toHaveLength(2)
  })

  test('a finding with a file but no line names the file, a finding without fix has no fix text', () => {
    const { payload: p } = build(JSON.stringify({ findings: [{ severity: 'minor', path: 'README.md', line: null, body: 'stale' }] }))
    expect(p.body).toMatch(/^- `README\.md` 🟡 \*\*minor\*\* — stale$/m)
    expect(p.body).not.toContain('Как исправить')
  })

  test('the fix stays inside its list item off the diff', () => {
    expect(payload.body).toContain('🔴 **blocker** — general **Как исправить:** fix BLOCKER')
  })

  test('a null or numeric severity counts as major, a missing summary prints nothing', () => {
    const { payload: p } = build(JSON.stringify({ findings: [{ severity: null, body: 'a' }, { severity: 3, body: 'b' }] }))
    expect(p.body).toContain('🟠 major: 2')
    expect(p.body).not.toContain('None')
  })

  test('each list item is one line, empty sections are not shown', () => {
    const { payload: p, fallback: f } = build(
      JSON.stringify({
        findings: [finding('major', null, null, 'first\n\nsecond\n- third'), finding('minor', 'server/app.ts', 11, 'x\ny')],
        gaps: ['g1\ng2', 'g3'],
      }),
    )
    const items = (body: string) => body.split('\n').filter((l) => l.startsWith('- '))
    expect(items(p.body)).toEqual([
      '- 🟠 **major** — first second - third **Как исправить:** fix major',
      '- ⚪ g1 g2',
      '- ⚪ g3',
    ])
    expect(items(f.body)[0]).toBe('- `server/app.ts:11` 🟡 **minor** — x y **Как исправить:** fix minor')
    const { payload: empty } = build(JSON.stringify({ summary: 'ok', findings: [], gaps: [] }))
    expect(empty.body).not.toContain('####')
  })

  test('the fallback keeps line findings when the summary is cut', () => {
    const { fallback: f } = build(JSON.stringify({ summary: 'x'.repeat(70000), findings: [finding('blocker', 'server/app.ts', 11)] }))
    expect(f.body).toContain('`server/app.ts:11` 🔴 **blocker**')
    expect(f.body).toContain('…обрезано')
  })

  test('findings without a body, non-object findings and empty gaps are dropped', () => {
    const { payload: p } = build(JSON.stringify({ findings: [{ severity: 'major' }, 'text', 5], gaps: ['', ' '] }))
    expect(p.body).toContain('🔴 blocker: 0 · 🟠 major: 0 · 🟡 minor: 0 · ⚪ пробелы: 0')
  })

  test('a findings or gaps field of the wrong type does not break the review', () => {
    const { payload: p } = build(JSON.stringify({ findings: [], gaps: 'нет ссылки на согласование' }))
    expect(p.body).toContain('⚪ пробелы: 1')
    expect(build(JSON.stringify({ findings: 5 })).payload.body).toContain('⚠️ Формат ответа модели не распознан')
    expect(p.body).toContain('- ⚪ нет ссылки на согласование')
    expect(build('[1, 2]').payload.body).toContain('[1, 2]')
  })

  test('an empty summary with findings does not claim there are no defects', () => {
    const { payload: p } = build(JSON.stringify({ findings: [finding('major', null, null)] }))
    expect(p.body).not.toContain('Подтверждённых дефектов нет.')
  })

  test('a body over the GitHub limit is cut', () => {
    const { payload: p, fallback: f } = build(JSON.stringify({ summary: 'x'.repeat(70000) }))
    expect(p.body.length).toBeLessThan(65536)
    expect(f.body.length).toBeLessThan(65536)
  })

  test('no findings says so', () => {
    const { payload: p } = build(JSON.stringify({ summary: '', findings: [], gaps: [] }))
    expect(p.body).toContain('Подтверждённых дефектов нет.')
  })
})
