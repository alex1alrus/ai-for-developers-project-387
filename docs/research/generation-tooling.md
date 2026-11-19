# Инструменты генерации из контракта TypeSpec (#5)

Дата проверки: 2026-11-18. Версии взяты из registry.npmjs.org. Всё в разделе «Проверено» прогнано в scratch-каталоге на Node 24.22.3 с `typescript@7.0.2` (tsgo): игрушечный контракт (2 операции, 4 модели).

## Рекомендация

```
TypeSpec ──@typespec/openapi3──▶ openapi.yaml ──@hey-api/openapi-ts──▶ src/api/   (types + sdk + client-fetch)
                                              └─@hey-api/openapi-ts──▶ server/api/ (types + fastify RouteHandlers)
openapi.yaml ──fastify-openapi-glue (runtime)──▶ маршруты Fastify + валидация запросов через ajv
```

| Роль | Пакет | Версия |
|---|---|---|
| Компилятор контракта | `@typespec/compiler`, `@typespec/http` | 1.18.0 |
| OpenAPI 3 YAML | `@typespec/openapi3` (+ peer `@typespec/openapi`) | 1.18.0 |
| Клиент и типы сервера | `@hey-api/openapi-ts` | `0.0.0-next-20260930190945` (точный pin, см. риски) |
| Маршруты и валидация Fastify | `fastify-openapi-glue` | 4.12.0 |

Почему так:
- Один артефакт (`openapi.yaml`) питает и фронт, и сервер. Отдельные JSON Schema не нужны: glue сам берёт схемы из OpenAPI и вешает их на маршруты как `schema.body/params/querystring`. В прогоне невалидный POST вернул 400 `FST_ERR_VALIDATION`.
- hey-api даёт и клиент, и плагин `fastify`, который генерирует тип `RouteHandlers` специально под glue (https://heyapi.dev/openapi-ts/plugins/fastify). Получается одна конфигурация на обе стороны.
- Генерируемые типы проходят erasable-проверку: только `export type`, без `enum` и `namespace` (enum по умолчанию выключен). Для сервера `output.importFileExtension: '.ts'` даёт импорты `./types.gen.ts`, их понимает Node type stripping.
- TypeSpec-эмиттеры не зависят от пакета `typescript` и работают при установленном TS 7.

## Установка и команды

```bash
npm i -D @typespec/compiler@1.18.0 @typespec/http@1.18.0 @typespec/openapi@1.18.0 @typespec/openapi3@1.18.0 \
  @hey-api/openapi-ts@0.0.0-next-20260930190945
npm i fastify-openapi-glue@4.12.0
npx tsp compile spec/main.tsp      # -> openapi.yaml
npx openapi-ts                     # -> src/api, server/api (читает openapi-ts.config.ts)
```

npm при установке `@typespec/openapi3` подтягивает peers (`@typespec/json-schema`, `versioning`, `streams`, `sse`, `events`) автоматически. В `mise.toml` стоит завести задачу `gen` (обе команды) и добавить в `check` шаг `gen` + `git diff --exit-code` на сгенерированные файлы, если их коммитим.

`tspconfig.yaml`:

```yaml
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    emitter-output-dir: "{project-root}/spec/generated"
    output-file: "openapi.yaml"
    openapi-versions: ["3.1.0"]   # по умолчанию 3.0.0; проверено на 3.1.0
```

`openapi-ts.config.ts` (запускается самим CLI, это не код сервера):

```ts
import { defineConfig } from '@hey-api/openapi-ts';
export default defineConfig([
  { input: './spec/generated/openapi.yaml', output: './src/api',
    plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'] },
  { input: './spec/generated/openapi.yaml', output: { path: './server/api', importFileExtension: '.ts' },
    plugins: ['@hey-api/typescript', 'fastify'] },
]);
```

Сервер (проверено через `node server/app.ts`, затем `tsc` 7.0.2 с `erasableSyntaxOnly` и `verbatimModuleSyntax`):

```ts
import glue from 'fastify-openapi-glue';
import type { RouteHandlers } from './api/fastify.gen.ts';
const serviceHandlers: RouteHandlers = {
  createBooking(req, reply) { reply.code(201).send({ id: 'b1', ...req.body, status: 'confirmed' }); },
  // ...
};
await app.register(glue, { specification: 'spec/generated/openapi.yaml', serviceHandlers });
```

Важная деталь типов: тип `RouteHandler` из Fastify не принимает `return reply.send(...)`, потому что `FastifyReply` не совпадает с типом `Reply`. Поэтому либо вызываем `reply.send()` без `return`, либо пишем `async` и возвращаем данные.

## Проверено

- `tsp compile` 1.18.0 на Node 24.22.3 выдал `openapi.yaml` 3.1.0; `@typespec/json-schema` выдал bundle 2020-12. Оба работают при установленном `typescript@7.0.2`.
- `@hey-api/openapi-ts@0.99.0` (latest) с `typescript@7.0.2` падает: `TypeError: Cannot read properties of undefined (reading 'AnyKeyword')`. Причина в том, что `import ts from "typescript"`, а у TS 7 нет compiler API в корне пакета (exports `.` указывает на `lib/version.cjs`).
- `@hey-api/openapi-ts@0.0.0-next-20260930190945` с TS 7 сгенерировал клиент и сервер без ошибок. У него нет peer-зависимости `typescript` (registry).
- Сгенерированный клиент проходит `tsc` 7.0.2 (`moduleResolution: bundler`, `erasableSyntaxOnly`), сервер проходит `tsc` 7.0.2 (`module: nodenext`, `allowImportingTsExtensions`).
- `openapi-typescript@7.13.0` не ставится рядом с `typescript@7.0.2`: npm ERESOLVE, peer `typescript@^5.x`.

## Риски и ограничения

1. **hey-api на prerelease.** Поддержка TS 7 (удаление зависимости от `typescript`) есть только в `next`; stable 0.99.0 вышла 2026-06-22, новых stable с тех пор нет. Issue открыт: https://github.com/hey-api/hey-api/issues/4235. Версия `0.0.0-next-*` по semver меньше `0.97.3`, поэтому `npm audit` и Renovate ошибочно считают её уязвимой по GHSA-hhx9-57xq-r5rw (medium, `< 0.97.3`): https://github.com/advisories/GHSA-hhx9-57xq-r5rw (об этом пишут в комментарии к #4235). Если `check` запускает `npm audit`, нужно исключение. Пакет до 1.0, и в minor-версиях бывают ломающие изменения; pin точный.
   - Запасной вариант (рекомендация Microsoft): `0.99.0` + `"typescript": "npm:@typescript/typescript6@^6.0.2"`, `"@typescript/native": "npm:typescript@^7.0.2"`. Тогда `tsc` = 7, а генераторы видят API 6.0: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0. Минус: в дереве два компилятора.
2. **Плагин `fastify` в hey-api помечен Beta** (https://heyapi.dev/openapi-ts/plugins/fastify). Он генерирует только типы `Body/Params/Querystring/Headers/Reply`, без заглушек реализации.
3. **ajv draft-07.** Fastify по умолчанию валидирует по draft-07, а OpenAPI 3.1 подразумевает 2020-12. Для простых схем этого хватает (проверено). Если понадобятся `unevaluatedProperties` и подобное, нужен `Ajv2020`: https://github.com/seriousme/fastify-openapi-glue/blob/master/docs/schema2020.md. Альтернатива: `openapi-versions: ["3.0.0"]`.
4. **Валидация ответов** glue по умолчанию не делает. Сериализация ответов идёт по схемам ответов из OpenAPI (fast-json-stringify), поэтому лишние поля отрежутся.
5. Сгенерированный клиент импортирует без расширений (`./types.gen`). Для Vite это нормально, но сервер не должен импортировать `src/api`: у него свой выход `server/api`.
6. oxlint и Vitest: сгенерированные каталоги нужно добавить в ignore линтера.

## Отклонённые варианты

- **openapi-typescript 7.13.0 + openapi-fetch 0.17.0.** Не работают с TS 7: peer `typescript@^5.x`, используют `ts.factory`. Issue открыт: https://github.com/openapi-ts/openapi-typescript/issues/2841. Последний релиз 2026-02-11. Типов под Fastify-хендлеры не дают.
- **@typespec/http-client-js 0.16.4.** Генерирует отдельный npm-пакет (`package.json`, `tsconfig`, сборка через `tsc`, `typescript@^5.5.2`, рантайм `@typespec/ts-http-runtime` 0.2.1, `uri-template`), то есть лишний build-шаг. Версия 0.x, в TypeSpec-доках помечена preview. Проверено генерацией.
- **OpenAPI Generator typescript-fetch** (`@openapitools/openapi-generator-cli` 2.42.2). Это обёртка над Java JAR, ей нужна JVM, а в стеке её нет. Генерирует классы и `enum`, это не erasable-стиль.
- **@typespec/http-server-js 0.58.0-alpha.30.** Alpha, генерирует свой роутер под Node http/Express, а не Fastify.
- **@typespec/json-schema 1.18.0 как источник валидации.** Работает (bundle draft 2020-12), но схемы пришлось бы вручную привязывать к каждому маршруту, и нужен `Ajv2020`. glue делает то же из `openapi.yaml` без ручной разводки. Пригодится, если откажемся от glue.
- **`openapi-glue` CLI** (генерация проекта-заглушки): даёт JS-скелет и тесты, нам хватает типа `RouteHandlers`.

## Источники

- npm registry: https://registry.npmjs.org/@typespec/openapi3, https://registry.npmjs.org/@hey-api/openapi-ts, https://registry.npmjs.org/fastify-openapi-glue, https://registry.npmjs.org/typescript, https://registry.npmjs.org/openapi-typescript, https://registry.npmjs.org/@typespec/http-client-js
- TypeSpec OpenAPI3 emitter: https://typespec.io/docs/emitters/openapi3/reference/emitter/
- hey-api Fastify plugin: https://heyapi.dev/openapi-ts/plugins/fastify; TS 7 issue: https://github.com/hey-api/hey-api/issues/4235; закрытый PR: https://github.com/hey-api/hey-api/pull/4236
- fastify-openapi-glue README: https://github.com/seriousme/fastify-openapi-glue/blob/master/README.md
- TypeScript 7.0 announcement: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
