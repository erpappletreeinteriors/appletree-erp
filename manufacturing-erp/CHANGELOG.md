# Changelog

All notable changes to this project are documented in this file.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — Phase 1: Architecture & Foundations

### Added

- Monorepo scaffold (npm workspaces): `apps/backend` (NestJS), `apps/frontend`
  (React + Vite), `packages/shared-types`.
- PostgreSQL schema (Prisma) for `User` and `RefreshToken`, with cursor-based
  pagination on the first list endpoint.
- JWT authentication: login, refresh (with server-side rotation and revocation),
  logout; role-based access control for Admin / Designer / Production Manager /
  Cutting Master / Factory Staff.
- Structured logging (Pino), environment validation (Joi), global exception
  filter, request logging interceptor.
- Health endpoints: `/health/live` (liveness) and `/health/ready` (DB connectivity).
- React frontend: login page, auth context, protected route, dashboard shell
  verifying the authenticated session against `/users/me`.
- Docker: multi-stage Dockerfiles for backend and frontend, `docker-compose.yml`
  wiring Postgres + backend + frontend.
- Tooling: ESLint, Prettier, Jest (backend), Vitest (frontend), GitHub Actions CI.
- Documentation: `ARCHITECTURE.md`, `ROADMAP.md`, `TASKS.md`.

### Notes

- No cutting-list, drawing, or panel domain logic in this release — intentionally
  deferred until the drawing-input format is decided (see `ROADMAP.md`).
