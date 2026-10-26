import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { logError } from '../src/lib/logError.js';

function captured(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(' '));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return lines.join('\n');
}

describe('logError scrub', () => {
  it('keeps the message, drops pg detail/query fields', () => {
    const pgError = new Error('duplicate key value violates unique constraint');
    pgError.detail = 'Key (email)=(secret@example.com) already exists.';
    pgError.query = "INSERT INTO users(email) VALUES ('secret@example.com')";
    const out = captured(() => logError('DB:', pgError));
    assert.ok(out.includes('duplicate key value'));
    assert.ok(!out.includes('secret@example.com'));
    assert.ok(!out.includes('Key (email)'));
  });

  it('handles non-error values without throwing', () => {
    const out = captured(() => logError('Boot:', 'plain string failure'));
    assert.ok(out.includes('Boot: plain string failure'));
    const out2 = captured(() => logError('Boot:', undefined));
    assert.ok(out2.includes('Boot:'));
  });
});
