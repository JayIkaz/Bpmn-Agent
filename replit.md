# Workspace

## BPMN 2.0 Converter

A full-stack AI-powered tool that converts plain-language business process descriptions into valid BPMN 2.0 XML.

### Features
- Text input for plain-English process descriptions
- AI-powered BPMN 2.0 XML generation (GPT-5.2 via Replit AI Integrations)
- Optional clarification step before conversion
- Element mapping table (Step → BPMN Element → Type → Actor/Lane)
- Issues & Assumptions report with ⚠️/🔴 indicators
- Copy and download the generated XML
- Full BPMN 2.0 compliance: swimlanes, gateways (XOR/AND/OR), boundary events, message flows

### Architecture
- Frontend: React + Vite at `/` (`artifacts/bpmn-converter`)
- Backend: Express API server at `/api` (`artifacts/api-server`)
- AI: Claude Opus 5 via the Anthropic API (`@anthropic-ai/sdk`). Client:
  `artifacts/api-server/src/lib/anthropic.ts`. Needs `ANTHROPIC_API_KEY` (or an
  `ant auth login` profile) — see `.env.example`.
- Routes: `POST /api/bpmn/convert`, `POST /api/bpmn/clarify`
- Both routes use **structured outputs**: generation is constrained to a zod
  schema, so responses cannot come back mis-shaped and need no defensive
  parsing. Schemas live next to the routes; `outputFormat()` converts them via
  the `zod/v4` subpath rather than the SDK's `zodOutputFormat` helper, which
  requires zod v4 at the package root and throws against this workspace's pin.
- `BPMN_SYSTEM_PROMPT` is sent as a cached system block — it is identical on
  every request and over the 512-token minimum, so it bills at cache-read rates.
- Diagram layout: `bpmn-auto-layout`. The model emits the **semantic** model only —
  no `<bpmndi:BPMNDiagram>`, no coordinates. `/bpmn/convert` validates that model
  structurally (`validate-bpmn-xml.ts` — namespaces, unique IDs, sequence-flow
  endpoints, gateway flow counts, lane membership), retrying the model once on
  failure, then pipes it through `layoutProcess()` to generate all shapes, bounds,
  edges and waypoints. Never reintroduce coordinate maths into the prompt or
  geometry checks into the validator; layout is the layout engine's job.
- `pnpm --filter @workspace/api-server run verify:layout` exercises validation +
  layout against a fixed sample, with no Claude API call.

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL` — see `.env.example`)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Apply schema changes with `pnpm --filter @workspace/db run push`, falling back to `pnpm --filter @workspace/db run push-force`. Production migrations used to be handled by Replit on publish; that is now unowned — wire it into whatever deploy pipeline replaces it.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
