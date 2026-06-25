import { Router } from 'express';
import { z } from 'zod';
import {
  isDirectoryUser,
  isGraphConfigured,
  isSendMailConfigured,
  sendOtpEmail,
} from '../lib/microsoftGraph.js';
import {
  cancelOtp,
  generateOtp,
  normalizeEmail,
  verifyEnrollmentToken,
  verifyOtp,
} from '../lib/otpService.js';
import { supabaseAdmin, supabaseAnon, supabaseAsUser } from '../lib/supabase.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

function displayNameFromEmail(email) {
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// ── Router factory ─────────────────────────────────────────────────────────
// All handlers close over `d` (deps). The default export injects real modules;
// tests inject mocks by calling createAuthRouter({ supabaseAdmin: mock, ... }).

export function createAuthRouter(overrides = {}) {
  const d = {
    supabaseAdmin,
    supabaseAnon,
    supabaseAsUser,
    isGraphConfigured,
    isSendMailConfigured,
    isDirectoryUser,
    sendOtpEmail,
    cancelOtp,
    generateOtp,
    verifyOtp,
    verifyEnrollmentToken,
    normalizeEmail,
    ...overrides,
  };

  const router = Router();

  async function findUserByEmail(email) {
    const { data, error } = await d.supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    if (error) throw error;
    return data?.users?.find((user) => user.email?.toLowerCase() === email) || null;
  }

  // profiles.email is populated by the handle_new_user trigger (migration 0009).
  // Row existence is the approved-active-employee signal — no active/approved boolean exists in schema.
  async function findProfileByEmail(email) {
    const { data } = await d.supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    return data || null;
  }

  async function ensureProfile(userId, email, displayName) {
    const { data: existing, error: readErr } = await d.supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (readErr) throw readErr;
    if (existing) return;

    const { error: insertErr } = await d.supabaseAdmin.from('profiles').insert({
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

      const origin = (
        req.get('origin') ||
        process.env.ALLOWED_ORIGINS?.split(',')[0] ||
        ''
      ).replace(/\/$/, '');
      const { error: linkErr } = await d.supabaseAdmin.auth.signInWithOtp({
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
      if (!d.isGraphConfigured()) {
        console.error('[Auth] Microsoft Graph not configured — denying login.');
        return res
          .status(503)
          .json({ error: 'Login is temporarily unavailable. Please try later.' });
      }

      let dir;
      try {
        dir = await d.isDirectoryUser(email);
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
        const { data: created, error: createErr } = await d.supabaseAdmin.auth.admin.createUser({
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

  // ── New OTP-based MFA enrollment flow ───────────────────────────────────
  // These three endpoints run in sequence for first-time TOTP setup.
  // The existing /start-email-login and /verify-email endpoints are preserved
  // unchanged so the current frontend continues to work during Wave 1.

  // POST /api/auth/start-enrollment
  // Validates the email, confirms Entra membership, generates and sends the OTP.
  // Returns a generic ok for both success and "not found" to prevent enumeration.
  router.post('/start-enrollment', async (req, res, next) => {
    try {
      const schema = z.object({ email: z.string().email() });
      const email = d.normalizeEmail(schema.parse(req.body).email);

      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        return res.status(403).json({ error: 'Login not available for this email.' });
      }

      if (!d.isSendMailConfigured()) {
        console.error('[Auth] Graph/sendMail not configured — cannot start enrollment.');
        return res
          .status(503)
          .json({ error: 'Login is temporarily unavailable. Please try later.' });
      }

      // Gate 1: Supabase Auth account must exist (pre-provisioned — no self-registration).
      const existingUser = await findUserByEmail(email);
      if (!existingUser) {
        return res.json({ ok: true }); // generic: do not reveal whether email is registered
      }

      // Gate 2: profiles row must exist. profiles.email is set by the handle_new_user trigger
      // (migration 0009). Row presence is the approved-active-employee signal — no active/approved
      // boolean column exists in the schema.
      const profile = await findProfileByEmail(email);
      if (!profile) {
        return res.json({ ok: true }); // generic: do not reveal non-membership
      }

      // Gate 3: Confirm active Entra directory membership. Fail closed on lookup error.
      let dir;
      try {
        dir = await d.isDirectoryUser(email);
      } catch (e) {
        console.error('[Auth] directory lookup failed during start-enrollment:', e.message);
        return res
          .status(503)
          .json({ error: 'Could not verify your account right now. Please try again.' });
      }

      if (!dir.exists) {
        return res.json({ ok: true }); // generic: do not reveal directory non-membership
      }

      let code;
      let otpId;
      try {
        ({ code, otpId } = await d.generateOtp(email));
      } catch (e) {
        if (e.message === 'COOLDOWN') {
          return res.status(429).json({ error: 'Please wait before requesting another code.' });
        }
        if (e.message === 'RATE_LIMITED') {
          return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.' });
        }
        throw e;
      }

      try {
        await d.sendOtpEmail(email, code);
      } catch (e) {
        // Rescind the specific row by primary key so a failed delivery doesn't burn
        // the cooldown or hourly rate-limit slot. Logs generically on cleanup failure —
        // never the code, token, or row ID.
        try {
          await d.cancelOtp(otpId);
        } catch (cleanupErr) {
          console.error('[Auth] OTP cleanup failed after send error — row may persist:', cleanupErr.message);
        }
        console.error('[Auth] sendOtpEmail failed:', e.message);
        return res
          .status(503)
          .json({ error: 'Could not send verification code. Please try again.' });
      } finally {
        // ponytail: clear plaintext OTP reference — belt-and-suspenders against
        // accidental log/serialization after this point
        code = null;
      }

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/auth/verify-enrollment-otp
  // Verifies the 6-digit OTP sent to the user's inbox.
  // Returns a short-lived enrollment token used in the next step.
  router.post('/verify-enrollment-otp', async (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        code: z
          .string()
          .length(6)
          .regex(/^\d{6}$/),
      });
      const parsed = schema.parse(req.body);
      const email = d.normalizeEmail(parsed.email);

      const result = await d.verifyOtp(email, parsed.code);
      if (!result.valid) {
        return res.status(401).json({ error: 'Invalid or expired code.' });
      }

      res.json({ enrollmentToken: result.enrollmentToken });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request.' });
      }
      next(e);
    }
  });

  // POST /api/auth/complete-totp-enrollment
  // Consumes the enrollment token, creates a Supabase TOTP MFA factor, and
  // returns the QR code / secret for the user to scan in their authenticator.
  // The temporary session used for mfa.enroll() is server-side only —
  // no session tokens are sent to the client here (that's Wave 2 login).
  router.post('/complete-totp-enrollment', async (req, res, next) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        enrollmentToken: z.string().uuid(),
      });
      const parsed = schema.parse(req.body);
      const email = d.normalizeEmail(parsed.email);

      // Atomically consume the token — returns false if already used or expired.
      const tokenValid = await d.verifyEnrollmentToken(email, parsed.enrollmentToken);
      if (!tokenValid) {
        return res.status(401).json({ error: 'Invalid or expired enrollment token.' });
      }

      // Re-confirm account still exists after token consumption.
      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(403).json({ error: 'Account not found.' });
      }

      // Generate a short-lived user-scoped session for the mfa.enroll() call.
      // service-role key is used here server-side only; it never leaves the backend.
      const { data: linkData, error: linkErr } = await d.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (linkErr) throw linkErr;

      const emailOtp = linkData?.properties?.email_otp;
      if (!emailOtp) throw new Error('generateLink did not return email_otp');

      // Exchange the magic-link OTP for an AAL1 user session (anon key, user-scoped).
      const { data: sessionData, error: sessionErr } = await d.supabaseAnon.auth.verifyOtp({
        email,
        token: emailOtp,
        type: 'magiclink',
      });
      if (sessionErr) throw sessionErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Failed to establish user session for TOTP enrollment');

      // Enroll TOTP using the user-scoped client (not service role).
      const { data: enrollData, error: enrollErr } = await d
        .supabaseAsUser(accessToken)
        .auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Snackify',
        });
      if (enrollErr) throw enrollErr;

      const { id: factorId, totp } = enrollData;
      res.json({
        factorId,
        qrCode: totp.qr_code,
        secret: totp.secret,
        uri: totp.uri,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request.' });
      }
      next(e);
    }
  });

  return router;
}

export default createAuthRouter();
