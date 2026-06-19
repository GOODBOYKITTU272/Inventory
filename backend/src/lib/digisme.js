/**
 * DigiSME HRMS API Client
 *
 * Handles authentication + employee data fetching.
 * Encryption flow (per DigiSME API v6.0 spec):
 *   1. Generate a 16-char random AES key
 *   2. PGP-encrypt that AES key with the DigiSME-provided public key
 *   3. Send the PGP-encrypted key as CustomKey to /Authenticate → get accesstoken
 *   4. For all subsequent calls, AES-encrypt the request JSON → send as {"str":"..."}
 *
 * Config (set in backend/.env):
 *   DIGISME_BASE_URL   - e.g. https://indhrmsgateway.azurewebsites.net
 *   DIGISME_CLIENT_ID  - provided by DigiSME
 *   DIGISME_SECRET_KEY - provided by DigiSME
 *   DIGISME_PGP_KEY    - armored PGP public key provided by DigiSME
 *   DIGISME_COMPANY_ID - your company ID in DigiSME
 */

import crypto from 'node:crypto';

const BASE_URL   = (process.env.DIGISME_BASE_URL   || 'https://indhrmsgateway.azurewebsites.net').replace(/\/$/, '');
const CLIENT_ID  = process.env.DIGISME_CLIENT_ID   || '';
const SECRET_KEY = process.env.DIGISME_SECRET_KEY  || '';
const PGP_KEY    = process.env.DIGISME_PGP_KEY     || '';
export const COMPANY_ID = process.env.DIGISME_COMPANY_ID || '';

// ── AES-128-ECB encryption ────────────────────────────────────────────────────
// DigiSME uses a 16-char key (128-bit). Requests are encrypted, response is plain JSON.

function generateAesKey() {
  return crypto.randomBytes(8).toString('hex'); // 16 hex chars = 128-bit
}

function aesEncrypt(plaintext, key) {
  const keyBuf = Buffer.from(key, 'utf8');
  const cipher = crypto.createCipheriv('aes-128-ecb', keyBuf, null);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

// ── PGP encryption of the AES key ────────────────────────────────────────────
// Requires the `openpgp` npm package.
// Install when PGP key is received: npm install openpgp
async function pgpEncryptKey(aesKey) {
  if (!PGP_KEY) {
    // Dev mode: no PGP key configured yet — return the key as-is.
    // DigiSME auth WILL fail until a real PGP key is set.
    console.warn('[DigiSME] DIGISME_PGP_KEY not set — running in dev/stub mode');
    return Buffer.from(aesKey).toString('base64');
  }

  // When DIGISME_PGP_KEY is set, uncomment this block and run: npm install openpgp
  // const { encrypt, readKey, createMessage } = await import('openpgp');
  // const publicKey = await readKey({ armoredKey: PGP_KEY });
  // const message   = await createMessage({ text: aesKey });
  // return await encrypt({ message, encryptionKeys: publicKey, format: 'armored' });

  throw new Error(
    '[DigiSME] PGP encryption not yet wired up.\n' +
    '1. Run: npm install openpgp\n' +
    '2. Uncomment the openpgp block in backend/src/lib/digisme.js'
  );
}

// ── Authenticate — get bearer token ──────────────────────────────────────────
// Token is valid for 60 minutes per DigiSME spec.
// Returns { accesstoken, expiresIn, aesKey } — caller should cache and reuse.
export async function authenticate() {
  if (!CLIENT_ID || !SECRET_KEY) {
    throw new Error('[DigiSME] DIGISME_CLIENT_ID and DIGISME_SECRET_KEY must be set in .env');
  }

  const aesKey       = generateAesKey();
  const encryptedKey = await pgpEncryptKey(aesKey);

  const url = `${BASE_URL}/api/Authenticate`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ClientID:  CLIENT_ID,
      SecretKey: SECRET_KEY,
      CustomKey: encryptedKey,
    }),
  });

  if (!res.ok) {
    throw new Error(`[DigiSME] Authenticate failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.accesstoken) {
    throw new Error(`[DigiSME] Authenticate returned no token: ${JSON.stringify(data)}`);
  }

  return { accesstoken: data.accesstoken, expiresIn: data.expiresIn, aesKey };
}

// ── GET /GetEmployeeDetails ───────────────────────────────────────────────────
// isActive: 0 = resigned, 1 = active, 2 = all (default)
export async function getEmployeeDetails({ accesstoken, aesKey, companyId = COMPANY_ID, isActive = 1 }) {
  const payload   = JSON.stringify({ CompanyID: String(companyId), IsActive: String(isActive) });
  const encrypted = aesEncrypt(payload, aesKey);

  const url = `${BASE_URL}/api/GetEmployeeDetails`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accesstoken}`,
    },
    body: JSON.stringify({ str: encrypted }),
  });

  if (!res.ok) {
    throw new Error(`[DigiSME] GetEmployeeDetails failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  // Response is an array of employee objects
  return Array.isArray(data) ? data : (data.data || data.employees || []);
}
