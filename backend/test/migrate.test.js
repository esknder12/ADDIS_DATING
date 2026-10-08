import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ensureMigrationsTable, readMigrationFiles, runMigrations } from '../src/db/migrate.js';

/**
 * Records the SQL a pool is asked to run. The migration runner's contract is about ordering,
 * recording, and transaction boundaries, all of which are observable without Postgres.
 */
function createRecordingPool() {
  const queries = [];
  const released = [];

  const client = {
    async query(text, params) {
      queries.push({ text: String(text).trim(), params, via: 'client' });
      return { rows: [] };
    },
    release() {
      released.push(true);
    },
  };

  return {
    queries,
    released,
    async query(text, params) {
      queries.push({ text: String(text).trim(), params, via: 'pool' });
      if (String(text).includes('SELECT name FROM schema_migrations')) {
        return { rows: this.appliedNames.map((name) => ({ name })) };
      }
      return { rows: [] };
    },
    async connect() {
      return client;
    },
    appliedNames: [],
  };
}

let directory;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dategram-migrations-'));
});

after(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

async function writeMigration(name, sql) {
  await fs.writeFile(path.join(directory, name), sql);
}

describe('migration runner', () => {
  it('creates the tracking table before reading anything', async () => {
    const pool = createRecordingPool();
    await ensureMigrationsTable(pool);
    assert.match(pool.queries[0].text, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  });

  it('reads migration files in filename order and ignores non-sql files', async () => {
    await writeMigration('0002_second.sql', 'SELECT 2;');
    await writeMigration('0001_first.sql', 'SELECT 1;');
    await writeMigration('notes.md', 'ignore me');

    const files = await readMigrationFiles(directory);
    assert.deepEqual(files.map((file) => file.name), ['0001_first.sql', '0002_second.sql']);
    assert.equal(files[0].sql, 'SELECT 1;');
  });

  it('returns an empty list when the directory does not exist', async () => {
    const files = await readMigrationFiles(path.join(directory, 'missing'));
    assert.deepEqual(files, []);
  });

  it('applies pending migrations inside a transaction and records each one', async () => {
    const pool = createRecordingPool();
    const results = await runMigrations(pool, directory);

    assert.deepEqual(results, [
      { name: '0001_first.sql', applied: true, skipped: false },
      { name: '0002_second.sql', applied: true, skipped: false },
    ]);

    const clientQueries = pool.queries.filter((query) => query.via === 'client').map((query) => query.text);
    assert.deepEqual(clientQueries, [
      'BEGIN',
      'SELECT 1;',
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      'COMMIT',
      'BEGIN',
      'SELECT 2;',
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      'COMMIT',
    ]);

    const inserts = pool.queries.filter((query) => query.text.startsWith('INSERT INTO schema_migrations'));
    assert.deepEqual(inserts.map((query) => query.params[0]), ['0001_first.sql', '0002_second.sql']);
    assert.equal(pool.released.length, 2, 'every client must be released');
  });

  it('skips migrations that are already recorded', async () => {
    const pool = createRecordingPool();
    pool.appliedNames = ['0001_first.sql'];

    const results = await runMigrations(pool, directory);
    assert.deepEqual(results, [
      { name: '0001_first.sql', applied: false, skipped: true },
      { name: '0002_second.sql', applied: true, skipped: false },
    ]);

    const clientQueries = pool.queries.filter((query) => query.via === 'client').map((query) => query.text);
    assert.deepEqual(clientQueries, [
      'BEGIN',
      'SELECT 2;',
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      'COMMIT',
    ]);
  });

  it('rolls back and names the failing migration', async () => {
    await writeMigration('0003_broken.sql', 'SELECT broken;');
    const pool = createRecordingPool();
    pool.appliedNames = ['0001_first.sql', '0002_second.sql'];

    const clientQuery = pool.connect;
    pool.connect = async () => {
      const client = await clientQuery.call(pool);
      const original = client.query.bind(client);
      client.query = async (text, params) => {
        if (String(text).includes('broken')) throw new Error('syntax error at or near "broken"');
        return original(text, params);
      };
      return client;
    };

    await assert.rejects(
      () => runMigrations(pool, directory),
      (error) => {
        assert.match(error.message, /^Migration 0003_broken\.sql failed: /);
        return true;
      },
    );

    const clientQueries = pool.queries.filter((query) => query.via === 'client').map((query) => query.text);
    assert.ok(clientQueries.includes('ROLLBACK'), 'a failed migration must roll back');
    assert.ok(!clientQueries.includes('COMMIT'), 'a failed migration must not commit');

    await fs.rm(path.join(directory, '0003_broken.sql'));
  });

  it('ships the Phase 3 and Phase 4 migrations in the repository', async () => {
    const shipped = await readMigrationFiles();
    assert.deepEqual(shipped.map((file) => file.name), [
      '0001_results_and_promo.sql',
      '0002_verification.sql',
    ]);
    assert.match(shipped[0].sql, /ADD COLUMN IF NOT EXISTS profile_score/);
    assert.match(shipped[0].sql, /ADD COLUMN IF NOT EXISTS results_completed/);
    assert.match(shipped[0].sql, /CREATE TABLE IF NOT EXISTS promo_codes/);
    assert.match(shipped[0].sql, /CREATE EXTENSION IF NOT EXISTS citext/);

    const verification = shipped[1];
    assert.match(verification.sql, /CREATE TABLE IF NOT EXISTS verification_submissions/);
    assert.match(verification.sql, /ADD COLUMN IF NOT EXISTS verification_status/);
    assert.match(verification.sql, /verification_submissions_one_pending_per_user/);
    assert.ok(
      !/ADD COLUMN IF NOT EXISTS is_verified/.test(verification.sql),
      'is_verified already exists and must not be re-added nullable',
    );
  });
});
