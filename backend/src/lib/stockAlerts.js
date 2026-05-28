async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[StockAlerts] Telegram send failed: ${res.status} - ${txt}`);
    }
  } catch (e) {
    console.error(`[StockAlerts] Telegram fetch exception:`, e.message);
  }
}

export async function checkAndNotifyLowStock(supabaseAdmin, botToken) {
  if (!botToken) return;

  // 1. Fetch active items with thresholds
  const { data: statusRows, error: fetchErr } = await supabaseAdmin
    .from('v_inventory_status')
    .select('product_id, product_name, current_stock, min_threshold, unit')
    .gt('min_threshold', 0);

  if (fetchErr || !statusRows) return;

  // 2. Fetch recent transactions of type 'remove' to calculate actual daily consumption
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: txns } = await supabaseAdmin
    .from('transactions')
    .select('product_id, quantity, occurred_at')
    .eq('type', 'remove')
    .gte('occurred_at', sevenDaysAgo);

  // Group by product and calculate total consumption in last 7 days
  const txnConsumptionMap = new Map();
  if (txns) {
    for (const t of txns) {
      const q = Number(t.quantity || 0);
      txnConsumptionMap.set(t.product_id, (txnConsumptionMap.get(t.product_id) || 0) + q);
    }
  }

  // Helper to determine daily consumption
  const getDailyConsumption = (productId, name) => {
    const n = name.toLowerCase();
    const totalRemoved = txnConsumptionMap.get(productId) || 0;
    if (totalRemoved > 0) {
      return totalRemoved / 5; // Average over 5 working days
    }
    
    // Fallbacks
    if (n.includes('coffee beans') || n.includes('coffee')) return 0.6; // 600g (in kg)
    if (n.includes('milk')) return 4.0; // 4 liters
    if (n.includes('bread') || n.includes('brd')) return 1.5; // 1.5 packets
    return 1.0; // default 1 unit/day
  };

  // Determine current shift and expected next shift demand
  const today = new Date();
  const options = { timeZone: 'Asia/Kolkata' };
  const istDate = new Date(today.toLocaleString('en-US', options));
  const istHour = istDate.getHours();

  // 5 AM to 5 PM -> next shift is Night Shift (starts 8:00 PM)
  // 5 PM to 5 AM -> next shift is Morning Shift (starts 8:30 AM)
  const isNextNight = istHour >= 5 && istHour < 17;
  const nextShiftName = isNextNight ? 'Night' : 'Morning';
  const nextShiftStart = isNextNight ? '8:00 PM' : '8:30 AM';
  const nextShiftFactor = isNextNight ? 0.22 : 0.78; // 20/90 or 70/90

  // 3. Fetch Leadership Chat IDs
  const { data: mappings } = await supabaseAdmin
    .from('telegram_user_map')
    .select('telegram_chat_id, profiles!inner(role)')
    .eq('profiles.role', 'leadership');

  const chatIds = mappings?.map(m => m.telegram_chat_id).filter(Boolean) || [];
  if (chatIds.length === 0) return;

  // 4. Process each item
  for (const item of statusRows) {
    const dailyUsage = getDailyConsumption(item.product_id, item.product_name);
    const expectedShiftUsage = dailyUsage * nextShiftFactor;
    const stockVal = Number(item.current_stock);
    const minVal = Number(item.min_threshold);

    const isBelowHalf = stockVal <= (minVal / 2);
    const isBelowNextShift = stockVal < expectedShiftUsage;

    // Check if alert conditions met
    if (!isBelowHalf && !isBelowNextShift) continue;

    const alertTitle = `Low Stock: ${item.product_name}`;
    const cutoff = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(); // 10-hour cooldown

    // Check last 10h alert
    const { data: recentAlert } = await supabaseAdmin
      .from('notification_logs')
      .select('id, sent_at')
      .eq('notification_type', 'low_stock_alert')
      .eq('title', alertTitle)
      .gte('sent_at', cutoff)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let shouldAlert = true;
    if (recentAlert) {
      // Check if a restock happened since the last alert
      const { data: latestRestock } = await supabaseAdmin
        .from('transactions')
        .select('occurred_at')
        .eq('product_id', item.product_id)
        .eq('type', 'add')
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestRestock || new Date(latestRestock.occurred_at) <= new Date(recentAlert.sent_at)) {
        shouldAlert = false; // Cooldown active
      }
    }

    if (shouldAlert) {
      const daysLeft = dailyUsage > 0 ? (stockVal / dailyUsage).toFixed(1) : 'unknown';

      // Format usage labels
      let usageDetail = `${dailyUsage} ${item.unit || 'units'}/day`;
      if (item.product_name.toLowerCase().includes('coffee beans') || item.product_name.toLowerCase().includes('coffee')) {
        usageDetail = `${Math.round(dailyUsage * 1000)}g/day (approx ${Math.round(dailyUsage * 140)} cups)`;
      } else if (item.product_name.toLowerCase().includes('milk')) {
        usageDetail = `${dailyUsage}L/day (approx ${Math.round(dailyUsage * 5)} servings)`;
      }

      let header = `⚠️ *Low Stock Alert*`;
      let reasonText = `📦 *${item.product_name}* is going less than ${minVal / 2} ${item.unit || 'units'}.`;
      
      if (isBelowNextShift && !isBelowHalf) {
        header = `⚠️ *Upcoming Shift Warning*`;
        reasonText = `📦 *${item.product_name}* stock (${stockVal} ${item.unit}) is insufficient for the upcoming *${nextShiftName} Shift* (starts at ${nextShiftStart}) which expects to consume *${expectedShiftUsage.toFixed(1)} ${item.unit}*.`;
      } else if (isBelowNextShift && isBelowHalf) {
        reasonText += ` Additionally, stock is insufficient for the upcoming *${nextShiftName} Shift* (needs *${expectedShiftUsage.toFixed(1)} ${item.unit}*).`;
      }

      const msg = `${header}\n` +
                  `${reasonText}\n\n` +
                  `*Current stock:* ${stockVal} ${item.unit || 'units'}\n` +
                  `*Daily usage:* ${usageDetail}\n` +
                  `*Estimated remaining time:* ${daysLeft} days\n\n` +
                  `👉 *Please order more soon!*`;

      // Dispatch to all leadership chat ids
      await Promise.allSettled(chatIds.map(cid => sendTelegramMessage(botToken, cid, msg)));

      // Log notification
      await supabaseAdmin.from('notification_logs').insert({
        notification_type: 'low_stock_alert',
        title: alertTitle,
        message: `Current stock: ${item.current_stock} ${item.unit}. Est remaining time: ${daysLeft} days`,
        sent_at: new Date().toISOString()
      });
    }
  }
}
