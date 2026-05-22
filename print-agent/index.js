/**
 * Applywizz Print Agent
 *
 * Standalone process that runs on any machine on the office LAN.
 * Listens to Supabase Realtime for order confirmations and auto-prints
 * receipts on the thermal printer (OCPP-88A, 80mm, ESC/POS via TCP).
 *
 * Usage:
 *   1. Copy .env.example → .env and fill in values
 *   2. npm install
 *   3. npm start (or use pm2: pm2 start index.js --name print-agent)
 */

import 'dotenv/config';
import net from 'node:net';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;
const PRINTER_IP    = process.env.PRINTER_IP || '192.168.1.100';
const PRINTER_PORT  = parseInt(process.env.PRINTER_PORT || '9100', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[print-agent] SUPABASE_URL and SUPABASE_ANON_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── ESC/POS Helpers ──────────────────────────────────────────────────────────
const ESC = '\x1B';
const GS  = '\x1D';

const CMD = {
  INIT:        `${ESC}\x40`,           // Initialize printer
  CENTER:      `${ESC}\x61\x01`,       // Center alignment
  LEFT:        `${ESC}\x61\x00`,       // Left alignment
  BOLD_ON:     `${ESC}\x45\x01`,       // Bold on
  BOLD_OFF:    `${ESC}\x45\x00`,       // Bold off
  DOUBLE_ON:   `${ESC}\x21\x30`,       // Double height+width
  DOUBLE_OFF:  `${ESC}\x21\x00`,       // Normal size
  FEED:        '\n',
  CUT:         `${GS}\x56\x00`,       // Full cut
  PARTIAL_CUT: `${GS}\x56\x01`,       // Partial cut
};

const LINE  = '================================';
const DASH  = '--------------------------------';
const WIDTH = 32; // usable chars for 80mm at default font

// ── Format Receipt ───────────────────────────────────────────────────────────
function formatReceipt(order) {
  const qty = parseInt(order.raw_text?.match(/^(\d+)x/)?.[1], 10) || 1;
  const item = order.parsed_item || order.raw_text || 'Unknown Item';
  const employee = order.parsed_employee_name || 'Unknown';
  const location = order.parsed_location || 'Not specified';
  const orderId = (order.id || '').slice(0, 8).toUpperCase();

  // Format date in IST
  const dateStr = new Date(order.created_at || Date.now()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Parse note from instruction (remove the prefix like "Jagan needs 1x ...")
  const noteMatch = order.instruction?.match(/Note:\s*(.+?)\.?$/i);
  const note = noteMatch?.[1] || '';

  const lines = [
    CMD.INIT,
    CMD.CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_ON,
    'APPLYWIZZ',
    CMD.DOUBLE_OFF,
    'OFFICE PANTRY',
    CMD.BOLD_OFF,
    CMD.FEED,
    LINE,
    CMD.LEFT,
    `Order  #${orderId}`,
    `Date   ${dateStr}`,
    DASH,
    `${CMD.BOLD_ON}Employee${CMD.BOLD_OFF}  ${employee}`,
    `${CMD.BOLD_ON}Location${CMD.BOLD_OFF}  ${location}`,
    DASH,
    CMD.BOLD_ON,
    `  ${qty}x ${item}`,
    CMD.BOLD_OFF,
  ];

  if (note) {
    lines.push(`  Note: ${note}`);
  }

  lines.push(
    DASH,
    CMD.CENTER,
    CMD.BOLD_ON,
    'DELIVER ASAP!',
    CMD.BOLD_OFF,
    LINE,
    CMD.FEED,
    CMD.FEED,
    CMD.FEED,
    CMD.PARTIAL_CUT,
  );

  return lines.join('\n');
}

// ── Print an order receipt ────────────────────────────────────────────────────
function printReceipt(order) {
  const receipt = formatReceipt(order);
  const orderId = (order.id || '').slice(0, 8);
  return sendToPrinter(receipt, `order-#${orderId}`);
}

// ── Meal Receipt Format ──────────────────────────────────────────────────────
function formatMealReceipt(booking, profile) {
  const choiceLabel = { veg: 'VEG', non_veg: 'NON-VEG', egg: 'EGG', skip: 'SKIP' };
  const choiceEmoji = { veg: '[V]', non_veg: '[NV]', egg: '[E]', skip: '[S]' };
  const name = profile?.preferred_name || profile?.full_name || 'Employee';
  const code = profile?.employee_code || '--';
  const mealDate = new Date(booking.meal_date + 'T00:00:00+05:30');
  const dateStr = mealDate.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const lines = [
    CMD.INIT,
    CMD.CENTER,
    CMD.BOLD_ON,
    CMD.DOUBLE_ON,
    'MEAL BOOKING',
    CMD.DOUBLE_OFF,
    CMD.BOLD_OFF,
    CMD.FEED,
    LINE,
    CMD.LEFT,
    `Date     ${dateStr}`,
    DASH,
    CMD.BOLD_ON,
    `${choiceEmoji[booking.choice] || ''} ${choiceLabel[booking.choice] || booking.choice}`,
    CMD.BOLD_OFF,
    DASH,
    `Name     ${name}`,
    `Code     ${code}`,
    DASH,
    CMD.CENTER,
    `Booked at ${new Date(booking.booked_at || Date.now()).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    })}`,
    LINE,
    CMD.FEED,
    CMD.FEED,
    CMD.PARTIAL_CUT,
  ];

  return lines.join('\n');
}

// ── Send any content to printer ──────────────────────────────────────────────
function sendToPrinter(content, label, retries = 1) {
  return new Promise((resolve, reject) => {
    console.log(`[print-agent] Printing ${label} → ${PRINTER_IP}:${PRINTER_PORT}`);

    const socket = net.createConnection(PRINTER_PORT, PRINTER_IP, () => {
      socket.write(content, 'binary', () => {
        socket.end();
        console.log(`[print-agent] ✅ Printed ${label}`);
        resolve();
      });
    });

    socket.setTimeout(5000);

    socket.on('timeout', () => {
      socket.destroy();
      if (retries > 0) {
        console.log(`[print-agent] ⏱ Timeout, retrying ${label} in 2s...`);
        setTimeout(() => sendToPrinter(content, label, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(new Error('Printer connection timeout'));
      }
    });

    socket.on('error', (err) => {
      if (retries > 0) {
        console.log(`[print-agent] ⚠ Error: ${err.message}, retrying ${label} in 2s...`);
        setTimeout(() => sendToPrinter(content, label, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        console.error(`[print-agent] ❌ Print failed for ${label}:`, err.message);
        reject(err);
      }
    });
  });
}

// ── Supabase Realtime Subscription ───────────────────────────────────────────
function startListening() {
  console.log('[print-agent] Subscribing to order confirmations + meal bookings...');

  const channel = supabase
    .channel('print-all')
    // ── Order confirmations ──
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'requests',
      },
      async (payload) => {
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;

        // Only print when order transitions from confirming → pending
        if (oldStatus === 'confirming' && newStatus === 'pending') {
          const order = payload.new;
          console.log(`[print-agent] 🔔 Order confirmed: #${(order.id || '').slice(0, 8)} — ${order.parsed_item}`);

          try {
            await printReceipt(order);
          } catch (err) {
            console.error(`[print-agent] Failed to print after retries:`, err.message);
          }
        }
      }
    )
    // ── Meal bookings (INSERT or UPDATE) ──
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'meal_bookings',
      },
      async (payload) => {
        const booking = payload.new;
        if (!booking || booking.choice === 'skip') return; // Don't print skips

        console.log(`[print-agent] 🍱 Meal booked: ${booking.choice} for ${booking.meal_date}`);

        // Fetch employee profile for name + code
        let profile = null;
        try {
          const { data } = await supabase
            .from('profiles')
            .select('full_name, preferred_name, employee_code')
            .eq('id', booking.user_id)
            .maybeSingle();
          profile = data;
        } catch (_) {}

        try {
          const receipt = formatMealReceipt(booking, profile);
          await sendToPrinter(receipt, `meal-${booking.meal_date}-${(booking.user_id || '').slice(0, 6)}`);
        } catch (err) {
          console.error(`[print-agent] Failed to print meal receipt:`, err.message);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[print-agent] Realtime status: ${status}`);
    });

  return channel;
}

// ── Auto-confirm stuck orders (safety net) ───────────────────────────────────
// If frontend fails to call /confirm, orders stuck in 'confirming' > 60s
// should be auto-confirmed. This runs every 30s.
async function autoConfirmStuck() {
  try {
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from('requests')
      .select('id, created_at')
      .eq('status', 'confirming')
      .lt('created_at', cutoff)
      .limit(10);

    if (stuck?.length) {
      console.log(`[print-agent] Found ${stuck.length} stuck confirming orders, auto-confirming...`);
      for (const order of stuck) {
        await supabase
          .from('requests')
          .update({ status: 'pending', live_status: 'placed' })
          .eq('id', order.id)
          .eq('status', 'confirming'); // double-check to avoid race
        console.log(`[print-agent] Auto-confirmed #${order.id.slice(0, 8)}`);
      }
    }
  } catch (err) {
    console.error('[print-agent] Auto-confirm check failed:', err.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const channel = startListening();

// Heartbeat + stuck order check
setInterval(() => {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`[print-agent] ♥ Heartbeat — ${now} — printer: ${PRINTER_IP}:${PRINTER_PORT}`);
  autoConfirmStuck();
}, 60_000);

console.log(`[print-agent] 🖨 Ready — Listening for orders, printing to ${PRINTER_IP}:${PRINTER_PORT}`);

// Graceful shutdown
function shutdown() {
  console.log('\n[print-agent] Shutting down...');
  supabase.removeChannel(channel);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
