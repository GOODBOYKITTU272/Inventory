import { Router } from 'express';
import { randomBytes } from 'crypto';
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

router.post('/start-otp', async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const email = schema.parse(req.body).email.trim().toLowerCase();

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
    }

    let user = await findUserByEmail(email);

    if (!user) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        email_confirm: true,
        user_metadata: { full_name: displayNameFromEmail(email) },
      });
      if (createErr) throw createErr;
      user = created.user;
    } else if (!user.email_confirmed_at) {
      const { data: updated, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email_confirm: true },
      );
      if (updateErr) throw updateErr;
      user = updated.user;
    }

    await ensureProfile(user.id, email);

    const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: req.get('origin') || process.env.ALLOWED_ORIGINS?.split(',')[0],
      },
    });

    if (otpErr) throw otpErr;

    res.json({ ok: true, email });
  } catch (e) {
    next(e);
  }
});

export default router;
