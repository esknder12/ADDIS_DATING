import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXPECTED_TABLES } from '../scripts/migrate.mjs';

describe('migrate checklist', () => {
  it('schema.sql creates every expected table', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const schema = fs.readFileSync(path.join(here, '..', 'src', 'db', 'schema.sql'), 'utf8');
    assert.ok(EXPECTED_TABLES.length >= 15);
    for (const table of EXPECTED_TABLES) {
      assert.ok(
        schema.includes(`CREATE TABLE IF NOT EXISTS ${table} (`),
        `schema covers ${table}`,
      );
    }
  });
});
