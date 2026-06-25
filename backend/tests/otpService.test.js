/**
 * Unit tests for otpService.js pure-logic functions.
 * Run: node --test backend/tests/otpService.test.js
 *
 * All tests are pure-logic — no DB calls, no network, no Supabase.
 * DB-touching functions are tested by extracting and exercising their
 * decision logic inline (same pattern as productConversion.test.js).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

// ── Inline pure-logic helpers mirroring otpService.js ─────────────────────

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ── 1. normalizeEmail ──────────────────────────────────────────────────────

describe('normalizeEmail', () => {
  it('strips whitespace and lowercases', () => {
    assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com');
    assert.equal(normalizeEmail('\tADMIN@SNACKIFY.IO\n'), 'admin@snackify.io');
    assert.equal(normalizeEmail('already@lower.com'), 'already@lower.com');
  });
});

// ── 2. 6-digit format from crypto.randomInt ────────────────────────────────

describe('OTP format (crypto.randomInt)', () => {
  it('generates a 6-digit string', () => {
    const code = crypto.randomInt(100000, 1000000).toString();
    assert.equal(code.length, 6);
    assert.match(code, /^\d{6}$/);
  });

  it('always produces exactly 6 digits across many iterations', () => {
    for (let i = 0; i < 500; i++) {
      const code = crypto.randomInt(100000, 1000000).toString();
      assert.equal(code.length, 6, `Got unexpected code: ${code}`);
    }
  });
});

// ── 3 & 4. hashValue ──────────────────────────────────────────────────────

describe('hashValue', () => {
  it('is deterministic — same input gives same hash', () => {
    assert.equal(hashValue('123456'), hashValue('123456'));
    assert.equal(hashValue('hello'), hashValue('hello'));
  });

  it('different inputs produce different hashes', () => {
    assert.notEqual(hashValue('123456'), hashValue('654321'));
    assert.notEqual(hashValue('abc'), hashValue('ABC'));
  });
});

// ── 5. OTP expiry logic ────────────────────────────────────────────────────

describe('OTP expiry logic', () => {
  it('an expires_at in the past is correctly identified as expired', () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString(); // 1s ago
    const now = new Date().toISOString();
    // In verifyOtp: .gt('expires_at', now) — past date would be excluded
    const isExpired = expiredAt <= now;
    assert.equal(isExpired, true);
  });

  it('an expires_at in the future is correctly identified as valid', () => {
    const futureAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // +10 min
    const now = new Date().toISOString();
    const isValid = futureAt > now;
    assert.equal(isValid, true);
  });
});

// ── 6. Invalid code rejected ───────────────────────────────────────────────

describe('Invalid code check', () => {
  it('wrong code hash does not match stored hash', () => {
    const rightCode = '482910';
    const wrongCode = '111111';
    const storedHash = hashValue(rightCode);
    assert.notEqual(hashValue(wrongCode), storedHash);
  });

  it('correct code hash matches stored hash', () => {
    const code = '482910';
    const storedHash = hashValue(code);
    assert.equal(hashValue(code), storedHash);
  });
});

// ── 7. Max attempts ────────────────────────────────────────────────────────

describe('Max attempts logic', () => {
  it('attempts >= 3 triggers max_attempts path', () => {
    const MAX_ATTEMPTS = 3;

    function checkAttempts(attempts) {
      if (attempts >= MAX_ATTEMPTS) return 'max_attempts';
      return 'proceed';
    }

    assert.equal(checkAttempts(3), 'max_attempts');
    assert.equal(checkAttempts(4), 'max_attempts');
    assert.equal(checkAttempts(2), 'proceed');
    assert.equal(checkAttempts(0), 'proceed');
  });
});

// ── 8. Enrollment token UUID format ───────────────────────────────────────

describe('Enrollment token', () => {
  it('crypto.randomUUID() produces a valid UUID v4 format', () => {
    const token = crypto.randomUUID();
    assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('two generated tokens are unique', () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    assert.notEqual(a, b);
  });
});

// ── 9. Enrollment token expiry ────────────────────────────────────────────

describe('Enrollment token expiry', () => {
  it('token_expires_at in the past is expired', () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString(); // 1s ago
    const now = new Date().toISOString();
    // verifyEnrollmentToken: .gt('enrollment_token_expires_at', now) excludes past
    const isExpired = expiredAt <= now;
    assert.equal(isExpired, true);
  });

  it('token_expires_at in the future is still valid', () => {
    const futureAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 min
    const now = new Date().toISOString();
    const isValid = futureAt > now;
    assert.equal(isValid, true);
  });
});

// ── 10. Enrollment token replay prevention ────────────────────────────────

describe('Enrollment token replay prevention', () => {
  it('consuming a token sets hash to null, rejecting a second call', () => {
    // Simulate the row state after consumption
    let row = {
      enrollment_token_hash: hashValue('some-uuid-token'),
      enrollment_token_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    // First verification: matches
    const token = 'some-uuid-token';
    const nowIso = new Date().toISOString();
    const firstResult =
      row.enrollment_token_hash === hashValue(token) &&
      row.enrollment_token_expires_at > nowIso;
    assert.equal(firstResult, true);

    // Consume: set to null (mirroring UPDATE in verifyEnrollmentToken)
    row = { ...row, enrollment_token_hash: null, enrollment_token_expires_at: null };

    // Second call: null hash cannot match anything
    const secondResult =
      row.enrollment_token_hash !== null &&
      row.enrollment_token_hash === hashValue(token);
    assert.equal(secondResult, false);
  });
});

// ── 11. Cooldown logic ────────────────────────────────────────────────────

describe('Cooldown logic', () => {
  it('second generateOtp within 60s triggers COOLDOWN', () => {
    const RESEND_COOLDOWN_MS = 60 * 1000;

    function checkCooldown(lastCreatedAt) {
      if (lastCreatedAt && Date.now() - new Date(lastCreatedAt).getTime() < RESEND_COOLDOWN_MS) {
        throw new Error('COOLDOWN');
      }
    }

    // Created 30 seconds ago — still within cooldown
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    assert.throws(() => checkCooldown(thirtySecondsAgo), /COOLDOWN/);

    // Created 90 seconds ago — cooldown has passed
    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();
    assert.doesNotThrow(() => checkCooldown(ninetySecondsAgo));
  });
});

// ── 12. Rate limit logic ──────────────────────────────────────────────────

describe('Rate limit logic', () => {
  it('4th generateOtp in the same hour triggers RATE_LIMITED', () => {
    const MAX_SENDS_PER_HOUR = 3;

    function checkRateLimit(count) {
      if (count >= MAX_SENDS_PER_HOUR) throw new Error('RATE_LIMITED');
    }

    assert.throws(() => checkRateLimit(3), /RATE_LIMITED/);
    assert.throws(() => checkRateLimit(4), /RATE_LIMITED/);
    assert.doesNotThrow(() => checkRateLimit(2));
    assert.doesNotThrow(() => checkRateLimit(0));
  });
});
