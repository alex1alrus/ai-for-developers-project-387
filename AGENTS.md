# AGENTS.md

Call booking service (Cal.com-like): one owner, guests book free slots. Scenario, booking rules and limits: `README.md`.

## Commands

Tools and tasks live in `mise.toml` (Node, hk, pitchfork pinned there).

- `mise install` — install tools, npm deps, Chromium for Playwright and git hooks (postinstall runs `mise run setup`).
- `mise run dev` — start daemons: API on `127.0.0.1:3000`, Vite on `127.0.0.1:5173` (proxies `/api`). `mise daemons status|logs|stop` to manage.
- `mise run lint` — oxlint.
- `mise run typecheck` — `tsc -b` for web and server.
- `mise run test` — Vitest. Single test: `npx vitest run server/app.test.ts -t "<name>"`.
- `mise run gen` — generate OpenAPI, frontend SDK and server types from the TypeSpec contract.
- `mise run e2e` — Playwright scenario from `README.md` in Chromium (`e2e/*.e2e.ts`, config `playwright.config.ts`). Its `webServer` runs `npm run build && npm start` on port 3100, real time, no API mocks. Part of `check`.
- `mise run check` — `gen:check` (regenerate, fail if any generated file changed or appeared), then lint, typecheck, test, build and e2e; the same command runs in the pre-commit hook (hk) and GitHub Actions.
- `mise run build` — production build of the frontend into `dist/`.

## Structure

- `spec/main.tsp` — TypeSpec API contract, the single source of truth for the API.
- `src/` — React + Mantine frontend (Vite). It calls the API only through the generated SDK in `src/api`.
- `server/` — Fastify API, run by Node directly (type stripping, no build step). `app.ts` builds the app, `index.ts` listens on `PORT`. `npm start` also serves the built `dist/` via `@fastify/static`, with SPA fallback (ADR-0001): `index.html` for any other `GET` outside `/api`, 404 `ApiError` `NOT_FOUND` otherwise. Routes and request validation come from the OpenAPI file via `fastify-openapi-glue`; handlers are typed by `RouteHandlers` from `server/api`.
- `server/*.test.ts` — Vitest tests via `app.inject`.
- `e2e/*.e2e.ts` — Playwright browser scenario. The `.e2e.ts` suffix keeps Vitest from picking it up; Playwright only looks in `e2e/`.

## Contract and generated code

Generated paths, never edit them by hand:

- `spec/generated/` — OpenAPI 3.1 (`tsp compile`, config in `tspconfig.yaml`).
- `src/api/` — frontend types, SDK, fetch client and JSON schemas (`openapi-ts`, config in `openapi-ts.config.ts`).
- `server/api/` — server types and Fastify `RouteHandlers`.

To change the API: edit `spec/main.tsp`, run `mise run gen`, then update the code of both sides (server handlers, frontend calls) and commit the generated files with them.

## Rules

- Commits follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`.
- An implementation commit references the ticket it closes in the subject: `feat: book a free slot (#19)`.
- Server code must use erasable TypeScript only (no enums, namespaces, parameter properties) and import local files with the `.ts` extension.
- `mise run check` must pass before commit.

## Agent skills

Engineering skills from `mattpocock/skills` live in `.claude/skills/` (pinned in `skills-lock.json`).

### Issue tracker

GitHub Issues of `alex1alrus/ai-for-developers-project-387`, via `gh`. See `docs/agents/issue-tracker.md`.

### Origin: first project

The app was built in `alex1alrus/ai-for-developers-project-386` and moved here as is. Its spec and decisions stay in that repo's issues (closed, read-only history); new work goes to this repo's tracker only.

- Spec: [#12 «Спецификация: запись на звонок»](https://github.com/alex1alrus/ai-for-developers-project-386/issues/12).
- Decision map: [#1 «Карта: спецификация записи на звонок»](https://github.com/alex1alrus/ai-for-developers-project-386/issues/1), each decision in its closed child issue (#2–#11).
- Implementation tickets: #15–#22 there. `CHANGELOG.md` links to those issues and commits.
- Glossary and ADRs moved with the code: `GLOSSARY.md`, `docs/adr/`.

A bare `#N` in old commits and `CHANGELOG.md` refers to the first repo, not this one.

### In GitHub Actions

`.github/workflows/opencode.yml` runs OpenCode on `/oc` or `/opencode` from a trusted collaborator; see `README.md` → «Агент OpenCode». There `gh` uses `GH_TOKEN` with `issues: write`: read, comment, label and create issues with `gh` (shown as `github-actions[bot]`). Code and PRs are read-only for it; commits and PRs go through OpenCode itself (GitHub App `opencode-agent`).

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root, decisions in `docs/adr/`. See `docs/agents/domain.md`.
