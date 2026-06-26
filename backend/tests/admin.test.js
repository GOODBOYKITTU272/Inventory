/**
 * Focused tests for admin route helpers in backend/src/routes/admin.js.
 * Run: node --test backend/tests/admin.test.js
 *
 * Pure-logic tests — no HTTP, no Supabase, no mock middleware.
 * process.env values are manipulated per-test and restored in afterEach.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getDefaultPassword, getInviteRedirectUrl } from '../src/routes/admin.js';

describe('getDefaultPassword() — DEFAULT_PASSWORD env var', () => {
  let savedPassword;
  let savedNodeEnv;
  let savedAppPublicUrl;

  beforeEach(() => {
    savedPassword = process.env.DEFAULT_PASSWORD;
    savedNodeEnv = process.env.NODE_ENV;
    savedAppPublicUrl = process.env.APP_PUBLIC_URL;
  });

  afterEach(() => {
    if (savedPassword === undefined) delete process.env.DEFAULT_PASSWORD;
    else process.env.DEFAULT_PASSWORD = savedPassword;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedAppPublicUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = savedAppPublicUrl;
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

describe('getInviteRedirectUrl() — APP_PUBLIC_URL env var', () => {
  let savedAppPublicUrl;

  beforeEach(() => {
    savedAppPublicUrl = process.env.APP_PUBLIC_URL;
  });

  afterEach(() => {
    if (savedAppPublicUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = savedAppPublicUrl;
  });

  it('uses APP_PUBLIC_URL when present', () => {
    process.env.APP_PUBLIC_URL = 'https://snackify.applywizz.ai';
    assert.equal(
      getInviteRedirectUrl(),
      'https://snackify.applywizz.ai/dashboard'
    );
  });

  it('falls back to localhost when APP_PUBLIC_URL is missing', () => {
    delete process.env.APP_PUBLIC_URL;
    assert.equal(
      getInviteRedirectUrl(),
      'http://localhost:5173/dashboard'
    );
  });
});
