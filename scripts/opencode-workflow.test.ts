// Guards for the PR budget in .github/workflows/opencode.yml (#18):
// - the "admitted" condition in `run-name` and the PR branch of the job `if` must be the same
//   clauses, because the budget gate finds the current run by its title, and GitHub
//   expressions cannot be shared between the two places;
// - the budget step itself: three admitted requests pass, the fourth is blocked.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/opencode.yml', import.meta.url), 'utf8')
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

// Split at top-level `op` (outside parentheses and quotes), dropping one pair of outer parentheses.
function split(expr: string, op: '&&' | '||'): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (c === "'") quoted = !quoted
    else if (!quoted && c === '(') depth++
    else if (!quoted && c === ')') depth--
    else if (!quoted && depth === 0 && expr.startsWith(op, i)) {
      parts.push(expr.slice(start, i))
      start = i + op.length
    }
  }
  parts.push(expr.slice(start))
  return parts.map((p) => unwrap(p.trim()))
}

function unwrap(expr: string): string {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return expr
  let depth = 0
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++
    else if (expr[i] === ')') depth--
    if (depth === 0 && i < expr.length - 1) return expr // the first group closes early
  }
  return expr.slice(1, -1).trim()
}

const runName = flat(workflow.match(/^run-name: >-\n([\s\S]*?)\n\n/m)?.[1] ?? '')
  .replace(/^\$\{\{/, '')
  .replace(/\}\}$/, '')
const jobIf = flat(workflow.match(/^ {4}if: >-\n([\s\S]*?)\n {4}runs-on:/m)?.[1] ?? '')
const isPr = 'github.event.pull_request.number || github.event.issue.pull_request'
const limit = workflow.match(/^ {2}PR_ATTEMPT_LIMIT: '(\d+)'$/m)?.[1]

test('the PR budget is three requests, as #18 requires, set in one place', () => {
  expect(limit).toBe('3')
  expect(workflow.match(/PR_ATTEMPT_LIMIT:/g)).toHaveLength(1)
  expect(workflow.match(/PR_NUMBER:/g)).toHaveLength(1)
})

test('OpenCode answers both commands the filter admits', () => {
  expect(workflow).toContain('  OPENCODE_MENTIONS: /opencode,/oc\n')
})

test('both comment events start the workflow, on creation only', () => {
  expect(workflow).toContain(
    'on:\n  issue_comment:\n    types: [created]\n  pull_request_review_comment:\n    types: [created]\n\n',
  )
})

test('PR_NUMBER is set for both PR comment events and empty for plain issues', () => {
  expect(workflow).toContain(
    "  PR_NUMBER: ${{ github.event.pull_request.number || (github.event.issue.pull_request && github.event.issue.number) || '' }}\n",
  )
})

test('the budget gate runs in bash, so a failed gh or jq fails the step', () => {
  // The step's other keys sit between its name and `run:`; `-eo pipefail` is Actions' bash default.
  const gateStep = workflow.slice(workflow.indexOf('- name: Check PR budget'), workflow.indexOf('run: &check_budget'))
  expect(gateStep).toContain('shell: bash')
  expect(gateStep).toContain('GH_TOKEN: ${{ github.token }}')
  const agentJob = workflow.slice(workflow.indexOf('\n  opencode:\n'), workflow.indexOf('\n    steps:\n'))
  expect(agentJob).toMatch(/^ {6}actions: read/m)
})

describe('run-name and job if', () => {
  // run-name: <clauses> && format('...admitted...') || format('...comment on...')
  const [admitted, fallback] = split(runName, '||')
  const runNameClauses = split(admitted, '&&')
  const title = runNameClauses.pop()
  // job if: (<isPr> && <starts> || !(<isPr>) && <contains>) && <shared clauses>
  const [branches, ...shared] = split(jobIf, '&&')
  const [prBranch, issueBranch] = split(branches, '||')

  test('have the expected shape', () => {
    const number = 'github.event.pull_request.number || github.event.issue.number'
    expect(split(runName, '||')).toHaveLength(2)
    expect(title).toBe(`format('opencode: admitted PR #{0}', ${number})`)
    expect(fallback).toBe(`format('opencode: comment on #{0}', ${number})`)
    expect(split(jobIf, '||')).toHaveLength(1)
    expect(split(branches, '||')).toHaveLength(2)
  })

  test('admit a PR comment under exactly the same clauses', () => {
    const jobPrClauses = [...split(prBranch, '&&'), ...shared]
    expect([...runNameClauses].sort()).toEqual([...jobPrClauses].sort())
  })

  test('admit a PR comment only for a command at the start from a trusted human', () => {
    expect(split(prBranch, '&&')).toEqual([
      isPr,
      "startsWith(github.event.comment.body, '/oc') || startsWith(github.event.comment.body, '/opencode')",
    ])
    expect(shared).toEqual([
      `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)`,
      "github.event.comment.user.type != 'Bot'",
      "github.event_name != 'pull_request_review_comment' || github.event.pull_request.head.repo.full_name == github.repository",
    ])
  })

  test('the title the gate looks for is the title run-name gives', () => {
    // Checked on the raw text: `flat` would hide a changed space inside the strings.
    expect(workflow).toContain("format('opencode: admitted PR #{0}',")
    expect(budgetScript).toContain('--arg title "opencode: admitted PR #$PR_NUMBER"')
  })

  test('keep the old contains rule for plain issues', () => {
    expect(split(issueBranch, '&&')).toEqual([
      `!(${isPr})`,
      "contains(github.event.comment.body, '/oc') || contains(github.event.comment.body, '/opencode')",
    ])
  })
})

// The budget step, run as bash with a fake `gh` that prints a recorded Actions history.
const budgetScript = (() => {
  const lines = workflow.split('\n')
  const start = lines.findIndex((l) => l.includes('run: &check_budget |')) + 1
  const body: string[] = []
  for (const line of lines.slice(start)) {
    if (line.trim() && !line.startsWith(' '.repeat(10))) break
    body.push(line.slice(10))
  }
  return body.join('\n')
})()

type Run = { id: number; run_number: number; run_attempt: number; pr?: number; status?: string; conclusion?: string }

function gate(history: Run[], current: { id: number; run_number: number; attempt: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'))
  const runs = history.map((r) => ({
    ...r,
    display_title: r.pr === undefined ? 'opencode: admitted PR #20' : `opencode: admitted PR #${r.pr}`,
  }))
  // `gh api --paginate` prints one JSON object per page back to back; split the history in two pages.
  const half = Math.ceil(runs.length / 2)
  const pages = [runs.slice(0, half), runs.slice(half)].map((workflow_runs) => JSON.stringify({ workflow_runs }))
  writeFileSync(join(dir, 'runs.json'), pages.join(''))
  // Fail unless the step pages through all runs of this workflow, as `gh api --paginate` does.
  writeFileSync(
    join(dir, 'gh'),
    `#!/bin/sh\n[ "$*" = "api --paginate repos/owner/repo/actions/workflows/opencode.yml/runs?per_page=100" ] || exit 1\ncat "${join(dir, 'runs.json')}"\n`,
  )
  chmodSync(join(dir, 'gh'), 0o755)
  writeFileSync(join(dir, 'out'), '')
  try {
    execFileSync('bash', ['-eo', 'pipefail', '-c', budgetScript], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_OUTPUT: join(dir, 'out'),
        GITHUB_RUN_ID: String(current.id),
        GITHUB_RUN_NUMBER: String(current.run_number),
        GITHUB_RUN_ATTEMPT: String(current.attempt),
        PR_NUMBER: '20',
        PR_ATTEMPT_LIMIT: limit ?? '',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    return Object.fromEntries(
      readFileSync(join(dir, 'out'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => l.split('=')),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const run = (n: number, attempt = 1, pr?: number): Run => ({
  id: 1000 + n,
  run_number: n,
  run_attempt: attempt,
  pr,
  status: 'completed',
  conclusion: 'success',
})
const cancelled = (r: Run): Run => ({ ...r, conclusion: 'cancelled' })
const queued = (r: Run): Run => ({ ...r, status: 'queued', conclusion: undefined })

describe('budget step', () => {
  test('the third request in a PR is allowed', () => {
    expect(gate([run(1), run(2), run(3)], { id: 1003, run_number: 3, attempt: 1 })).toEqual({
      used: '3',
      allowed: 'true',
    })
  })

  test('the fourth request is blocked before the model, cancelled and queued requests count', () => {
    expect(gate([cancelled(run(1)), run(2), queued(run(3)), run(4)], { id: 1004, run_number: 4, attempt: 1 })).toEqual({
      used: '3',
      reason: 'limit_exhausted',
    })
  })

  test('a Re-run spends an attempt', () => {
    expect(gate([run(1, 2), run(2), run(3)], { id: 1003, run_number: 3, attempt: 1 })).toMatchObject({
      reason: 'limit_exhausted',
    })
  })

  test('a Re-run of an old request counts every newer request', () => {
    expect(gate([run(1, 2), run(2), run(3)], { id: 1001, run_number: 1, attempt: 2 })).toMatchObject({
      reason: 'limit_exhausted',
    })
  })

  test('Re-runs of newer requests count against an older first attempt', () => {
    // 1 (this first attempt) + 2 Re-runs of request 2 + 1 Re-run of request 3 = 4
    expect(gate([run(1), run(2, 3), run(3, 2)], { id: 1001, run_number: 1, attempt: 1 })).toMatchObject({
      reason: 'limit_exhausted',
    })
  })

  test('the gate fails closed when history shows a newer attempt of the current run', () => {
    expect(() => gate([run(1, 2)], { id: 1001, run_number: 1, attempt: 1 })).toThrow()
  })

  test('a Re-run of the newest request counts every older request', () => {
    expect(gate([run(1), run(2), run(3, 2)], { id: 1003, run_number: 3, attempt: 2 })).toMatchObject({
      reason: 'limit_exhausted',
    })
  })

  test('a Re-run within the budget is allowed and counts each run once', () => {
    expect(gate([run(1), run(2, 2)], { id: 1002, run_number: 2, attempt: 2 })).toEqual({ used: '3', allowed: 'true' })
  })

  test('every attempt of an older run counts', () => {
    expect(gate([run(1, 3), run(2)], { id: 1002, run_number: 2, attempt: 1 })).toMatchObject({ reason: 'limit_exhausted' })
    expect(gate([run(1, 2), run(2, 2)], { id: 1002, run_number: 2, attempt: 2 })).toMatchObject({
      reason: 'limit_exhausted',
    })
  })

  test('only the Re-runs of a newer request count against an older first attempt', () => {
    expect(gate([run(1), run(2, 2)], { id: 1001, run_number: 1, attempt: 1 })).toEqual({ used: '2', allowed: 'true' })
  })

  test('runs of other PRs do not count, even with a number that starts the same', () => {
    expect(gate([run(1, 1, 7), run(2, 1, 2), run(3, 1, 200), run(4)], { id: 1004, run_number: 4, attempt: 1 })).toEqual({
      used: '1',
      allowed: 'true',
    })
  })

  test('a newer request waiting in the queue does not take an older request slot', () => {
    expect(gate([run(1), run(2), run(3), run(4)], { id: 1003, run_number: 3, attempt: 1 })).toEqual({
      used: '3',
      allowed: 'true',
    })
  })

  test('a run listed twice across pages counts once, with its latest attempt', () => {
    // A new run shifts the pages between requests, so the same run can appear on both.
    expect(gate([run(1), run(1, 2), run(2)], { id: 1002, run_number: 2, attempt: 1 })).toEqual({
      used: '3',
      allowed: 'true',
    })
  })

  test('the gate fails closed when history lags behind the current attempt', () => {
    expect(() => gate([run(1)], { id: 1001, run_number: 1, attempt: 2 })).toThrow()
  })

  test('the gate fails closed when the current run is missing from history', () => {
    expect(() => gate([run(1)], { id: 1002, run_number: 2, attempt: 1 })).toThrow()
  })
})
