/**
 * Focused tests for getDefaultPassword() in backend/src/routes/admin.js.
 * Run: node --test backend/tests/admin.test.js
 *
 * Pure-logic tests — no HTTP, no Supabase, no mock middleware.
 * process.env.DEFAULT_PASSWORD is manipulated per-test and restored in afterEach.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getDefaultPassword } from '../src/routes/admin.js';

describe('getDefaultPassword() — DEFAULT_PASSWORD env var', () => {
  let savedPassword;
  let savedNodeEnv;

  beforeEach(() => {
    savedPassword = process.env.DEFAULT_PASSWORD;
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (savedPassword === undefined) delete process.env.DEFAULT_PASSWORD;
    else process.env.DEFAULT_PASSWORD = savedPassword;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  it('returns null and logs console.error in production when DEFAULT_PASSWORD is not set', () => {
    delete process.env.DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'production';
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    try {
      const result = getDefaultPassword();
      assert.equal(result, null, 'must return null when env var is missing');
      assert.ok(logs.length > 0, 'must log an error in production');
      assert.ok(logs[0].includes('DEFAULT_PASSWORD'), 'log must name the missing variable');
    } finally {
      console.error = origError;
    }
  });

  it('returns null in development when DEFAULT_PASSWORD is not set (fail closed in all envs)', () => {
    delete process.env.DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'development';
    const result = getDefaultPassword();
    assert.equal(result, null, 'must return null in dev — no hardcoded fallback');
  });

  it('returns the exact env var value when DEFAULT_PASSWORD is configured', () => {
    process.env.DEFAULT_PASSWORD = 'Env$ecret@Test99';
    const result = getDefaultPassword();
    assert.equal(result, 'Env$ecret@Test99', 'must return the env var value verbatim');
    assert.notEqual(result, 'Applywizz@2026', 'must not return the old hardcoded string');
  });

  it('never includes any password value in error logs', () => {
    delete process.env.DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'production';
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    try {
      getDefaultPassword();
      const logsText = logs.join('\n');
      assert.equal(logsText.includes('Applywizz@2026'), false, 'old hardcoded password must not appear in logs');
      assert.ok(logsText.includes('DEFAULT_PASSWORD'), 'log names the config key (safe), not a secret value');
    } finally {
      console.error = origError;
    }
  });
});
