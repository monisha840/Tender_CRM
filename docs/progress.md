# Progress log (resume from here)

Run: build + test to production quality, no deployment. Orchestrator prompt: build stages S1–S4-build, test stage T1/T2, bug-fix loop, docs/test-report.md.

## Decisions
- D1 (user): Data layer = Prisma (schema, migrations, all queries, direct Postgres via DATABASE_URL). supabase-js/ssr only for Auth + Storage (src/lib/supabase/). scripts/db.mjs and SQL-migration approach dropped. CLAUDE.md updated.
- D2: Env file is `.env.local` (gitignored); Prisma/test scripts load it via dotenv-cli. APP_ENV=development and E2E_TEST_PASSWORD set there; all keys (no values) in .env.example.
- D3: go-live-plan.md and client PDF moved to docs/ (client-requirements.pdf).
- Deployment out of scope (S3-D, S4 deploy steps skipped).

## Stages
| Stage | Status | Branch | Commits | Notes |
|---|---|---|---|---|
| Setup baseline | done | main | see git log | WIP committed, docs moved |
| S1 schema + data layer | in progress | main | | Schema + seeds written and validated (no migration run). CHECKPOINT: user approval of docs/data-model.md before first migration |
| S2 auth/RBAC/audit/approvals | todo | | | |
| S3-A tenders | todo | build/s3a-tenders | | |
| S3-B projects+subs | todo | build/s3b-projects-subs | | |
| S3-C dashboard+admin | todo | build/s3c-dashboard-admin | | |
| S4-build (import, guides, security) | todo | | | |
| T1 test foundation | todo | | | |
| T2-A/B/C/D suites | todo | | | |
| Bug-fix loop | todo | | | |
| test-report.md | todo | | | |

## Open questions
(none)

## Latest test run
(none yet)
