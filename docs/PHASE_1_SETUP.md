# Phase 1 setup — from zero to a real Telegram login

Goal: send `/start` to your bot, tap **Go to Dategram**, the Mini App opens, and your Telegram
account appears in the `users` table. Everything below is free and takes about 20 minutes.

What you need: a computer with internet, a Telegram account, a GitHub account.

| Piece | Choice in this guide | Why |
|---|---|---|
| Database | **Neon** (free PostgreSQL) | nothing to install, works from any machine, free tier never expires |
| HTTPS URL | **cloudflared** quick tunnel | no account, no warning page inside Telegram, one command |
| Where it runs | **your PC** (or GitHub Codespaces, see the end) | no code changes, bot + API + web all in `npm run dev` |

---

## Step 1 — Install Node.js and get the code

1. Install **Node.js 22 LTS** from <https://nodejs.org> (choose the LTS download; accept defaults).
2. Install **Git** from <https://git-scm.com/downloads> if `git --version` does not work.
3. In a terminal (Windows: PowerShell; macOS/Linux: Terminal):

```bash
git clone https://github.com/esknder12/ADDIS_DATING.git
cd ADDIS_DATING
npm install
```

Check: `node --version` prints `v20` or higher.

---

## Step 2 — Create a free PostgreSQL database on Neon

1. Open <https://neon.tech> → **Sign up** → continue with GitHub.
2. **Create project**:
   - Project name: `dategram`
   - Postgres version: leave the default
   - Region: pick the closest one (from Ethiopia, **Europe – Frankfurt** is usually best)
   - Click **Create**.
3. On the project dashboard click **Connect** (or **Connection string**).
   - Role: `neondb_owner` (default) · Database: `neondb` (default) — both are fine.
   - Copy the string. It looks like
     `postgresql://neondb_owner:npg_xxxxxxxx@ep-xxxx-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
   - Treat it like a password: it contains one.

You do **not** need to create tables. The API runs `backend/src/db/schema.sql` on every start
(`CREATE TABLE IF NOT EXISTS …`), so an empty database is exactly right.

**Shortcut with the Neon CLI (optional, avoids copy-paste mistakes).** The project ID is shown in
the Neon dashboard URL / project settings. Run this inside the `ADDIS_DATING` folder on your PC
(it needs a browser for the login, so it cannot run in a remote sandbox):

```bash
npm i -g neon@latest
neon login                                                            # opens your browser
neon link --project-id <your-project-id> --branch production -y --no-env-pull
neon env pull --file backend/.env --env DATABASE_URL                  # writes ONLY DATABASE_URL into backend/.env
```

`neon env pull` updates just the Neon variable and preserves every other line in `backend/.env`
(your `BOT_TOKEN` stays). Then set `DATABASE_SSL=true` and continue with Step 3.

The Neon dashboard also offers an "agent setup" snippet (`neon skills`, `neon mcp`, `neon config init`,
`neon deploy`). Those steps install Neon helpers into coding agents on your computer and set up
config-as-code for Neon Auth / Functions / Data API — Dategram uses none of those, so they are not
required for Phase 1.

Tip: Neon's free database "sleeps" after a few minutes without traffic and wakes up on the next
query. The first request after a pause may take 1–2 seconds — that is normal.

---

## Step 3 — Create `backend/.env`

```bash
cp .env.example backend/.env          # Windows PowerShell: copy .env.example backend\.env
```

Open `backend/.env` in any editor and fill the Phase 1 block:

```env
BOT_TOKEN=123456789:AAF...                       # from @BotFather → /mybots → API Token
WEBAPP_URL=https://placeholder.example           # we replace this in Step 5
DATABASE_URL=postgresql://neondb_owner:...       # the Neon string from Step 2, unchanged
DATABASE_SSL=true
```

Notes:
- No quotes, no spaces around `=`.
- The file must be at `backend/.env` — the API does not read a `.env` in the repository root.
- Optional: change `sslmode=require` to `sslmode=verify-full` inside `DATABASE_URL`. Same behaviour,
  and it silences a deprecation warning printed by the `pg` library on startup.

---

## Step 4 — Start the app and run the doctor

Terminal 1:

```bash
npm run dev
```

You should see, in any order:

```
✅ PostgreSQL schema initialized
🚀 Dategram API + Socket.io listening on http://0.0.0.0:4000
🤖 @YourBotName bot polling started
  ➜  Local:   http://localhost:3000/
```

Terminal 2:

```bash
npm run doctor
```

The doctor checks the token with Telegram, connects to the database, and looks at the running
API. At this point everything should be ✅ except `WEBAPP_URL` (we fix that next).
If something is ❌, the line under it says what to do.

---

## Step 5 — Give the frontend a public HTTPS address

Telegram opens Mini Apps only over **HTTPS** and cannot reach `localhost`, so we tunnel port 3000.
We tunnel **3000, not 4000**: the frontend calls `/api/...` with relative URLs and Vite forwards
them to the API, so one public URL covers both.

Install cloudflared (one time):
- Windows: download `cloudflared-windows-amd64.exe` from
  <https://github.com/cloudflare/cloudflared/releases/latest>, rename it to `cloudflared.exe`
- macOS: `brew install cloudflared`
- Linux: download `cloudflared-linux-amd64` from the same page, `chmod +x` it

Terminal 2 (keep Terminal 1 running):

```bash
cloudflared tunnel --url http://localhost:3000
```

After a few seconds it prints a line like:

```
https://quiet-river-1234.trycloudflare.com
```

That is your `WEBAPP_URL`.

1. Put it in `backend/.env`: `WEBAPP_URL=https://quiet-river-1234.trycloudflare.com`
2. Restart the app in Terminal 1 (`Ctrl+C`, then `npm run dev` again) so the bot picks it up.
3. Open the URL in your normal browser once — you should see the Dategram splash screen.

Keep the tunnel terminal open. **Every time you restart cloudflared the URL changes**, and you
must repeat this step plus Step 6. (If you want a fixed URL, ngrok's free static domain works
too, but it shows a "Visit Site" warning page the first time inside Telegram.)

---

## Step 6 — Tell BotFather about the Mini App

In Telegram, open **@BotFather**:

1. `/newapp` → choose your bot
   - Title: `Dategram`
   - Short description: `Dating with intention`
   - Photo: upload any **640×360** image (BotFather insists on this exact size)
   - Demo GIF: `/empty` to skip
   - **Web App URL**: your `WEBAPP_URL` from Step 5
   - Short name: `dategram` → you get a link like `t.me/YourBot/dategram`
2. `/setmenubutton` → choose your bot → paste the same URL → button text `Open Dategram`
   (the API also sets this button automatically when it starts; doing it here is a safety net)
3. Optional: `/setcommands` → choose your bot → send
   ```
   start - Open Dategram
   verify - Get your verified badge
   ```

---

## Step 7 — Verify Phase 1 end to end

1. Open a chat with your bot in Telegram and send `/start`.
   → You receive the welcome message with a **Go to Dategram** button.
2. Tap the button.
   → The splash screen appears, then onboarding starts. (If you see *"Open Dategram from
   Telegram to continue"*, the app was opened in a plain browser, not through the bot.)
3. Run `npm run doctor` again.
   → The PostgreSQL section should say **`users table exists — 1 user registered`**.

🎉 Phase 1 is complete: Telegram auth, signature validation, and PostgreSQL persistence all work.

Day-to-day you now run three things: `npm run dev`, `cloudflared tunnel --url http://localhost:3000`,
and (when the tunnel URL changes) update `WEBAPP_URL` + BotFather.

---

## Alternative: no PC available → GitHub Codespaces

Everything above also works in the browser with GitHub Codespaces (free monthly hours on
personal accounts):

1. On GitHub open the repository → green **Code** button → **Codespaces** → **Create codespace**.
   The repo includes `.devcontainer/devcontainer.json`, so Node 22 and `npm install` are ready.
2. In the Codespaces terminal: create `backend/.env` as in Step 3, then `npm run dev`.
3. Open the **Ports** panel → port **3000** → right-click → **Port Visibility → Public** →
   copy the address (`https://…-3000.app.github.dev`). Use it as `WEBAPP_URL` (restart `npm run dev`)
   and in BotFather (Step 6). No tunnel needed.

The address stays the same for the life of that codespace; if you delete and recreate it,
repeat the `WEBAPP_URL` + BotFather update.

---

## Troubleshooting

| What you see | Cause → fix |
|---|---|
| `❌ Telegram rejected the token (401)` | Token copied wrong or revoked → `/mybots` → API Token, paste again |
| Button opens a blank page / "page not available" | Tunnel stopped or URL changed → restart tunnel, update `WEBAPP_URL` and BotFather |
| Mini App shows **Something went wrong — INVALID_SIGNATURE** | The API's `BOT_TOKEN` belongs to a different bot than the one you opened → use the same bot |
| **EXPIRED_INIT_DATA** | Clock on the machine running the API is wrong → fix the system time |
| `database.connected: false` in `/health` | Wrong `DATABASE_URL`, or `DATABASE_SSL=true` missing for a hosted DB → `npm run doctor` |
| `Connection terminated unexpectedly` | Firewall/VPN blocks port 5432, or Neon string pasted incompletely → re-copy it |
| `409: Conflict: terminated by other getUpdates request` | Two API processes use the same bot token → stop the other one |
| `EADDRINUSE :4000` or `:3000` | Something else uses the port → stop it, or set `PORT=4001` in `backend/.env` |
| `/start` works, but the Mini App shows "Open Dategram from Telegram" | You opened the URL in a normal browser; open it from the bot button or `t.me/YourBot/dategram` |

Security reminders: never commit `backend/.env`; if the bot token or the database string was
ever pasted somewhere public (chat, screenshot, issue), rotate it — BotFather `/revoke` for the
token, Neon **Reset password** for the database — and update `backend/.env`.
