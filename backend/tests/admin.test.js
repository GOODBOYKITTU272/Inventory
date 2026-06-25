/**
 * Focused tests for DEFAULT_PASSWORD behaviour in POST /api/admin/users/create.
 * Run: node --test backend/tests/admin.test.js
 *
 * Uses createAdminRouter({ db, authMiddleware }) factory.
 * Auth middleware is replaced with a pass-through that injects a leadership user.
 * process.env.DEFAULT_PASSWORD is manipulated per-test and restored in afterEach.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createAdminRouter } from '../src/routes/admin.js';

// ── Helpers ────────────────────────────────────────────────────────────────

// Bypass requireRole — injects a leadership user so routes proceed normally.
const leadershipAuth = (req, _res, next) => {
  req.user = { id: 'uid-leadership', role: 'leadership' };
  next();
};

function makeDb({ createUserResult } = {}) {
  const chain = {
    select: () => chain,
    upsert: () => chain,
    update: () => chain,
    eq: () => chain,
    order: () => chain,
    single: async () => ({
      data: { id: 'uid-1', role: 'staff', full_name: 'Alice' },
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    auth: {
      admin: {
        createUser: async () =>
          createUserResult ?? { data: { user: { id: 'uid-1', email: 'alice@applywizz.ai' } }, error: null },
        listUsers: async () => ({ data: { users: [] }, error: null }),
        inviteUserByEmail: async () => ({ data: { user: { id: 'uid-1' } }, error: null }),
      },
    },
    from: () => chain,
  };
}

async function startServer(routerOverrides) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter({ authMiddleware: leadershipAuth, ...routerOverrides }));
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  });
  const srv = createServer(app);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${srv.address().port}/api/admin`;
  return {
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

const PAYLOAD = { email: 'alice@applywizz.ai', role: 'staff', full_name: 'Alice' };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/admin/users/create — DEFAULT_PASSWORD env var', () => {
  let savedPassword;
  let savedNodeEnv;

  beforeEach(() => {
    savedPassword = process.env.DEFAULT_PASSWORD;
    savedNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (savedPassword === undefined) {
      delete process.env.DEFAULT_PASSWORD;
    } else {
      process.env.DEFAULT_PASSWORD = savedPassword;
    }
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it('returns 503 in production when DEFAULT_PASSWORD is not configured', async () => {
    delete process.env.DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'production';
    const { post, close } = await startServer({ db: makeDb() });
    try {
      const r = await post('/users/create', PAYLOAD);
      assert.equal(r.status, 503);
      assert.ok(r.body?.error, 'error field must be present');
    } finally {
      await close();
    }
  });

  it('returns 503 in development when DEFAULT_PASSWORD is not configured (fail closed in all envs)', async () => {
    delete process.env.DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'development';
    const { post, close } = await startServer({ db: makeDb() });
    try {
      const r = await post('/users/create', PAYLOAD);
      assert.equal(r.status, 503, 'must fail closed regardless of NODE_ENV');
    } finally {
      await close();
    }
  });

  it('passes the DEFAULT_PASSWORD env value to createUser — not a hardcoded string', async () => {
    process.env.DEFAULT_PASSWORD = 'Env$ecret@Test99';
    let capturedPassword = null;
    const db = makeDb();
    db.auth.admin.createUser = async ({ password }) => {
      capturedPassword = password;
      return { data: { user: { id: 'uid-1', email: 'alice@applywizz.ai' } }, error: null };
    };
    const { post, close } = await startServer({ db });
    try {
      const r = await post('/users/create', PAYLOAD);
      assert.equal(r.status, 201);
      assert.equal(capturedPassword, 'Env$ecret@Test99', 'createUser must receive the env var value');
      assert.notEqual(capturedPassword, 'Applywizz@2026', 'must not use the old hardcoded string');
    } finally {
      await close();
    }
  });

  it('password value never appears in logs or the API response', async () => {
    delete process.env.DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'production';
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    const { post, close } = await startServer({ db: makeDb() });
    try {
      const r = await post('/users/create', PAYLOAD);
      assert.equal(r.status, 503);
      const responseStr = JSON.stringify(r.body);
      // The old hardcoded value must never appear in any output
      assert.equal(responseStr.includes('Applywizz@2026'), false, 'hardcoded password must not appear in response');
      assert.equal(responseStr.toLowerCase().includes('password'), false, 'response must not mention password');
      const logsText = logs.join('\n');
      assert.equal(logsText.includes('Applywizz@2026'), false, 'hardcoded password must not appear in logs');
    } finally {
      console.error = origError;
      await close();
    }
  });
});
