import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 min
const ENROLLMENT_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 min
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 sec
const MAX_SENDS_PER_HOUR = 3;

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function generateOtp(email) {
  const normalized = normalizeEmail(email);

  // Cleanup expired rows for this email
  await supabaseAdmin
    .from('enrollment_otps')
    .delete()
    .eq('email', normalized)
    .lt('expires_at', new Date().toISOString());

  // Rate limit: count sends in last 1 hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('enrollment_otps')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalized)
    .gte('created_at', hourAgo);

  if (count >= MAX_SENDS_PER_HOUR) throw new Error('RATE_LIMITED');

  // Cooldown: check most recent row
  const { data: last } = await supabaseAdmin
    .from('enrollment_otps')
    .select('created_at')
    .eq('email', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_COOLDOWN_MS) {
    throw new Error('COOLDOWN');
  }

  // Generate cryptographically secure 6-digit code
  const code = crypto.randomInt(100000, 1000000).toString();

  const { error } = await supabaseAdmin.from('enrollment_otps').insert({
    email: normalized,
    code_hash: hashValue(code),
    expires_at: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
    attempts: 0,
    used: false,
  });

  if (error) throw error;

  return code;
}

export async function verifyOtp(email, code) {
  const normalized = normalizeEmail(email);

  const { data: otp } = await supabaseAdmin
    .from('enrollment_otps')
    .select('*')
    .eq('email', normalized)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) return { valid: false, reason: 'expired_or_not_found' };
  if (otp.attempts >= MAX_ATTEMPTS) return { valid: false, reason: 'max_attempts' };

  // Increment attempts before checking code (prevents enumeration timing attacks)
  await supabaseAdmin
    .from('enrollment_otps')
    .update({ attempts: otp.attempts + 1 })
    .eq('id', otp.id);

  if (hashValue(code) !== otp.code_hash) return { valid: false, reason: 'invalid_code' };

  const enrollmentToken = crypto.randomUUID();

  const { error } = await supabaseAdmin
    .from('enrollment_otps')
    .update({
      used: true,
      enrollment_token_hash: hashValue(enrollmentToken),
      enrollment_token_expires_at: new Date(Date.now() + ENROLLMENT_TOKEN_EXPIRY_MS).toISOString(),
    })
    .eq('id', otp.id);

  if (error) throw error;

  return { valid: true, enrollmentToken };
}

export async function verifyEnrollmentToken(email, token) {
  const normalized = normalizeEmail(email);

  const { data } = await supabaseAdmin
    .from('enrollment_otps')
    .select('id')
    .eq('email', normalized)
    .eq('enrollment_token_hash', hashValue(token))
    .gt('enrollment_token_expires_at', new Date().toISOString())
    .maybeSingle();

  if (!data) return false;

  // Consume the token to prevent replay attacks
  await supabaseAdmin
    .from('enrollment_otps')
    .update({
      enrollment_token_hash: null,
      enrollment_token_expires_at: null,
    })
    .eq('id', data.id);

  return true;
}
