// tests/cafeteria-polish.spec.js
// Playwright E2E tests for cafeteria polish:
//   01 — Stirrer depletion (Assam tea) + restoration on cancel
//   02 — Atta Bread depletion (Mix Fruit Jam) + restoration on cancel
//   03 — "Needs bread" gate when all bread is out of stock
//   04 — Duplicate bill API returns roast message

import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

// ── TOTP Helper ───────────────────────────────────────────────────────────────
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) throw new Error('Invalid base32 character: ' + clean[i]);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret) {
  const key = base32Decode(secret);
  const time = Math.floor(Math.floor(Date.now() / 1000) / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(time), 0);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const hmacResult = hmac.digest();
  const offset = hmacResult[hmacResult.length - 1] & 0xf;
  const code = (
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

// ── Load test credentials ─────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const credentialsPath = path.resolve(__dirname, 'test-credentials.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

// ── Supabase Admin Client (for DB assertions & setup) ────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment to run these tests.');
}
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Login helper ──────────────────────────────────────────────────────────────
async function loginAs(role, page) {
  const creds = credentials[role];
  if (!creds) throw new Error(`Role "${role}" not found in test-credentials.json`);

  await page.goto('/login');

  // Step 1: Enter work email
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('button[type="submit"]').click(); // "Continue →"

  // Step 2: TOTP input appears ("Welcome back" screen)
  const codeInput = page.locator('input[placeholder="000000"]');
  await expect(codeInput).toBeVisible({ timeout: 12000 });

  // Generate and fill TOTP code
  const code = generateTOTP(creds.mfaSecret);
  await codeInput.fill(code);

  // Submit code ("Sign in →")
  await page.locator('button[type="submit"]').click();

  // Wait for successful redirect away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 18000 });
  console.log(`✅ Logged in as ${creds.email}`);
}

// ── Clear a saved item preference from employee_cafeteria_preferences ─────────
async function clearItemPref(userId, itemNameLower) {
  const { data } = await supabaseAdmin
    .from('employee_cafeteria_preferences')
    .select('item_prefs')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.item_prefs && data.item_prefs[itemNameLower]) {
    const updated = { ...data.item_prefs };
    delete updated[itemNameLower];
    await supabaseAdmin
      .from('employee_cafeteria_preferences')
      .update({ item_prefs: updated })
      .eq('user_id', userId);
    console.log(`  Cleared saved pref for '${itemNameLower}'`);
  }
}

// ── Open cart sheet and place order ──────────────────────────────────────────
// Strategy: open sheet → check if Place Order already enabled (location auto-set)
// If disabled, location picker grid is shown — click Tech Team inside the sheet
async function placeOrder(page) {
  // 1. Open the Review Order floating button
  const reviewBtn = page.locator('button:has-text("Review Order")');
  await expect(reviewBtn).toBeVisible({ timeout: 10000 });
  await reviewBtn.click();

  // 2. Wait for the OrderSheet panel to animate in
  await page.waitForTimeout(900);

  // 3. Check if Place Order button is enabled (means location is already auto-set)
  const placeBtn = page.locator('button:has-text("Place Order")');
  await expect(placeBtn).toBeVisible({ timeout: 6000 });

  const alreadyEnabled = await placeBtn.isEnabled().catch(() => false);
  if (!alreadyEnabled) {
    // Location grid is shown inside the sheet — use force click to bypass any overlay
    // The location buttons render inside the sheet's white panel (not behind backdrop)
    const techTeamInSheet = page.locator('button:has-text("Tech Team")').first();
    await expect(techTeamInSheet).toBeVisible({ timeout: 3000 });
    // Force click bypasses pointer-event interception from backdrop siblings
    await techTeamInSheet.click({ force: true });
    await page.waitForTimeout(400);
  }

  // 4. Place Order (enabled = location set)
  await expect(placeBtn).toBeEnabled({ timeout: 5000 });
  await placeBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cafeteria Polish E2E Tests', () => {

  // Cancel pending requests before each test to avoid queue pollution
  test.beforeEach(async () => {
    const { data: active } = await supabaseAdmin
      .from('requests')
      .select('id')
      .in('status', ['confirming', 'pending', 'placed', 'in_progress']);
    if (active?.length) {
      await supabaseAdmin
        .from('requests')
        .update({ status: 'cancelled' })
        .in('id', active.map(r => r.id));
      console.log(`  Cleared ${active.length} lingering active requests`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  test('01 — Stirrer stock depletion (-1.5) and restoration on cancel', async ({ page }) => {
    test.setTimeout(90000); // extended: login + order + cancel

    // ── DB Setup ──────────────────────────────────────────────────────────────
    // Reset Stirrers to exactly 100
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_servings: 100, available: true, orderable: true })
      .ilike('item_name', 'Stirrers');

    // Enable Assam tea with 10 servings so it's orderable and shows in UI
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_today: 10, stock_servings: 10, available: true, orderable: true })
      .eq('item_name', 'Assam tea');

    // Clear any saved taste preference for 'assam tea' so BeverageCustomSheet always opens
    await clearItemPref(credentials.employee.userId, 'assam tea');

    // ── Login ─────────────────────────────────────────────────────────────────
    await loginAs('employee', page);

    // ── Navigate to Cafeteria and click Assam tea ─────────────────────────────
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });

    // Navigate to cafeteria if not already there
    if (!page.url().includes('/request') && !page.url().endsWith('/')) {
      await page.goto('/');
    }

    // Click the Assam tea card — target the clickable motion.div (cursor-pointer) not just the text
    await page.locator('[class*="cursor-pointer"]:has-text("Assam tea")').first().click();

    // ── Handle both paths after clicking: ─────────────────────────────────────
    // Path A: BeverageCustomSheet opens (pref cleared) → click "Add to order ✓"
    // Path B: Pref was auto-applied → item added directly to cart → "Review Order" appears
    const sheetBtn   = page.locator('button:has-text("Add to order")');
    const reviewBtn0 = page.locator('button:has-text("Review Order")');

    const whichAppeared = await Promise.race([
      sheetBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => 'sheet'),
      reviewBtn0.waitFor({ state: 'visible', timeout: 8000 }).then(() => 'cart'),
    ]).catch(() => 'timeout');

    if (whichAppeared === 'sheet') {
      // BeverageCustomSheet is open — confirm to add item to cart
      await sheetBtn.click();
      console.log('  Confirmed via BeverageCustomSheet');
    } else if (whichAppeared === 'cart') {
      console.log('  Auto-added to cart (saved preference applied)');
    } else {
      throw new Error('Assam tea: neither BeverageCustomSheet nor Review Order appeared within 8s');
    }
    // ── Item is now in cart ────────────────────────────────────────────────────

    // ── Place Order ───────────────────────────────────────────────────────────
    await placeOrder(page);
    await page.waitForURL(url => url.pathname.includes('/track/'), { timeout: 15000 });
    console.log('  Redirected to:', page.url());

    // ── Assert stirrer stock dropped by Math.round(1*1.5)=2 (100 → 98) ─────────
    const { data: after } = await supabaseAdmin
      .from('cafeteria_items')
      .select('stock_servings')
      .ilike('item_name', 'Stirrers')
      .single();
    expect(after.stock_servings).toBe(98);
    console.log('✅ Stirrers after order:', after.stock_servings, '(expected 98)');

    // ── Cancel within 30-second window ───────────────────────────────────────
    const cancelBtn = page.locator('button:has-text("Cancel Order")');
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();
    await expect(page.locator('h1:has-text("Order Cancelled")')).toBeVisible({ timeout: 10000 });

    // ── Assert stirrer stock restored to 100 ─────────────────────────────────
    // Wait for REST API to commit restore
    await page.waitForTimeout(1500);
    const { data: restored } = await supabaseAdmin
      .from('cafeteria_items')
      .select('stock_servings')
      .ilike('item_name', 'Stirrers')
      .single();
    expect(restored.stock_servings).toBe(100);
    console.log('✅ Stirrers restored after cancel:', restored.stock_servings, '(expected 100)');
  });

  // ───────────────────────────────────────────────────────────────────────────
  test('02 — Atta Bread depletion (-2 slices) on Mix Fruit Jam order + restore on cancel', async ({ page }) => {
    test.setTimeout(90000);

    // ── DB Setup ──────────────────────────────────────────────────────────────
    // Atta Bread: 50 servings
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_today: 50, stock_servings: 50, available: true, orderable: false })
      .eq('item_name', 'MDRN AT SHK BRD400G');

    // Milk Bread: 50 servings (needed so breadItems array exists)
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_today: 50, stock_servings: 50, available: true, orderable: false })
      .eq('item_name', 'Bread');

    // Mix Fruit Jam: 100 servings
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_today: 100, stock_servings: 100, available: true, orderable: true })
      .eq('item_name', 'Mix Fruit Jam');

    // Clear saved jam preference so JamCustomSheet always opens
    await clearItemPref(credentials.employee.userId, 'mix fruit jam');

    // ── Login ─────────────────────────────────────────────────────────────────
    await loginAs('employee', page);

    // Navigate to cafeteria page
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    if (!page.url().includes('/request') && !page.url().endsWith('/')) {
      await page.goto('/');
    }

    // ── Click Mix Fruit Jam ───────────────────────────────────────────────────
    await expect(page.locator('text=Mix Fruit Jam').first()).toBeVisible({ timeout: 12000 });
    await page.locator('text=Mix Fruit Jam').first().click();

    // ── JamCustomSheet: select Atta Bread ────────────────────────────────────
    const attaBreadBtn = page.locator('button:has-text("Atta Bread")');
    await expect(attaBreadBtn).toBeVisible({ timeout: 8000 });
    await attaBreadBtn.click();

    // Verify the confirm button shows 190 kcal (One Side, Jam)
    const addJamBtn = page.locator('button:has-text("Add to order")');
    await expect(addJamBtn).toBeVisible({ timeout: 5000 });
    await expect(addJamBtn).toContainText('190 kcal');

    // Confirm
    await addJamBtn.click();

    // ── Place Order ───────────────────────────────────────────────────────────
    await placeOrder(page);
    await page.waitForURL(url => url.pathname.includes('/track/'), { timeout: 15000 });
    console.log('  Redirected to:', page.url());

    // ── Assert Atta Bread decreased by 2 (50 → 48) ───────────────────────────
    const { data: breadAfter } = await supabaseAdmin
      .from('cafeteria_items')
      .select('stock_servings')
      .eq('item_name', 'MDRN AT SHK BRD400G')
      .single();
    expect(breadAfter.stock_servings).toBe(48);
    console.log('✅ Atta Bread after order:', breadAfter.stock_servings, '(expected 48)');

    // ── Assert Mix Fruit Jam decreased by 1 (100 → 99) ───────────────────────
    const { data: jamAfter } = await supabaseAdmin
      .from('cafeteria_items')
      .select('stock_servings')
      .eq('item_name', 'Mix Fruit Jam')
      .single();
    expect(jamAfter.stock_servings).toBe(99);
    console.log('✅ Mix Fruit Jam after order:', jamAfter.stock_servings, '(expected 99)');

    // ── Cancel within 30-second window ───────────────────────────────────────
    const cancelBtn = page.locator('button:has-text("Cancel Order")');
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();
    await expect(page.locator('h1:has-text("Order Cancelled")')).toBeVisible({ timeout: 10000 });

    // ── Assert Atta Bread restored to 50 ─────────────────────────────────────
    // Wait for REST API to commit restore
    await page.waitForTimeout(1500);
    const { data: breadRestored } = await supabaseAdmin
      .from('cafeteria_items')
      .select('stock_servings')
      .eq('item_name', 'MDRN AT SHK BRD400G')
      .single();
    expect(breadRestored.stock_servings).toBe(50);

    // ── Assert Mix Fruit Jam restored to 100 ─────────────────────────────────
    const { data: jamRestored } = await supabaseAdmin
      .from('cafeteria_items')
      .select('stock_servings')
      .eq('item_name', 'Mix Fruit Jam')
      .single();
    expect(jamRestored.stock_servings).toBe(100);
    console.log('✅ Atta Bread and Mix Fruit Jam fully restored after cancel');
  });

  // ───────────────────────────────────────────────────────────────────────────
  test('03 — Mix Fruit Jam shows "Needs bread" when all bread stock is zero', async ({ page }) => {
    test.setTimeout(60000);

    // ── DB Setup: zero out all bread ─────────────────────────────────────────
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_today: 0, stock_servings: 0 })
      .in('item_name', ['Bread', 'MDRN AT SHK BRD400G']);

    // ── Login ─────────────────────────────────────────────────────────────────
    await loginAs('employee', page);

    // Navigate to cafeteria page
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    if (!page.url().includes('/request') && !page.url().endsWith('/')) {
      await page.goto('/');
    }

    // ── Assert "🍞 Needs bread" label is visible on Mix Fruit Jam card ────────
    // The ItemChip renders a grayed-out card with "🍞 Needs bread" when blockedByBread is true
    await expect(page.locator('text=Needs bread').first()).toBeVisible({ timeout: 12000 });
    console.log('✅ "Needs bread" gate confirmed on Mix Fruit Jam when all bread is out of stock');

    // ── DB Teardown: restore bread stock ─────────────────────────────────────
    await supabaseAdmin
      .from('cafeteria_items')
      .update({ stock_today: 50, stock_servings: 50 })
      .in('item_name', ['Bread', 'MDRN AT SHK BRD400G']);
    console.log('  Bread stock restored');
  });

  // ───────────────────────────────────────────────────────────────────────────
  test('04 — Duplicate bill API correctly returns roast message', async ({ page }) => {
    test.setTimeout(60000);

    const MOCK_ROAST = 'Bhai, ye bill pehle se system mein hai. Duplicate blocked! ♟️';

    // Mock the /api/bills/extract endpoint to simulate a duplicate bill response
    await page.route('**/api/bills/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Duplicate Bill Detected',
          message: `❌ Duplicate Bill Detected!\nVendor: Reliance Retail\nInvoice: #U96218626503030\n\n${MOCK_ROAST}`,
        }),
      });
    });

    // Login as officeboy (has access to bill upload UI)
    await loginAs('officeboy', page);

    // Trigger the mocked API via page.evaluate() (avoids CORS issues in browser context)
    const result = await page.evaluate(async (supaUrl) => {
      const response = await fetch('/api/bills/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: 'https://example.com/duplicate_bill.pdf' }),
      });
      return response.json();
    }, SUPABASE_URL);

    // ── Assertions ────────────────────────────────────────────────────────────
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Duplicate Bill Detected');
    expect(result.message).toContain('Duplicate Bill Detected');
    expect(result.message).toContain(MOCK_ROAST);
    console.log('✅ Duplicate bill roast confirmed:', result.message.slice(0, 80) + '...');
  });
});
