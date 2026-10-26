// One-command schema apply. Safe to run anytime: schema.sql is idempotent
// (IF NOT EXISTS everywhere) and server boot applies this same file.
// Usage:
//   DATABASE_URL=... npm run migrate --workspace backend
//   DATABASE_URL=... DATABASE_SSL=true npm run migrate --workspace backend -- --check
// The E2E workflow dogfoods this script, so every push proves it works.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config/env.js';

export const EXPECTED_TABLES = [
  'users',
  'photos',
  'onboarding_answers',
  'onboarding_progress',
  'swipes',
  'matches',
  'messages',
  'gift_transactions',
  'premium_orders',
  'verification_requests',
  'ai_picks_sessions',
  'ai_pick_items',
  'notifications_log',
  'profile_boosts',
  'user_presence',
  'blocks',
  'reports',
];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes('--check');

async function main() {
  if (!config.databaseUrl) {
    console.error('migrate: DATABASE_URL is not set');
    process.exit(2);
  }
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  try {
    if (!checkOnly) {
      const schema = await fs.readFile(path.join(HERE, '..', 'src', 'db', 'schema.sql'), 'utf8');
      await pool.query(schema);
      console.log('migrate: schema.sql applied');
    }
    const { rows } = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const present = new Set(rows.map((row) => row.tablename));
    const missing = EXPECTED_TABLES.filter((table) => !present.has(table));
    if (missing.length > 0) {
      console.error(`migrate: missing tables: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log(`migrate: verified ${EXPECTED_TABLES.length}/${EXPECTED_TABLES.length} tables present`);
  } finally {
    await pool.end();
  }
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
