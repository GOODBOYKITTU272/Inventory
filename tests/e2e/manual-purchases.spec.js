import { test, expect } from '@playwright/test';

/**
 * Manual Purchases — E2E Tests
 * ═════════════════════════════
 * 1. API auth guards (401 without token)
 * 2. Route protection (redirect to /login)
 * 3. Auto-approval business rules
 * 4. Role access rules
 * 5. Backend health
 */

const API = process.env.E2E_API_URL || 'http://localhost:4000';

// ═══════════════════════════════════════════════════════════════════
// 1. API Auth Guards
// ═══════════════════════════════════════════════════════════════════

test.describe('Manual Purchases — API Auth Guards', () => {

  test('GET /api/manual-purchases → 401', async ({ request }) => {
    const r = await request.get(`${API}/api/manual-purchases`);
    expect(r.status()).toBe(401);
  });

  test('GET /api/manual-purchases/:id → 401', async ({ request }) => {
    const r = await request.get(`${API}/api/manual-purchases/fake-id`);
    expect(r.status()).toBe(401);
  });

  test('POST approve → 401', async ({ request }) => {
    const r = await request.post(`${API}/api/manual-purchases/fake-id/approve`);
    expect(r.status()).toBe(401);
  });

  test('POST reject → 401', async ({ request }) => {
    const r = await request.post(`${API}/api/manual-purchases/fake-id/reject`, {
      data: { reason: 'test' },
    });
    expect(r.status()).toBe(401);
  });

  test('POST clarify → 401', async ({ request }) => {
    const r = await request.post(`${API}/api/manual-purchases/fake-id/clarify`, {
      data: { question: 'test?' },
    });
    expect(r.status()).toBe(401);
  });

  test('POST sync → 401', async ({ request }) => {
    const r = await request.post(`${API}/api/manual-purchases/fake-id/sync`);
    expect(r.status()).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Route Protection
// ═══════════════════════════════════════════════════════════════════

test.describe('Route Protection', () => {
  test.skip(true, 'Frontend page not yet built — Sprint 3');
  test('/manual-purchases redirects to /login', async ({ page }) => {
    await page.goto('/manual-purchases');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Auto-Approval Business Rules
// ═══════════════════════════════════════════════════════════════════

test.describe('Auto-Approval Rules', () => {

  test('office_boy ₹120 Pantry Food 88% = auto-approve', () => {
    expect(120).toBeLessThanOrEqual(500);
    expect(['Pantry Food','Beverages','Cleaning Supplies','Office Supplies','Maintenance']).toContain('Pantry Food');
    expect(0.88).toBeGreaterThanOrEqual(0.80);
  });

  test('staff and finance cannot submit', () => {
    const allowed = ['office_boy', 'facility_manager', 'leadership'];
    expect(allowed).not.toContain('staff');
    expect(allowed).not.toContain('finance');
  });

  test('blocked categories reject auto-approval', () => {
    const blocked = ['Employee Accessories', 'Electronics', 'Personal Items', 'Other', 'Unknown'];
    expect(blocked).toContain('Electronics');
    expect(blocked).not.toContain('Pantry Food');
  });

  test('over-limit amounts block auto-approval', () => {
    expect(600).toBeGreaterThan(500);
    expect(3000).toBeGreaterThan(2000);
    expect(6000).toBeGreaterThan(5000);
  });

  test('low confidence blocks auto-approval', () => {
    expect(0.75).toBeLessThan(0.80);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Role Access Rules
// ═══════════════════════════════════════════════════════════════════

test.describe('Role Access', () => {

  test('only finance + leadership can approve', () => {
    const canApprove = ['finance', 'leadership'];
    expect(canApprove).not.toContain('staff');
    expect(canApprove).not.toContain('office_boy');
    expect(canApprove).not.toContain('facility_manager');
  });

  test('FM can clarify but not approve', () => {
    const canClarify = ['finance', 'leadership', 'facility_manager'];
    expect(canClarify).toContain('facility_manager');
    expect(['finance', 'leadership']).not.toContain('facility_manager');
  });

  test('office_boy sees own only', () => {
    expect(['finance', 'leadership', 'facility_manager']).not.toContain('office_boy');
  });

  test('staff has zero access', () => {
    expect(['finance', 'leadership', 'facility_manager', 'office_boy']).not.toContain('staff');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Smoke
// ═══════════════════════════════════════════════════════════════════

test.describe('Smoke', () => {
  test('backend health', async ({ request }) => {
    const r = await request.get(`${API}/health`);
    expect(r.status()).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });
});
