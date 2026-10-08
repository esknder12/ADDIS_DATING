import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * schema.sql is `CREATE ... IF NOT EXISTS` only, so it converges a fresh database but can
 * never alter a table that already exists. Migrations are the additive channel: ordered,
 * recorded, and applied at most once per database. Applied files must never be rewritten.
 */
export async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function readMigrationFiles(directory = path.join(dirname, 'migrations')) {
  let entries;
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const names = entries.filter((entry) => entry.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => ({ name, sql: await fs.readFile(path.join(directory, name), 'utf8') })),
  );
}

export async function runMigrations(pool, directory) {
  await ensureMigrationsTable(pool);

  const [migrations, applied] = await Promise.all([
    readMigrationFiles(directory),
    pool.query('SELECT name FROM schema_migrations'),
  ]);
  const appliedNames = new Set(applied.rows.map((row) => row.name));
  const results = [];

  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) {
      results.push({ name: migration.name, applied: false, skipped: true });
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
      await client.query('COMMIT');
      results.push({ name: migration.name, applied: true, skipped: false });
    } catch (error) {
      await client.query('ROLLBACK');
      error.message = `Migration ${migration.name} failed: ${error.message}`;
      throw error;
    } finally {
      client.release();
    }
  }

  return results;
}
