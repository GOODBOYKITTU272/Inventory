import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { fileCompletion, visionCompletion } from '../lib/openai.js';

const router = Router();

// Prevent same Telegram update from being processed twice
const recentUpdates = new Map();
function isDuplicate(updateId) {
  if (!updateId) return false;
  if (recentUpdates.has(updateId)) return true;
  recentUpdates.set(updateId, Date.now());
  setTimeout(() => recentUpdates.delete(updateId), 10 * 60 * 1000);
  return false;
}

const EXTRACTION_SYSTEM = `You are an Office Bill, Inventory, and Expense Extraction Assistant.
Extract only visible bill details. Do not guess missing values.
Return JSON only with vendor_name, bill_date, invoice_number, items, delivery_charges,
discount, grand_total, payment_status, confidence_score, needs_manual_review, and
manual_review_reason. Mark needs_manual_review true if any important value is unclear.

For each item, also add:
- "emoji": a single relevant emoji for the item (e.g. ☕ for coffee, 🍵 for tea, 🥛 for milk, 🍪 for biscuits, 🧹 for cleaning items, 🍋 for lemon, 🫖 for tea bags, 🍞 for bread, 🥜 for peanut butter, 🫙 for jam, 🧈 for butter, 🍫 for chocolate, 🥤 for juice, 💧 for water, 🧻 for tissue/napkins, 🧴 for soap/sanitizer, 📎 for stationery)
- "cafeteria_category": one of "beverage", "food", "snack", "cleaning", "stationery", "other" — classify based on what the item is`;

const DUPLICATE_MESSAGES = [
  'Bhai, ye bill pehle se system mein hai. Ek hi bill se do baar stock update nahi hoga.',
  'Waah, same bill dobara? System ne pakad liya. Duplicate blocked.',
  'Overacting ke 50 rupay kaat. Ye invoice already uploaded hai.',
  'Duplicate bill detected. Pantry stock ko double count nahi karne denge.',
];

function apiBase() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  return `https://api.telegram.org/bot${token}`;
}

function cleanJson(content) {
  return content.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function safeName(name = 'bill') {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
}

function isSupportedFile(fileName = '', mimeType = '') {
  return (
    /\.(pdf|jpe?g|png)$/i.test(fileName) ||
    ['application/pdf', 'image/jpeg', 'image/png'].includes(mimeType)
  );
}

function getTelegramFile(message) {
  if (message.document) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name || 'telegram-bill',
      mimeType: message.document.mime_type || '',
    };
  }

  if (message.photo?.length) {
    const photo = [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
    return {
      fileId: photo.file_id,
      fileName: `telegram-photo-${photo.file_unique_id || Date.now()}.jpg`,
      mimeType: 'image/jpeg',
    };
  }

  return null;
}

async function telegramRequest(method, body) {
  const res = await fetch(`${apiBase()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram ${method} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function sendTelegramMessage(chatId, text, replyToMessageId) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId,
  });
}

async function downloadTelegramFile(fileId) {
  const fileInfo = await telegramRequest('getFile', { file_id: fileId });
  const filePath = fileInfo?.result?.file_path;
  if (!filePath) throw new Error('Telegram did not return file_path');

  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram file download ${res.status}: ${text.slice(0, 200)}`);
  }

  const bytes = await res.arrayBuffer();
  return Buffer.from(bytes);
}

async function uploadFile({ buffer, fileName, mimeType }) {
  const path = `telegram/${Date.now()}-${safeName(fileName)}`;
  const { error } = await supabaseAdmin.storage
    .from('bills')
    .upload(path, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    });
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from('bills').getPublicUrl(path);
  return data.publicUrl;
}

async function findDuplicate(parsed) {
  if (!parsed?.invoice_number) return null;
  let q = supabaseAdmin
    .from('bill_uploads')
    .select('id, vendor_name, invoice_number, grand_total')
    .eq('invoice_number', parsed.invoice_number);

  if (parsed.vendor_name) q = q.ilike('vendor_name', parsed.vendor_name);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

async function saveBill({ parsed, fileUrl }) {
  // Auto-approve: bills from Telegram are auto-verified (only admins upload via Telegram)
  const { data: bill, error: billErr } = await supabaseAdmin
    .from('bill_uploads')
    .insert({
      vendor_name: parsed.vendor_name || null,
      bill_date: parsed.bill_date || null,
      invoice_number: parsed.invoice_number || null,
      uploaded_by_name: 'Telegram Bot',
      file_url: fileUrl,
      extraction_status: 'Extracted',
      verification_status: 'Admin Verified',
      approval_status: 'Auto-Approved',
      grand_total: normalizeNumber(parsed.grand_total),
      delivery_charges: normalizeNumber(parsed.delivery_charges) || 0,
      discount: normalizeNumber(parsed.discount) || 0,
      confidence_score: normalizeNumber(parsed.confidence_score),
      needs_manual_review: Boolean(parsed.needs_manual_review),
      manual_review_reason: parsed.manual_review_reason || null,
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (billErr) throw billErr;

  // Normalize item fields — AI may return different field names
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems.map((item) => ({
    item_name: item.item_name || item.name || item.product_name || item.product || 'Unknown',
    category: item.category || item.type || null,
    quantity: normalizeNumber(item.quantity || item.qty) || 0,
    unit: item.unit || item.uom || 'pcs',
    unit_rate: normalizeNumber(item.unit_rate || item.rate || item.price || item.unit_price),
    tax: normalizeNumber(item.tax || item.gst) || 0,
    total_amount: normalizeNumber(item.total_amount || item.total || item.amount),
    inventory_action: item.inventory_action || null,
    emoji: item.emoji || '📦',
    cafeteria_category: item.cafeteria_category || 'other',
  }));

  console.log('[Telegram] Normalized items:', JSON.stringify(items.map(i => ({ name: i.item_name, qty: i.quantity, emoji: i.emoji }))));

  if (items.length) {
    const rows = items.map((item) => ({
      bill_id: bill.id,
      item_name: item.item_name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unit_rate: item.unit_rate,
      tax: item.tax,
      total_amount: item.total_amount,
      inventory_action: item.inventory_action,
    }));

    const { error: itemsErr } = await supabaseAdmin.from('bill_items').insert(rows);
    if (itemsErr) throw itemsErr;
  }

  // ── Auto-sync: Update inventory + cafeteria items ──
  for (const item of items) {
    const qty = item.quantity;
    const itemName = item.item_name;
    const emoji = item.emoji;
    const cafeCat = item.cafeteria_category;

    // 1. Upsert into products table
    const { data: existingProduct } = await supabaseAdmin
      .from('products')
      .select('id')
      .ilike('name', itemName)
      .maybeSingle();

    let productId;
    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      const { data: newProduct } = await supabaseAdmin
        .from('products')
        .insert({
          name: itemName,
          category: item.category || 'Pantry',
          unit: item.unit || 'pcs',
        })
        .select('id')
        .single();
      productId = newProduct?.id;
    }

    // 2. Update inventory stock
    if (productId) {
      const { data: inv } = await supabaseAdmin
        .from('inventory')
        .select('current_stock')
        .eq('product_id', productId)
        .maybeSingle();

      if (inv) {
        await supabaseAdmin
          .from('inventory')
          .update({ current_stock: (inv.current_stock || 0) + qty })
          .eq('product_id', productId);
      } else {
        await supabaseAdmin
          .from('inventory')
          .insert({ product_id: productId, current_stock: qty });
      }

      // 3. Log transaction
      await supabaseAdmin.from('transactions').insert({
        product_id: productId,
        type: 'add',
        quantity: qty,
        unit_cost: normalizeNumber(item.unit_rate),
        total_cost: normalizeNumber(item.total_amount),
        notes: `Auto from Bill #${bill.invoice_number} (${bill.vendor_name})`,
      });
    }

    // 4. Upsert into cafeteria_items (for quick ordering on frontend)
    const { data: existingCafe } = await supabaseAdmin
      .from('cafeteria_items')
      .select('id, stock_today')
      .ilike('item_name', itemName)
      .maybeSingle();

    if (existingCafe) {
      // Add to existing stock
      const newStock = (existingCafe.stock_today || 0) + qty;
      await supabaseAdmin
        .from('cafeteria_items')
        .update({ stock_today: newStock, available: true })
        .eq('id', existingCafe.id);
    } else {
      // Create new cafeteria item
      await supabaseAdmin
        .from('cafeteria_items')
        .insert({
          item_name: itemName,
          emoji: emoji,
          category: cafeCat,
          available: true,
          stock_today: qty,
        });
    }
  }

  return { bill, itemCount: items.length, normalizedItems: items };
}

async function extractBill({ buffer, fileName, mimeType, fileUrl }) {
  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(fileName);
  if (isPdf) {
    return fileCompletion({
      system: EXTRACTION_SYSTEM,
      user: 'Extract the details from this PDF vendor bill.',
      fileBuffer: buffer,
      filename: fileName,
      mimeType: mimeType || 'application/pdf',
      model: 'gpt-4o',
    });
  }

  return visionCompletion({
    system: EXTRACTION_SYSTEM,
    user: 'Extract the details from this bill image.',
    imageUrl: fileUrl,
    model: 'gpt-4o',
  });
}

router.post('/', (req, res) => {
  const expectedKey = process.env.TELEGRAM_WEBHOOK_KEY || 'app_wizz_telegram_secret';
  if (req.query.key !== expectedKey) {
    return res.status(401).json({ ok: false, error: 'Invalid telegram webhook key' });
  }

  // Respond immediately so Telegram stops retrying
  res.json({ ok: true });

  // Skip if this update was already processed
  if (isDuplicate(req.body?.update_id)) return;

  const message = req.body?.message || req.body?.channel_post;
  const chatId = message?.chat?.id;
  const replyTo = message?.message_id;

  if (!message || !chatId) return;

  const file = getTelegramFile(message);
  if (!file || !isSupportedFile(file.fileName, file.mimeType)) return;

  // Process bill in background after responding
  (async () => {
    try {
      const buffer = await downloadTelegramFile(file.fileId);
      const fileUrl = await uploadFile({ buffer, fileName: file.fileName, mimeType: file.mimeType });
      const { content } = await extractBill({ ...file, buffer, fileUrl });
      const parsed = JSON.parse(cleanJson(content));

      const duplicate = await findDuplicate(parsed);
      if (duplicate) {
        const roast = DUPLICATE_MESSAGES[Math.floor(Math.random() * DUPLICATE_MESSAGES.length)];
        await sendTelegramMessage(
          chatId,
          `Duplicate Bill Detected\n\nVendor: ${duplicate.vendor_name || '-'}\nInvoice: #${duplicate.invoice_number || '-'}\nTotal: ₹${duplicate.grand_total || '-'}\n\n${roast}`,
          replyTo,
        );
        return;
      }

      const { bill, itemCount, normalizedItems } = await saveBill({ parsed, fileUrl });

      // Build items summary from normalized data
      const itemsList = (normalizedItems || [])
        .map(i => `  ${i.emoji} ${i.item_name} — ${i.quantity} ${i.unit}`)
        .join('\n');

      await sendTelegramMessage(
        chatId,
        `✅ Bill Auto-Approved & Inventory Updated!\n\n🏢 Vendor: ${bill.vendor_name || '-'}\n🧾 Invoice: #${bill.invoice_number || '-'}\n💰 Total: ₹${bill.grand_total || '-'}\n\n📦 ${itemCount} items added to stock:\n${itemsList}\n\n🟢 Status: Auto-Verified\n🔄 Cafeteria menu & inventory updated automatically!`,
        replyTo,
      );
    } catch (e) {
      await sendTelegramMessage(
        chatId,
        `Bill processing failed\n\n${e.message || 'Unknown error'}\n\nPlease upload a clear PDF, JPG, JPEG, or PNG bill.`,
        replyTo,
      ).catch(() => {});
    }
  })();
});

export default router;
