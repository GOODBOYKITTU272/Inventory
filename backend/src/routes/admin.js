import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const roleEnum = z.enum(['facility_manager', 'finance', 'leadership', 'staff', 'office_boy']);

// Every admin route is leadership-only.
router.use(requireRole('leadership'));

// GET /api/admin/users  - all users + their roles, joined with auth.users for email
router.get('/users', async (_req, res, next) => {
  try {
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: true });
    if (pErr) throw pErr;

    // Pull emails via auth.admin
    const { data: usersList, error: uErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (uErr) throw uErr;

    const emailMap = new Map(usersList.users.map((u) => [u.id, u.email]));

    const rows = profiles.map((p) => ({
      ...p,
      email: emailMap.get(p.id) || null,
    }));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// PATCH /api/admin/users/:id/role  - change a user's role
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const role = roleEnum.parse(req.body.role);
    if (req.params.id === req.user.id && role !== 'leadership') {
      return res.status(400).json({
        error: 'You cannot demote yourself. Ask another leadership user to do it.',
      });
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// POST /api/admin/users/create  - pre-create user for password setup login
router.post('/users/create', async (req, res, next) => {
  try {
    const schema = z.object({
      email:     z.string().email(),
      role:      roleEnum.default('staff'),
      full_name: z.string().min(1),
    });
    const { email, role, full_name } = schema.parse(req.body);

    // 1. Create the auth user with an unshared random password. Users set their own password by email link.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password:      randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { full_name },
    });

    let userId = created?.user?.id;

    if (createErr) {
      // User already exists — look up their ID
      if (String(createErr.message).toLowerCase().includes('already')) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
        if (!userId) throw createErr;
      } else {
        throw createErr;
      }
    }

    // 2. Upsert profile with name + role
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, full_name, role }, { onConflict: 'id' })
      .select()
      .single();
    if (pErr) throw pErr;

    res.status(201).json({ ok: true, user_id: userId, email, role, profile });
  } catch (e) {
    next(e);
  }
});

// POST /api/admin/users/invite  - pre-create an auth user + send Supabase invite email
// The invite email contains a magic link; user can either use it OR sign in with Microsoft —
// either way Supabase will match by email.
router.post('/users/invite', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      role: roleEnum.default('staff'),
      full_name: z.string().optional(),
    });
    const { email, role, full_name } = schema.parse(req.body);

    // 1. Send the invite (creates a pending auth.users row)
    const { data: invited, error: invErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name || email },
        redirectTo: (process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:5173') + '/dashboard',
      });
    if (invErr) {
      // If the user already exists, fall through to role-set
      if (!String(invErr.message).toLowerCase().includes('already')) {
        throw invErr;
      }
    }

    // 2. Find their user id (either from the invite response or by listing)
    let userId = invited?.user?.id;
    if (!userId) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    }
    if (!userId) {
      return res.status(500).json({ error: 'Invited but could not locate user id' });
    }

    // 3. Upsert profile with role (the trigger may have already inserted as staff)
    await supabaseAdmin
      .from('profiles')
      .upsert(
        { id: userId, full_name: full_name || email, role },
        { onConflict: 'id' },
      );

    res.status(201).json({ ok: true, user_id: userId, email, role });
  } catch (e) {
    next(e);
  }
});

export default router;
