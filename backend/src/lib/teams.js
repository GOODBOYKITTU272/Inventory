/**
 * Posts order notifications to Microsoft Teams via Power Automate webhook.
 *
 * Uses Adaptive Card format for "When a Teams webhook request is received" trigger.
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
  const time     = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Adaptive Card format for "When a Teams webhook request is received" trigger
  const payload = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Large',
              weight: 'Bolder',
              text: `🔔 New ${priority === 'Urgent' ? '🚨 URGENT ' : ''}Order`,
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Item', value: `${qty}x ${item}` },
                { title: 'For', value: employee },
                { title: 'Location', value: location },
                { title: 'Priority', value: priority },
                { title: 'Time', value: time },
              ],
            },
            ...(instr ? [{
              type: 'TextBlock',
              text: instr,
              wrap: true,
              size: 'Small',
              color: 'Accent',
            }] : []),
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: '📋 Open Queue',
              url: `${APP_URL}/queue`,
            },
          ],
        },
      },
    ],
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
