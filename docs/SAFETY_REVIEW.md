# LibMatch — safety review runbook (test phase)

## Face-gate risk acceptance (owner decision, 2026-10-26)

The "real face" photo check runs **only in the Mini App**. A technical user can
`POST /api/profile/photos` directly and skip it. For the **test phase** this is
accepted because:

- Test users are invited, not strangers from the public.
- The backstop is real: any user can **Report** a fake photo (reason
  `fake_profile`) → it lands in the review queue below within seconds.
- Reports default to also blocking, so the reporter is protected immediately.

**Update (human approval queue shipped):** every new upload now starts
`pending` — invisible to everyone except its owner — until approved below.
The client face check stays as the first line; the queue is the enforcement.
Before public launch, keep the queue (human eyes beat paid detection at this
scale) or add Cloudinary `adv_face` as a pre-filter.

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

## Photo review queue

```bash
# Oldest pending photo first (status: pending|approved|rejected):
curl -s -H "x-admin-key: $KEY" "$API/api/admin/photos?status=pending&limit=20"

# Approve / reject (final — rejected owners must upload a fresh photo):
curl -s -X PATCH -H "x-admin-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"status":"approved"}' "$API/api/admin/photos/31"
```

Rules: approve real, clearly-you photos. Reject cartoons, celebrities,
group-only shots you can't verify, and anything explicit (ban repeat
offenders). Rejected photos vanish for others instantly; the owner sees the
rejection and can replace the photo.

**Fast path — Telegram buttons (recommended):** every upload DMs you the
photo with ✅ Approve / ❌ Reject buttons; the user is notified of your
decision automatically. One-time setup: message `@userinfobot` on Telegram
to get your numeric id, then add `ADMIN_TELEGRAM_ID=<your id>` to the
backend's Render env vars and redeploy. Without it, uploads still work —
review falls back to the curl commands above.

## Verification review

Every video note DMs you automatically: the video itself, then the user's
profile photo (compare the faces ☝️), then a card with ✅ Verify / ❌ Reject
buttons. Verify grants the badge instantly; Reject
resets the user to unverified (they can retry) and tells them why. The user
is notified of your decision either way. Videos over 10 seconds are
declined automatically with re-record guidance — they never reach you.

Curl fallback (same shapes as photos):

```bash
curl -s -H "x-admin-key: $KEY" "$API/api/admin/verifications?status=pending"
curl -s -X PATCH -H "x-admin-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"status":"approved"}' "$API/api/admin/verifications/7"
```

(`approved` → badge granted; `rejected` → back to unverified.)

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
- [x] Human photo approval — pending-by-default + admin queue shipped + E2E-covered
- [x] Bot DM approve/reject buttons + automatic user decision DMs
- [x] Owner "pending review" / "rejected" badges in-app
- [ ] Optional later: Cloudinary `adv_face` as an automatic pre-filter
- [x] Verification-video review — owner DM with video + ✅/❌ buttons, user decision DMs, REST fallback, E2E-covered
