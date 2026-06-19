/**
 * DigiSME → Supabase Employee Sync
 *
 * Fetches all active employees from DigiSME and upserts them into
 * the `profiles` table keyed by employee_code.
 *
 * Rules:
 *  - New employee in DigiSME but not in Supabase  → INSERT (no auth account yet, just the HR record)
 *  - Employee exists in both                       → UPDATE name/dept/designation
 *  - Employee active in Supabase but gone from DigiSME → mark is_active = false (via role change is not needed; we just log it)
 *
 * Designed to run once a day at 2 AM IST via /api/cron/sync-digisme.
 */

import { supabaseAdmin } from './supabase.js';
import { authenticate, getEmployeeDetails, COMPANY_ID } from './digisme.js';

export async function runDigiSmeSync(triggeredBy = 'cron') {
  const startedAt = new Date();
  let totalFetched = 0, addedCount = 0, updatedCount = 0, deactivatedCount = 0;
  let status = 'success';
  let errorMessage = null;

  try {
    console.log(`[DigiSmeSync] Starting sync (triggered_by=${triggeredBy})`);

    if (!COMPANY_ID) {
      throw new Error('DIGISME_COMPANY_ID not set in .env');
    }

    // ── Step 1: authenticate with DigiSME ──────────────────────────────────
    const { accesstoken, aesKey } = await authenticate();
    console.log('[DigiSmeSync] Authenticated with DigiSME');

    // ── Step 2: fetch all active employees ─────────────────────────────────
    const employees = await getEmployeeDetails({ accesstoken, aesKey, isActive: 1 });
    totalFetched = employees.length;
    console.log(`[DigiSmeSync] Fetched ${totalFetched} active employees`);

    if (totalFetched === 0) {
      console.warn('[DigiSmeSync] DigiSME returned 0 employees — skipping upsert to avoid wiping data');
      status = 'success';
    } else {
      // ── Step 3: load existing profiles that have an employee_code ──────────
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('profiles')
        .select('id, employee_code, full_name, department_name, designation_name')
        .not('employee_code', 'is', null);

      if (fetchErr) throw fetchErr;

      const existingMap = new Map((existing || []).map(p => [p.employee_code, p]));
      const fetchedCodes = new Set(employees.map(e => e.EmployeeCode).filter(Boolean));

      // ── Step 4: upsert each fetched employee ─────────────────────────────
      for (const emp of employees) {
        const code = emp.EmployeeCode;
        if (!code) continue;

        const payload = {
          employee_code:    code,
          full_name:        emp.EmployeeName        || null,
          department_name:  emp.DepartmentName      || null,
          designation_name: emp.DesignationName     || null,
          digisme_synced_at: new Date().toISOString(),
        };

        if (existingMap.has(code)) {
          // Update existing profile
          const profile = existingMap.get(code);
          const { error } = await supabaseAdmin
            .from('profiles')
            .update(payload)
            .eq('id', profile.id);
          if (error) {
            console.error(`[DigiSmeSync] Failed to update ${code}:`, error.message);
          } else {
            updatedCount++;
          }
        } else {
          // New employee: insert a profile row without an auth.users account.
          // They get a Supabase auth account only when they first log in via magic link.
          const { error } = await supabaseAdmin
            .from('profiles')
            .insert({ ...payload, role: 'staff' });
          if (error) {
            console.error(`[DigiSmeSync] Failed to insert ${code}:`, error.message);
          } else {
            addedCount++;
          }
        }
      }

      // ── Step 5: detect employees gone from DigiSME ───────────────────────
      // We don't delete them — just count so the log shows the drift.
      for (const [code] of existingMap) {
        if (!fetchedCodes.has(code)) {
          deactivatedCount++;
          console.log(`[DigiSmeSync] ${code} no longer in DigiSME active list`);
        }
      }
    }

    console.log(
      `[DigiSmeSync] Done — fetched=${totalFetched} added=${addedCount} ` +
      `updated=${updatedCount} gone=${deactivatedCount} ` +
      `duration=${Date.now() - startedAt.getTime()}ms`
    );

  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
    console.error('[DigiSmeSync] Sync failed:', err.message);
  }

  // ── Step 6: write audit log ───────────────────────────────────────────────
  const { error: logErr } = await supabaseAdmin
    .from('digisme_sync_logs')
    .insert({
      triggered_by:      triggeredBy,
      status,
      total_fetched:     totalFetched,
      added_count:       addedCount,
      updated_count:     updatedCount,
      deactivated_count: deactivatedCount,
      error_message:     errorMessage,
    });

  if (logErr) {
    console.error('[DigiSmeSync] Failed to write sync log:', logErr.message);
  }

  return { status, totalFetched, addedCount, updatedCount, deactivatedCount, errorMessage };
}
