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

## Acting on a report (test phase = manual)

There is no moderation-write endpoint yet, so actions run in the Neon SQL
console against the test database:

```sql
-- Mark a report reviewed / actioned / dismissed:
UPDATE reports SET status = 'actioned' WHERE id = 12;

-- Severe abuse (harassment, scam): remove the offender entirely.
-- Cascades wipe their profile, photos, swipes, matches, messages, blocks.
DELETE FROM users WHERE id = 45;
```

Then tell the reporter what happened (Telegram DM). For a first-time fake
photo, prefer warning + asking for a retake over deletion.

## Pre-public backlog (from this runbook)

- [ ] `PATCH /api/admin/reports/:id` (status transitions, no console SQL)
- [ ] `POST /api/admin/users/:id/ban` (reversible ban + reason, no row delete)
- [ ] Server-side face check or human photo approval (closes the P1 #5 gap)
