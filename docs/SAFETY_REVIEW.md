# Dategram — safety review runbook (test phase)

## Face-gate risk acceptance (owner decision, 2026-10-26)

The "real face" photo check runs **only in the Mini App**. A technical user can
`POST /api/profile/photos` directly and skip it. For the **test phase** this is
accepted because:

- Test users are invited, not strangers from the public.
- The backstop is real: any user can **Report** a fake photo (reason
  `fake_profile`) → it lands in the review queue below within seconds.
- Reports default to also blocking, so the reporter is protected immediately.

**Before public launch** this must be replaced by a server-side check
(Cloudinary `adv_face` on upload) or human photo approval. Do not go public on
the client-side gate alone.

## Review queue (5-minute flow, from your PC)

You need your `ADMIN_API_KEY` (the code Render generated; saved offline).
Never paste it in chat or commit it anywhere.

```bash
API=https://addis-dating-test.onrender.com
KEY='paste-your-admin-key-here'

# Open reports, newest first (status: open|reviewed|actioned|dismissed|all)
curl -s -H "x-admin-key: $KEY" "$API/api/admin/reports?status=open&limit=50"
```

Each row has `id`, `reason`, `details`, `status`, `created_at`,
`reporter_id`/`reporter_name`, `reported_id`/`reported_name`.

## Acting on a report

No console SQL needed — the admin API covers the loop:

```bash
# Move a report through the queue (open -> reviewed -> actioned/dismissed):
curl -s -X PATCH -H "x-admin-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"status":"reviewed"}' "$API/api/admin/reports/12"

# Severe abuse (harassment, scam): ban the offender (reversible).
# Banned users vanish from discovery, every authenticated call 404s,
# and sockets refuse them on reconnect:
curl -s -X POST -H "x-admin-key: $KEY" "$API/api/admin/users/45/ban"

# Mistake / time served: restore them.
curl -s -X POST -H "x-admin-key: $KEY" "$API/api/admin/users/45/unban"
```

Then tell the reporter what happened (Telegram DM). For a first-time fake
photo, prefer warning + asking for a retake over a ban. Fallback if the API
is down: the same changes are one `UPDATE` each in the Neon console
(`reports.status`, `users.is_active`). Permanent erasure stays
`DELETE FROM users WHERE id = N;` (cascades everything).

## Pre-public backlog (from this runbook)

- [x] `PATCH /api/admin/reports/:id` — shipped + E2E-covered
- [x] `POST /api/admin/users/:id/ban|unban` — shipped + E2E-covered (reversible `is_active` flip)
- [ ] Server-side face check or human photo approval (closes the P1 #5 gap)
