import { Router } from 'express';
import { z } from 'zod';
import { isDirectoryUser, isGraphConfigured } from '../lib/microsoftGraph.js';
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

async function ensureProfile(userId, email, displayName) {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing) return;

  const { error: insertErr } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    full_name: displayName || displayNameFromEmail(email),
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

    const origin = (req.get('origin') || process.env.ALLOWED_ORIGINS?.split(',')[0] || '').replace(
      /\/$/,
      ''
    );
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

// POST /api/auth/verify-email
// Gate the login: the email must (a) be on the company domain and (b) exist as a
// real, enabled user in the Azure (Entra) directory. Only then do we ensure a
// Supabase account + profile. This is what stops random / unknown emails from
// self-registering. The browser calls this BEFORE attempting Supabase sign-in.
router.post('/verify-email', async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const email = schema.parse(req.body).email.trim().toLowerCase();

    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} accounts are allowed.` });
    }

    // Safety: if Graph isn't configured we FAIL CLOSED (deny) rather than letting
    // everyone in. This prevents the gate silently turning off.
    if (!isGraphConfigured()) {
      console.error('[Auth] Microsoft Graph not configured — denying login.');
      return res.status(503).json({ error: 'Login is temporarily unavailable. Please try later.' });
    }

    let dir;
    try {
      dir = await isDirectoryUser(email);
    } catch (e) {
      // Directory lookup error → deny (fail closed), never allow on error.
      console.error('[Auth] directory lookup failed:', e.message);
      return res
        .status(503)
        .json({ error: 'Could not verify your account right now. Please try again.' });
    }

    if (!dir.exists) {
      return res.status(403).json({ error: 'This email is not in the ApplyWizz directory.' });
    }

    // Email is a real directory user → ensure a Supabase account exists.
    let user = await findUserByEmail(email);
    if (!user) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      user = created?.user;
    }

    if (user) await ensureProfile(user.id, email, dir.displayName);

    res.json({ ok: true, email });
  } catch (e) {
    next(e);
  }
});

export default router;
