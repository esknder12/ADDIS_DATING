# Dategram — Neon backup + restore drill (do once, then quarterly)

## 1. Confirm PITR is on (2 min, phone-friendly)

1. Open `console.neon.tech` → your project → **Branches**.
2. Note the **history window** shown for the main branch (Neon keeps every
   change for this long — this is your point-in-time-restore range).
3. If the window is shorter than you need, upgrade the Neon plan *before*
   you need a restore, not after.

## 2. Restore drill (10 min, zero risk to live data)

Neon branches are instant copy-on-write clones — the drill never touches prod:

1. **Branches → New Branch** → name it `restore-drill-YYYY-MM-DD`.
   - Optional: pick "from a past timestamp" (~1 hour ago) to prove
     point-in-time works, not just "clone latest".
2. Open the new branch → copy its **pooled connection string**.
3. From your PC, verify-only against the clone (no writes):
   ```bash
   DATABASE_URL='<paste-branch-url>' DATABASE_SSL=true \
     npm run migrate --workspace backend -- --check
   ```
   Expect: `verified 17/17 tables present`.
4. (Optional, stronger) Point a local backend at the branch URL and load one
   known profile via the API.
5. **Delete the drill branch** in the Neon console to stop its compute.

## 3. Record it

Reply in the project thread (or append here): date + "PITR window = X days +
restore drill passed". An untested backup is not a backup.

## Pre-public backup bar

- [ ] PITR window confirmed ≥ 7 days on the **prod** project (test ≠ prod)
- [ ] One restore drill passed on prod (branch → verify → delete branch)
- [ ] Prod and test are separate Neon projects (a test wipe must never
      threaten prod data)
