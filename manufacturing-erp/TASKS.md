# Tasks — Phase 1

## Done

- [x] Architecture designed and documented (`ARCHITECTURE.md`).
- [x] Monorepo scaffolded (npm workspaces: `apps/backend`, `apps/frontend`, `packages/shared-types`).
- [x] Backend: NestJS app — config validation, Pino logging, Prisma/PostgreSQL,
      JWT auth (login/refresh/logout with refresh-token rotation), role guard,
      `/users/me` + paginated `/users`, `/health/live` + `/health/ready`.
- [x] Frontend: React+Vite app — login page, auth context, protected route,
      dashboard shell that calls the protected `/users/me` endpoint.
- [x] Docker: multi-stage Dockerfiles for both apps, `docker-compose.yml` with
      Postgres, backend, frontend wired together.
- [x] Tooling: ESLint + Prettier (both apps), Jest (backend unit + e2e), Vitest
      (frontend), GitHub Actions CI workflow.
- [x] Verification: `npm install`, `npm run build`, `npm run lint`,
      `npm run format:check`, and the full test suite (16 backend unit + 1
      backend e2e + 3 frontend tests = 20/20) all pass with **zero warnings**.
- [x] Frontend visually verified in a live browser (login form renders, no
      console errors); full login→dashboard round trip could not be exercised
      end-to-end because no PostgreSQL instance is running in this environment
      (see "Known limitations" below).

## Known limitations / carried-forward technical debt

- **No live database in this environment.** Node.js was installed for this
  build; Docker/Postgres were not (per the scope agreed for this phase). The
  full login→JWT→protected-route flow is covered by unit tests and a live
  frontend render, but has not been exercised against a real running backend +
  Postgres. Before Phase 2 work starts, run `docker compose up` (or a local
  Postgres) and confirm `npm run prisma:migrate` + `npm run prisma:seed` +
  a real login round-trip.
- **Refresh tokens are stored in `localStorage`** on the frontend (access token
  stays in memory). This is a reasonable Phase 1 trade-off since the backend
  issues tokens as JSON, not cookies — revisit if httpOnly-cookie storage
  becomes a requirement.
- **No CI run has actually executed on GitHub** — the workflow file is written
  and path-scoped to `manufacturing-erp/**`, but this repo does not yet have
  this branch pushed to a remote with Actions enabled.

## Next (Phase 2 kickoff — do not start without this decision)

- [ ] Decide the drawing-input format (manual entry vs. spreadsheet import vs.
      AI-assisted PDF/image extraction vs. CAD import) — see `ROADMAP.md` Phase 2.
