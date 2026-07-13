# Roadmap — Appletree Manufacturing ERP

This system generates production-ready cutting lists from **approved** interior
drawings. It is not a quotation tool; that work happens upstream in
`appletree_erp_v2_1.html` before a project ever reaches this system.

Each phase must be fully functional, tested, and reviewed before the next one
starts — no phase begins on top of an unfinished or unverified previous phase.

## Phase 1 — Architecture & Foundations ✅ Complete

- Tech stack selected and justified (see [ARCHITECTURE.md](ARCHITECTURE.md)).
- Monorepo scaffolded: NestJS backend, React+Vite frontend, shared TS types package.
- PostgreSQL + Prisma wired up with a migration-ready schema (`User`, `RefreshToken`).
- JWT auth (access + rotating refresh tokens) with role-based guards for the five
  target roles (Admin, Designer, Production Manager, Cutting Master, Factory Staff).
- Structured logging (Pino), validated environment config, health checks (liveness
  + DB readiness).
- ESLint + Prettier + Jest/Vitest + GitHub Actions CI, all green with zero warnings.
- Docker multi-stage builds for backend and frontend + docker-compose stack.

## Phase 2 — Drawing Ingestion (not started)

Blocked on one decision that determines the entire design: **how does an approved
drawing enter the system?** Candidates, roughly in order of implementation cost:

1. Structured manual entry (designer keys in rooms/panels/dimensions directly).
2. Spreadsheet/CSV import of a standard panel schedule.
3. PDF/image upload with AI-assisted extraction (dimensions, panel counts) and a
   human correction step before anything is trusted.
4. Direct CAD file import (DXF/DWG) — highest fidelity, highest integration cost.

This phase should not start until that decision is made with the CEO/design team;
building the extraction pipeline before knowing the input format would be building
on a guess.

## Phase 3 — Cutting List Generation (not started)

- Panel/material domain model (depends entirely on Phase 2's chosen input shape).
- Deduplication and completeness validation — the "zero missing / zero duplicate
  panels" requirement needs an explicit reconciliation step, not just trust in
  the input.
- Material-aware costing hooks into the existing ERP's material master (read-only
  integration with `appletree_erp_v2_1.html`'s item master, not a duplicate one).

## Phase 4 — Nesting / Optimization (not started)

- Panel nesting / sheet optimization algorithm to minimize wastage.
- Human review & override workflow before a cutting list is released to the floor
  — the algorithm proposes, a Cutting Master approves.

## Phase 5 — Factory Floor Integration (not started)

- Cutting Master and Factory Staff execution views.
- Hooks into the existing ERP's Manufacturing Jobs/Operations module (per
  `project_context.md` memory) rather than duplicating job tracking here —
  this system produces the cutting list; the ERP already tracks job execution.

## Explicitly out of scope until requested

- Quotation/costing features of any kind (that's the other ERP).
- Any AI/ML pipeline before Phase 2's input-format decision is made.
- Redis/queues/horizontal-scaling infrastructure — add when real load data
  justifies it, not speculatively.
