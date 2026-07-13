# Appletree Manufacturing ERP — Architecture

## 1. Scope

This system starts **after** quotation approval. It is not a quotations/costing tool
(that is `appletree_erp_v2_1.html`, a separate system). Its job is to turn an approved
interior drawing into a production-ready cutting list with zero missing panels, zero
duplicate panels, and minimum material wastage.

Phase 1 (this delivery) builds the architecture, tooling, and a working
authentication/authorization skeleton. No cutting-list domain logic ships yet —
that is Phase 2+, once drawing-input format is decided.

## 2. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js 24 LTS + TypeScript + NestJS | NestJS's module/controller/service/DI structure maps directly onto SOLID and enforces modularity instead of relying on developer discipline. Decorators give first-class guards (auth/roles), interceptors (logging), and pipes (validation) — all requirements in this phase — without hand-rolled middleware chains. |
| Frontend | React 18 + TypeScript + Vite | Mature ecosystem for data-dense enterprise UI (tables, forms) that a cutting-list/production tool will need heavily in later phases. Vite gives fast HMR and a simple, standard build. |
| Database | PostgreSQL 16 | Already specified. Strong relational integrity guarantees (FKs, transactions) matter for "zero missing/duplicate panels" — this is not a document-store problem. |
| ORM | Prisma | Type-safe queries generated from a single schema file, first-class migration history, and query performance is predictable (no hidden N+1 magic) — important once volume hits 100k+ projects. |
| Auth | Passport.js + JWT (access + refresh) + bcrypt | Industry-standard, stateless access tokens scale horizontally (no server-side session store needed), refresh-token rotation limits blast radius of a leaked token. |
| Logging | Pino (via `nestjs-pino`) | Structured JSON logs, negligible overhead, request-id correlation out of the box — needed for debugging production issues at scale. |
| Config | `@nestjs/config` + Joi schema validation | Fails fast at boot if a required env var is missing/malformed, instead of failing at first use in production. |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend) | Jest is NestJS's first-party default (CLI scaffolds it, `@nestjs/testing` integrates directly). Vitest shares Vite's config/transform pipeline, avoiding a second bundler in the loop. |
| Lint/Format | ESLint (typescript-eslint) + Prettier | Standard, non-negotiable baseline; Prettier removes style debate, ESLint catches correctness issues (unused vars, floating promises, etc). |
| Containers | Docker (multi-stage) + Docker Compose | Reproducible dev/prod parity; Compose wires Postgres + backend + frontend together with one command. |
| CI | GitHub Actions | Repo-native, free for private repos at this scale, matches the existing GitHub-flavored workflow already implied by this repo's git usage. |

## 3. Repository Layout (monorepo, npm workspaces)

```
manufacturing-erp/
├── apps/
│   ├── backend/            NestJS API
│   └── frontend/           React + Vite SPA
├── packages/
│   └── shared-types/       TS types/enums shared by both apps (Role, auth DTOs)
├── docker-compose.yml
├── .github/workflows/ci.yml
├── ARCHITECTURE.md / ROADMAP.md / TASKS.md / CHANGELOG.md
└── package.json            workspace root
```

A monorepo (not two separate repos) was chosen because the backend and frontend
must stay in lockstep on the cutting-list domain contracts that arrive in Phase 2+;
`packages/shared-types` gives compile-time safety across that boundary instead of
manually-synced interfaces.

## 4. Backend Module Structure

```
apps/backend/src/
├── main.ts                 bootstrap: Pino logger, global ValidationPipe, global exception filter
├── app.module.ts            root module, imports ConfigModule (validated), PrismaModule, AuthModule, UsersModule, HealthModule
├── config/
│   ├── configuration.ts     typed config factory (env → structured object)
│   └── validation.schema.ts Joi schema — boot fails on missing/invalid env
├── common/
│   ├── decorators/           @Roles(), @CurrentUser()
│   ├── guards/                JwtAuthGuard, RolesGuard
│   ├── filters/                AllExceptionsFilter → consistent error JSON shape
│   └── interceptors/          LoggingInterceptor → request/response timing via Pino
├── modules/
│   ├── prisma/                 PrismaService (connection lifecycle, injected everywhere)
│   ├── auth/                    login, refresh, password hashing, JWT strategies
│   ├── users/                   user CRUD (self-service profile + admin listing)
│   └── health/                  /health liveness + DB-connectivity readiness check
└── test/                        e2e specs (Supertest against a real Nest app instance)
```

Each `modules/*` folder is a self-contained Nest module (own controller, service,
DTOs, tests) — this is the modularity/SOLID requirement in concrete form: swapping
the auth strategy or the ORM later touches one module, not the whole app.

## 5. Auth & Roles

Four roles ship in Phase 1, taken directly from the stated target users:
`DESIGNER`, `PRODUCTION_MANAGER`, `CUTTING_MASTER`, `FACTORY_STAFF`, plus `ADMIN`
for system administration. Roles are enforced with a `RolesGuard` reading a
`@Roles(...)` decorator — no route is manually re-checking role strings.

Flow: `POST /auth/login` (email+password) → short-lived access token (15 min) +
long-lived refresh token (7 days, stored hashed in DB, rotated on use) →
`POST /auth/refresh` exchanges a valid refresh token for a new pair →
`GET /users/me` demonstrates a protected, role-aware route.

## 6. Data Model (Phase 1)

Only the auth-supporting tables exist yet — intentionally. Inventing
`CuttingList`/`Panel`/`Drawing` entities now, before the drawing-input format is
decided, would be exactly the kind of premature design the project brief warns
against.

```
User(id, email, passwordHash, fullName, role, isActive, createdAt, updatedAt)
RefreshToken(id, userId, tokenHash, expiresAt, revokedAt, createdAt)
```

Indexes: unique on `User.email`; index on `RefreshToken.userId` and
`RefreshToken.tokenHash` (lookup path on every refresh call). This is the pattern
that will extend to 100k+ `Project`/`CuttingList` rows later: indexed foreign keys,
no unbounded `SELECT *`, cursor-based pagination from the first list endpoint
(`GET /users`) onward.

## 7. Scalability Notes

- Stateless JWT auth → any number of backend instances behind a load balancer, no sticky sessions.
- Prisma connection pooling via `DATABASE_URL` pool params; PgBouncer is a Phase-2+ addition once real concurrency numbers exist — not built speculatively now.
- Pagination is cursor-based from the first list endpoint, not offset-based, so it doesn't degrade as tables grow past 100k rows.
- Structured JSON logs (Pino) are shippable to any log aggregator (CloudWatch/ELK/Datadog) without reformatting.

## 8. What Phase 1 deliberately does NOT include

- Any cutting-list, drawing, panel, nesting/optimization, or project domain model.
- File upload / drawing ingestion (format not yet decided).
- Any AI/ML extraction pipeline.
- Redis/queues/caching — no evidence yet they're needed.

These are explicitly deferred to later phases per the project's own phase-by-phase
mandate; building them now would be building on an undecided requirement.
