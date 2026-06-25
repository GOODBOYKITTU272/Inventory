/**
 * Focused endpoint tests for POST /api/auth/* routes.
 * Run: node --test backend/tests/auth.test.js
 *
 * Injects mocks via createAuthRouter(overrides) — no mock.module() or extra flags needed.
 * Spins up a lightweight Express test server; tests use fetch().
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createAuthRouter } from '../src/routes/auth.js';

// ── Fluent chain builder ───────────────────────────────────────────────────
// Wraps one {data, error} result in a chainable object so .select().eq().maybeSingle()
// resolves correctly regardless of the chain length the handler uses.

function makeChain(result) {
  const r = result ?? { data: null, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    insert: async () => ({ data: r.data, error: r.error }),
    maybeSingle: async () => ({ data: r.data, error: r.error }),
    single: async () => ({ data: r.data, error: r.error }),
  };
  return chain;
}

// ── Mock factories ─────────────────────────────────────────────────────────

function makeSupabaseAdmin({ authUsers = [], fromResults = [], generateLinkOtp = 'magic-otp' } = {}) {
  const queue = [...fromResults];
  return {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
        createUser: async ({ email }) => ({ data: { user: { id: 'created-uid', email } }, error: null }),
        generateLink: async () => ({ data: { properties: { email_otp: generateLinkOtp } }, error: null }),
      },
      signInWithOtp: async () => ({ error: null }),
    },
    from: () => makeChain(queue.shift()),
  };
}

function makeSupabaseAnon() {
  return {
    auth: {
      verifyOtp: async () => ({ data: { session: { access_token: 'user-jwt' } }, error: null }),
    },
  };
}

function makeSupabaseAsUser(factor = { id: 'factor-1', totp: { qr_code: 'qr', secret: 'SEC', uri: 'uri' } }) {
  return () => ({
    auth: {
      mfa: {
        enroll: async () => ({ data: factor, error: null }),
      },
    },
  });
}

// ── Test server helpers ────────────────────────────────────────────────────

let server;
let base;

function buildApp(routerOverrides) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(routerOverrides));
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  });
  return app;
}

// Single long-lived server using the default (passthrough) mocks.
// Tests that need different behavior rebuild the router in-process via fetch
// or use per-test apps on ephemeral ports (see helpers below).

// We use one server per describe block to keep port management simple.
// Each describe spins up its own server and tears it down after.

async function startServer(routerOverrides) {
  const app = buildApp(routerOverrides);
  const srv = createServer(app);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${srv.address().port}/api/auth`;
  return {
    url,
    close: () => new Promise((resolve) => srv.close(resolve)),
    post: async (path, body) => {
      const res = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const ALICE = { id: 'uid-alice', email: 'alice@applywizz.ai' };
const ALICE_PROFILE = { id: 'uid-alice', role: 'staff' };
const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655440000';

// ── POST /api/auth/start-enrollment ───────────────────────────────────────

describe('POST /api/auth/start-enrollment', () => {
  it('returns generic ok and sends no OTP when Supabase user does not exist', async () => {
    let generateOtpCalled = false;
    let sendOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({ authUsers: [], fromResults: [] }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => { generateOtpCalled = true; return { code: '111111', otpId: 'otp-1' }; },
      sendOtpEmail: async () => { sendOtpCalled = true; },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { ok: true });
      assert.equal(generateOtpCalled, false, 'generateOtp must not be called');
      assert.equal(sendOtpCalled, false, 'sendOtpEmail must not be called');
    } finally {
      await close();
    }
  });

  it('returns generic ok and sends no OTP when profiles row is missing', async () => {
    let generateOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: null, error: null }], // profile query returns null
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => { generateOtpCalled = true; return { code: '111111', otpId: 'otp-1' }; },
      sendOtpEmail: async () => {},
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { ok: true });
      assert.equal(generateOtpCalled, false);
    } finally {
      await close();
    }
  });

  it('returns generic ok and sends no OTP when Entra account is disabled or not found', async () => {
    let generateOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: false }),
      generateOtp: async () => { generateOtpCalled = true; return { code: '111111', otpId: 'otp-1' }; },
      sendOtpEmail: async () => {},
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { ok: true });
      assert.equal(generateOtpCalled, false);
    } finally {
      await close();
    }
  });

  it('returns 503 and creates no OTP row when directory lookup throws', async () => {
    let generateOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => { throw new Error('Graph network timeout'); },
      generateOtp: async () => { generateOtpCalled = true; return { code: '111111', otpId: 'otp-1' }; },
      sendOtpEmail: async () => {},
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 503);
      assert.equal(generateOtpCalled, false, 'No OTP row must be created when Graph fails');
    } finally {
      await close();
    }
  });

  it('returns 503 when sendMail is not configured', async () => {
    let generateOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({ authUsers: [ALICE] }),
      isSendMailConfigured: () => false,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => { generateOtpCalled = true; return { code: '111111', otpId: 'otp-1' }; },
      sendOtpEmail: async () => {},
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 503);
      assert.equal(generateOtpCalled, false);
    } finally {
      await close();
    }
  });

  it('returns 429 on OTP cooldown', async () => {
    let sendOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => { throw new Error('COOLDOWN'); },
      sendOtpEmail: async () => { sendOtpCalled = true; },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 429);
      assert.ok(r.body.error.toLowerCase().includes('wait'), `unexpected: ${r.body.error}`);
      assert.equal(sendOtpCalled, false, 'sendOtpEmail must not be called on cooldown');
    } finally {
      await close();
    }
  });

  it('returns 429 on hourly rate limit', async () => {
    let sendOtpCalled = false;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => { throw new Error('RATE_LIMITED'); },
      sendOtpEmail: async () => { sendOtpCalled = true; },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 429);
      assert.ok(r.body.error.toLowerCase().includes('too many'), `unexpected: ${r.body.error}`);
      assert.equal(sendOtpCalled, false);
    } finally {
      await close();
    }
  });

  it('cancelOtp receives the exact otpId returned by generateOtp on send failure', async () => {
    const OTP_ROW_ID = '11111111-aaaa-4bbb-8ccc-dddddddddddd';
    let capturedId = null;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => ({ code: '482910', otpId: OTP_ROW_ID }),
      sendOtpEmail: async () => { throw new Error('Graph sendMail 503'); },
      cancelOtp: async (otpId) => { capturedId = otpId; },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 503);
      assert.equal(capturedId, OTP_ROW_ID, 'cancelOtp must receive the exact row ID from generateOtp');
    } finally {
      await close();
    }
  });

  it('cancelOtp is called with only the new row ID — an older row ID is never passed', async () => {
    const OLD_ROW_ID = 'old-row-0000-4aaa-8bbb-cccccccccccc';
    const NEW_ROW_ID = 'new-row-1111-4bbb-8ccc-dddddddddddd';
    const receivedIds = [];
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => ({ code: '482910', otpId: NEW_ROW_ID }),
      sendOtpEmail: async () => { throw new Error('Graph sendMail 503'); },
      cancelOtp: async (otpId) => { receivedIds.push(otpId); },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(receivedIds.length, 1, 'cancelOtp must be called exactly once');
      assert.equal(receivedIds[0], NEW_ROW_ID, 'must receive the new row ID');
      assert.equal(receivedIds.includes(OLD_ROW_ID), false, 'must not receive any older row ID');
    } finally {
      await close();
    }
  });

  it('cancelOtp failure is logged generically and endpoint still returns 503', async () => {
    const errorLogs = [];
    const origError = console.error;
    console.error = (...args) => errorLogs.push(args.join(' '));
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => ({ code: '482910', otpId: 'otp-cleanup-fail' }),
      sendOtpEmail: async () => { throw new Error('Graph sendMail 503'); },
      cancelOtp: async () => { throw new Error('DB connection lost'); },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 503, 'cleanup failure must not change the 503 response');
      const logsText = errorLogs.join('\n');
      assert.ok(logsText.toLowerCase().includes('cleanup'), 'a generic cleanup-failure log must appear');
    } finally {
      console.error = origError;
      await close();
    }
  });

  it('no OTP code or row ID appears in error logs on send failure', async () => {
    const errorLogs = [];
    const origError = console.error;
    console.error = (...args) => errorLogs.push(args.join(' '));
    const SECRET_CODE = '737291';
    const SECRET_OTP_ID = 'secret-otp-row-uuid-should-not-log';
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true }),
      generateOtp: async () => ({ code: SECRET_CODE, otpId: SECRET_OTP_ID }),
      sendOtpEmail: async () => { throw new Error('Graph sendMail 503'); },
      cancelOtp: async () => {},
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      const logsText = errorLogs.join('\n');
      assert.equal(logsText.includes(SECRET_CODE), false, `OTP code '${SECRET_CODE}' must not appear in logs`);
      assert.equal(logsText.includes(SECRET_OTP_ID), false, 'otpId must not appear in logs');
    } finally {
      console.error = origError;
      await close();
    }
  });

  it('returns ok: true and calls sendOtpEmail exactly once on success', async () => {
    let sendOtpCalled = 0;
    let generateOtpCalled = 0;
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }],
      }),
      isSendMailConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true, displayName: 'Alice' }),
      generateOtp: async () => { generateOtpCalled++; return { code: '482910', otpId: 'otp-row-1' }; },
      sendOtpEmail: async () => { sendOtpCalled++; },
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/start-enrollment', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { ok: true });
      assert.equal(generateOtpCalled, 1, 'generateOtp must be called exactly once');
      assert.equal(sendOtpCalled, 1, 'sendOtpEmail must be called exactly once');
    } finally {
      await close();
    }
  });
});

// ── POST /api/auth/verify-enrollment-otp ──────────────────────────────────

describe('POST /api/auth/verify-enrollment-otp', () => {
  it('returns 401 for invalid or expired code', async () => {
    const { post, close } = await startServer({
      verifyOtp: async () => ({ valid: false, reason: 'invalid_code' }),
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/verify-enrollment-otp', { email: 'alice@applywizz.ai', code: '000000' });
      assert.equal(r.status, 401);
      assert.ok(r.body.error);
    } finally {
      await close();
    }
  });

  it('returns 401 when max attempts are exceeded', async () => {
    const { post, close } = await startServer({
      verifyOtp: async () => ({ valid: false, reason: 'max_attempts' }),
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/verify-enrollment-otp', { email: 'alice@applywizz.ai', code: '111111' });
      assert.equal(r.status, 401);
    } finally {
      await close();
    }
  });

  it('returns 400 for malformed code (not 6 digits)', async () => {
    const { post, close } = await startServer({
      verifyOtp: async () => ({ valid: true, enrollmentToken: 'tok' }),
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/verify-enrollment-otp', { email: 'alice@applywizz.ai', code: '12345' });
      assert.equal(r.status, 400);
    } finally {
      await close();
    }
  });

  it('returns enrollmentToken on valid code (no extra fields)', async () => {
    const { post, close } = await startServer({
      verifyOtp: async () => ({ valid: true, enrollmentToken: 'enroll-tok-1' }),
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/verify-enrollment-otp', { email: 'alice@applywizz.ai', code: '482910' });
      assert.equal(r.status, 200);
      assert.equal(r.body.enrollmentToken, 'enroll-tok-1');
      assert.equal(Object.keys(r.body).length, 1, 'response must contain only enrollmentToken');
    } finally {
      await close();
    }
  });
});

// ── POST /api/auth/complete-totp-enrollment ────────────────────────────────

describe('POST /api/auth/complete-totp-enrollment', () => {
  it('returns 401 for invalid enrollment token', async () => {
    const { post, close } = await startServer({
      verifyEnrollmentToken: async () => false,
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/complete-totp-enrollment', {
        email: 'alice@applywizz.ai',
        enrollmentToken: VALID_TOKEN,
      });
      assert.equal(r.status, 401);
    } finally {
      await close();
    }
  });

  it('returns 401 for already-consumed (replayed) enrollment token', async () => {
    // verifyEnrollmentToken returns false for already-consumed tokens (atomic UPDATE returned 0 rows)
    const { post, close } = await startServer({
      verifyEnrollmentToken: async () => false,
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/complete-totp-enrollment', {
        email: 'alice@applywizz.ai',
        enrollmentToken: VALID_TOKEN,
      });
      assert.equal(r.status, 401);
    } finally {
      await close();
    }
  });

  it('returns 400 for malformed enrollmentToken (not a UUID)', async () => {
    const { post, close } = await startServer({
      verifyEnrollmentToken: async () => true,
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/complete-totp-enrollment', {
        email: 'alice@applywizz.ai',
        enrollmentToken: 'not-a-uuid',
      });
      assert.equal(r.status, 400);
    } finally {
      await close();
    }
  });

  it('returns TOTP factor data without exposing session tokens on success', async () => {
    const factor = {
      id: 'factor-1',
      totp: { qr_code: 'qr-data', secret: 'BASE32SECRET', uri: 'otpauth://totp/Snackify:alice' },
    };
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({ authUsers: [ALICE] }),
      supabaseAnon: makeSupabaseAnon(),
      supabaseAsUser: makeSupabaseAsUser(factor),
      verifyEnrollmentToken: async () => true,
      normalizeEmail: (e) => e.trim().toLowerCase(),
    });
    try {
      const r = await post('/complete-totp-enrollment', {
        email: 'alice@applywizz.ai',
        enrollmentToken: VALID_TOKEN,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.factorId, 'factor-1');
      assert.equal(r.body.qrCode, 'qr-data');
      assert.equal(r.body.secret, 'BASE32SECRET');
      assert.ok(r.body.uri, 'uri must be present');
      // Session tokens must NOT appear in the response
      assert.equal(r.body.access_token, undefined, 'access_token must not be in response');
      assert.equal(r.body.session, undefined, 'session must not be in response');
      assert.equal(
        Object.keys(r.body).length,
        4,
        `response must contain exactly {factorId, qrCode, secret, uri}, got: ${Object.keys(r.body).join(', ')}`
      );
    } finally {
      await close();
    }
  });
});

// ── POST /api/auth/verify-email (existing endpoint) ───────────────────────

describe('POST /api/auth/verify-email', () => {
  it('returns { ok: true, email } for a valid directory user (unchanged behavior)', async () => {
    const { post, close } = await startServer({
      supabaseAdmin: makeSupabaseAdmin({
        authUsers: [ALICE],
        fromResults: [{ data: ALICE_PROFILE, error: null }], // ensureProfile: profile exists
      }),
      isGraphConfigured: () => true,
      isDirectoryUser: async () => ({ exists: true, displayName: 'Alice' }),
    });
    try {
      const r = await post('/verify-email', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.equal(r.body.email, 'alice@applywizz.ai');
    } finally {
      await close();
    }
  });

  it('returns 503 when Graph is not configured (unchanged fail-closed behavior)', async () => {
    const { post, close } = await startServer({
      isGraphConfigured: () => false,
      isDirectoryUser: async () => ({ exists: true }),
    });
    try {
      const r = await post('/verify-email', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 503);
    } finally {
      await close();
    }
  });

  it('returns 403 when user is not in Entra directory (unchanged behavior)', async () => {
    const { post, close } = await startServer({
      isGraphConfigured: () => true,
      isDirectoryUser: async () => ({ exists: false }),
    });
    try {
      const r = await post('/verify-email', { email: 'alice@applywizz.ai' });
      assert.equal(r.status, 403);
      assert.ok(r.body.error.toLowerCase().includes('directory'));
    } finally {
      await close();
    }
  });
});
