import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();
const ALLOWED_DOMAIN = 'applywizz.ai';

function displayNameFromEmail(email) {
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function findUserByEmail(email) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (error) throw error;
  return data?.users?.find((user) => user.email?.toLowerCase() === email) || null;
}

async function ensureProfile(userId, email) {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing) return;

  const { error: insertErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: userId,
      full_name: displayNameFromEmail(email),
      role: 'staff',
    });

  if (insertErr && insertErr.code !== '23505') throw insertErr;
}

router.post('/start-email-login', async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const email = schema.parse(req.body).email.trim().toLowerCase();

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) await ensureProfile(existingUser.id, email);

    const origin = (req.get('origin') || process.env.ALLOWED_ORIGINS?.split(',')[0] || '')
      .replace(/\/$/, '');
    const { error: linkErr } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: origin || undefined,
      },
    });

    if (linkErr) throw linkErr;

    res.json({ ok: true, email });
  } catch (e) {
    next(e);
  }
});

export default router;
