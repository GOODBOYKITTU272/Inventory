/**
 * Posts order notifications to Microsoft Teams via Power Automate webhook.
 *
 * Setup: Power Automate → "When a HTTP request is received" trigger
 *        → "Post message in a chat or channel"
 *        → Use trigger body fields: title, employee, item, location, instruction, url
 *
 * Optional TEAMS_WEBHOOK_URL env var — if missing, silently skips.
 */
const TEAMS_URL = process.env.TEAMS_WEBHOOK_URL;
const APP_URL   = process.env.APP_PUBLIC_URL || 'https://inventory-ashen-theta.vercel.app';

export async function postRequestToTeams(req) {
  if (!TEAMS_URL) {
    console.log('[Teams] TEAMS_WEBHOOK_URL not set — skipping');
    return { skipped: true };
  }

  const item     = req.parsed_item     || req.raw_text  || 'Request';
  const employee = req.parsed_employee_name || 'Someone';
  const location = req.parsed_location || '—';
  const priority = req.priority        || 'Normal';
  const qty      = req.quantity        || '1';
  const instr    = req.instruction     || '';

  // Simple JSON body — Power Automate workflow reads these fields
  const payload = {
    title:       `🔔 New ${priority === 'Urgent' ? '🚨 URGENT' : ''} Order`,
    employee,
    item:        `${qty}x ${item}`,
    location,
    instruction: instr,
    priority,
    url:         `${APP_URL}/queue`,
    request_id:  req.id || '',
    timestamp:   new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  };

  try {
    const res  = await fetch(TEAMS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
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
