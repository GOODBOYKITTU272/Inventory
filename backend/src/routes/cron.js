import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { getAIDecision } from '../lib/recommendations.js';
import { sendPushToUsers } from './push.js';
import { postAIReminderToTeams } from '../lib/teams.js';

const router = Router();

router.post('/ai-reminders', async (req, res) => {
  const secret = req.query.secret || req.body?.secret || req.headers['x-cron-secret'];
  const cronSecret = process.env.CRON_SECRET || 'app_wizz_cron_secret_change_in_production';

  if (secret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch opted-in employee reminder policies
  const { data: rawOptedIn, error: err } = await supabaseAdmin
    .from('employee_cafeteria_preferences')
    .select('user_id')
    .eq('reminder_enabled', true);

  if (err) {
    console.error('[Cron] failed to load preferences:', err.message);
    return res.status(500).json({ error: err.message });
  }

  if (!rawOptedIn?.length) return res.json({ sent: 0 });

  // Fetch profiles for the opted-in users to get their full names
  const userIds = rawOptedIn.map((o) => o.user_id).filter(Boolean);
  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  if (profilesErr) {
    console.error('[Cron] failed to load profiles:', profilesErr.message);
    return res.status(500).json({ error: profilesErr.message });
  }

  const nameMap = {};
  if (profiles) {
    profiles.forEach((p) => {
      nameMap[p.id] = p.full_name;
    });
  }

  const optedIn = rawOptedIn.map(({ user_id }) => ({
    user_id,
    profiles: {
      full_name: nameMap[user_id] || 'Team Member',
    },
  }));


  // Respond immediately — don't block on GPT calls
  res.json({ queued: optedIn.length });

  // Fire and forget
  await Promise.allSettled(
    optedIn.map(async ({ user_id, profiles }) => {
      try {
        const employeeName = profiles?.full_name || 'Team Member';
        const decision = await getAIDecision(user_id);
        if (!decision?.send_notification) return;

        await Promise.allSettled([
          sendPushToUsers([user_id], {
            title: decision.title,
            body:  decision.message,
            url:   '/request',
            tag:   `reminder-${user_id}`,
          }),
          postAIReminderToTeams(user_id, decision),
        ]);
      } catch (e) {
        console.error('[Cron] employee', user_id, e.message);
      }
    })
  );
});

export default router;
