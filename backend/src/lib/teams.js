/**
 * Posts notifications to Microsoft Teams via Power Automate HTTP trigger.
 *
 * Power Automate expects simple JSON body — NOT Adaptive Cards.
 * Env var: POWER_AUTOMATE_URL (falls back to TEAMS_WEBHOOK_URL for backward compat)
 */
const PA_URL = process.env.POWER_AUTOMATE_URL || process.env.TEAMS_WEBHOOK_URL;

function istNow() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function postToPA(body) {
  if (!PA_URL) {
    console.log('[Teams] No Power Automate URL set — skipping');
    return { skipped: true };
  }

  try {
    const res = await fetch(PA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (!res.ok) {
      console.error('[Teams] POST failed', res.status, text.slice(0, 400));
      return { ok: false, status: res.status, body: text.slice(0, 200) };
    }

    console.log('[Teams] Sent OK:', text.slice(0, 80));
    return { ok: true };
  } catch (e) {
    console.error('[Teams] fetch error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── New Order ────────────────────────────────────────────────────────────────
export async function postOrderToTeams(order) {
  const item = order.parsed_item || order.raw_text || 'Request';
  const employee = order.parsed_employee_name || order.ordered_by || 'Someone';
  const location = order.parsed_location || order.deliver_to || 'Not specified';
  const qty = parseInt(order.quantity, 10) || 1;

  return postToPA({
    event_type: 'new_order',
    ordered_by: employee,
    items: [{ name: item, qty }],
    deliver_to: location,
    instruction: order.instruction || '',
    time: istNow(),
  });
}

// ── Order Cancelled ──────────────────────────────────────────────────────────
export async function postCancelToTeams(order, cancelledBy = 'self') {
  const item = order.parsed_item || order.raw_text || 'Request';
  const employee = order.parsed_employee_name || 'Someone';
  const qty = parseInt(order.raw_text?.match(/^(\d+)x/)?.[1], 10) || 1;

  return postToPA({
    event_type: 'cancelled',
    ordered_by: employee,
    items: [{ name: item, qty }],
    cancelled_by: cancelledBy,
    time: istNow(),
  });
}

// ── Meal Summary (daily at cutoff) ───────────────────────────────────────────
export async function postMealSummaryToTeams(summary) {
  return postToPA({
    event_type: 'meal_summary',
    date: summary.date,
    veg: summary.veg_count || 0,
    non_veg: summary.non_veg_count || 0,
    egg: summary.egg_count || 0,
    skip: summary.skip_count || 0,
    not_booked: summary.not_booked || 0,
    total_meals: summary.total_meals || 0,
    total_cost: summary.cost?.total || 0,
    time: istNow(),
  });
}

// ── Bill Uploaded ────────────────────────────────────────────────────────────
export async function postBillToTeams(bill) {
  return postToPA({
    event_type: 'bill_uploaded',
    vendor: bill.vendor_name || 'Unknown',
    invoice_number: bill.invoice_number || '—',
    grand_total: bill.grand_total || 0,
    items_count: bill.items_count || 0,
    uploaded_by: bill.uploaded_by || 'Office Boy',
    time: istNow(),
  });
}

// ── Stock Alert ──────────────────────────────────────────────────────────────
export async function postStockAlertToTeams(item) {
  return postToPA({
    event_type: 'stock_alert',
    item_name: item.display_name || item.item_name || 'Unknown',
    stock_remaining: item.stock_servings ?? item.stock_today ?? 0,
    unit: 'servings',
    time: istNow(),
  });
}

// ── Backward compat — keep old name working ──────────────────────────────────
export const postRequestToTeams = postOrderToTeams;
