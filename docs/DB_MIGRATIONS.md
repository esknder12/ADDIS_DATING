# LibMatch — DB migrations (30-second version)

## How schema flows

1. `backend/src/db/schema.sql` is the ONLY source of truth. Every statement is
   idempotent (`IF NOT EXISTS`).
2. Server boot auto-applies it (`initDatabase` in `backend/src/db/index.js`), so
   Render self-heals on every deploy. Render needs no manual step.
3. The E2E workflow applies it via `npm run migrate` on a throwaway Postgres,
   so every push proves the file + script work.

## One command

```bash
# Local Postgres / CI-style (no SSL):
DATABASE_URL=postgres://user:pass@localhost:5432/libmatch npm run migrate --workspace backend

# Neon from your PC (SSL on):
DATABASE_URL='postgres://...' DATABASE_SSL=true npm run migrate --workspace backend

# Verify-only (no writes), e.g. against Neon after a deploy:
DATABASE_URL='postgres://...' DATABASE_SSL=true npm run migrate --workspace backend -- --check
```

The script applies `schema.sql`, then verifies all 17 expected tables exist.

## Rules

- All schema changes go through `schema.sql` as idempotent statements
  (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, partial-index
  guards). Never hand-run SQL in the Neon console.
- After editing `schema.sql`, run the unit suite (`migrate.test.js` guards the
  table checklist) and let E2E prove the apply on a fresh database.
