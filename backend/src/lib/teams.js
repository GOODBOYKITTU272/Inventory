// Posts an Adaptive Card to a Microsoft Teams Incoming Webhook.
// Optional - if TEAMS_WEBHOOK_URL is empty, we silently skip.
const TEAMS_URL = process.env.TEAMS_WEBHOOK_URL;
const APP_URL   = process.env.APP_PUBLIC_URL || 'http://localhost:5173';

const PRIORITY_COLOR = {
  Urgent: 'Attention',
  Normal: 'Default',
};

export async function postRequestToTeams(req) {
  if (!TEAMS_URL) return { skipped: true };

  const priority = req.priority || 'Normal';
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: `🔔 New Request: ${req.parsed_item || 'Service'}`,
              weight: 'Bolder',
              size: 'Large',
              color: PRIORITY_COLOR[priority] || 'Default',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Request ID', value: `${req.id}`                     },
                { title: 'Employee',   value: req.parsed_employee_name || '-' },
                { title: 'Quantity',   value: `${req.quantity || 1}`          },
                { title: 'Location',   value: req.parsed_location || '-'      },
                { title: 'Priority',   value: priority                        },
                { title: 'Status',     value: req.live_status || 'placed'     },
              ],
            },
            {
              type: 'TextBlock',
              text: `**Instruction:** ${req.instruction || 'No specific instructions.'}`,
              wrap: true,
            },
            {
              type: 'TextBlock',
              text: `Created at: ${new Date(req.created_at).toLocaleString()}`,
              isSubtle: true,
              size: 'Small',
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Open in App to Accept',
              url: `${APP_URL}/queue`,
            },
          ],
        },
      },
    ],
  };

  try {
    const res = await fetch(TEAMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, body: text.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
