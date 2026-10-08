import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;
const dirname = path.dirname(fileURLToPath(import.meta.url));

let pool = null;

export function getDatabasePool() {
  return pool;
}

export async function initDatabase(runtimeConfig = config) {
  if (!runtimeConfig.databaseUrl) {
    console.warn('⚠️  DATABASE_URL is not set; persistence-backed routes are unavailable.');
    return null;
  }

  pool = new Pool({
    connectionString: runtimeConfig.databaseUrl,
    ssl: runtimeConfig.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
  });

  const schema = await fs.readFile(path.join(dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✅ PostgreSQL schema initialized');

  return pool;
}

export async function checkDatabase() {
  if (!pool) return { configured: false, connected: false };

  try {
    await pool.query('SELECT 1');
    return { configured: true, connected: true };
  } catch {
    return { configured: true, connected: false };
  }
}

export async function closeDatabase() {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  await activePool.end();
}
