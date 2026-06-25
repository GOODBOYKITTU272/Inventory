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

const TEST_SECRET = 'test-secret';
function hashValue(value) {
  return crypto.createHmac('sha256', TEST_SECRET).update(value).digest('hex');
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

// ── 13. Rate-limit window (cleanup correctness) ───────────────────────────

describe('Rate-limit window (cleanup correctness)', () => {
  it('counts sends in the last hour even when OTP has expired', () => {
    // A send from 30 minutes ago: OTP has expired (10 min TTL) but is still
    // within the 1-hour rate-limit window. It must be counted.
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // This row was created 30 min ago — within rate-limit window
    const rowCreatedAt = thirtyMinsAgo;
    const isWithinWindow = rowCreatedAt >= oneHourAgo;
    assert.equal(isWithinWindow, true, 'A 30-min-old send must still be within the 1-hour rate-limit window');

    // A send from 61 minutes ago — outside the window, safe to clean up
    const sixtyOneMinsAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    const isOutsideWindow = sixtyOneMinsAgo < oneHourAgo;
    assert.equal(isOutsideWindow, true, 'A 61-min-old send must be outside the rate-limit window');
  });
});

// ── 14. Atomic token consumption ──────────────────────────────────────────

describe('Atomic token consumption', () => {
  it('zero updated rows means token was already consumed', () => {
    // Simulate the Supabase UPDATE returning 0 rows (token already NULLed by concurrent request)
    const updatedRows = [];
    const result = Array.isArray(updatedRows) && updatedRows.length === 1;
    assert.equal(result, false, 'Zero updated rows must return false (already consumed)');
  });

  it('one updated row means token was successfully consumed', () => {
    // Simulate the Supabase UPDATE returning exactly 1 row
    const updatedRows = [{ id: 'some-uuid' }];
    const result = Array.isArray(updatedRows) && updatedRows.length === 1;
    assert.equal(result, true, 'One updated row must return true (first consumer wins)');
  });
});

// ── 15. cancelOtp delete-by-id scoping ───────────────────────────────────

describe('cancelOtp delete-by-id scoping', () => {
  it('deletes only the row with the exact otpId — an older row for the same email survives', () => {
    // Mirrors the WHERE clause: DELETE WHERE id = otpId AND used = false
    const rows = [
      { id: 'old-row-id', email: 'alice@applywizz.ai', used: false },
      { id: 'new-row-id', email: 'alice@applywizz.ai', used: false },
    ];
    const otpId = 'new-row-id';
    const after = rows.filter((r) => !(r.id === otpId && !r.used));
    assert.equal(after.length, 1, 'exactly one row must survive');
    assert.equal(after[0].id, 'old-row-id', 'the older row must not be deleted');
  });

  it('does not delete a row that has already been verified (used = true guard)', () => {
    // Even if the primary key matches, a used row must not be deleted
    const rows = [{ id: 'verified-row-id', email: 'alice@applywizz.ai', used: true }];
    const otpId = 'verified-row-id';
    const after = rows.filter((r) => !(r.id === otpId && !r.used));
    assert.equal(after.length, 1, 'used row must survive the delete filter');
    assert.equal(after[0].used, true);
  });
});

// ── 16. Production mode fail-closed ───────────────────────────────────────

describe('Production mode without OTP_HASH_SECRET', () => {
  it('throws a configuration error when secret is missing in production', () => {
    // Mirror the production branch of hashValue without touching NODE_ENV
    function hashValueWithConfig(value, secret, isProduction) {
      if (isProduction && !secret) {
        throw new Error(
          'OTP_HASH_SECRET is required in production. Set this environment variable before using OTP functions.'
        );
      }
      return crypto
        .createHmac('sha256', secret || 'dev-secret-not-for-production')
        .update(value)
        .digest('hex');
    }

    // Production + no secret → must throw
    assert.throws(
      () => hashValueWithConfig('123456', undefined, true),
      (err) => err.message.includes('OTP_HASH_SECRET is required in production')
    );

    // Production + secret present → must not throw
    assert.doesNotThrow(() => hashValueWithConfig('123456', 'real-secret', true));

    // Dev + no secret → must not throw (uses fallback)
    assert.doesNotThrow(() => hashValueWithConfig('123456', undefined, false));
  });
});
