import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { fileCompletion, visionCompletion } from '../lib/openai.js';
import { postBillToTeams } from '../lib/teams.js';

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
Extract only visible bill details from the document. Do not guess missing values.
Return ONLY valid JSON (no markdown, no backticks) with this exact structure:

{
  "vendor_name": "string",
  "bill_date": "string",
  "invoice_number": "string",
  "items": [
    {
      "item_name": "product name as shown on bill",
      "quantity": number,
      "unit": "pcs/kg/ml/Count/etc",
      "unit_rate": number,
      "tax": number,
      "total_amount": number,
      "emoji": "single emoji like ☕🍵🥛🍪🧹🍋🫖🍞🥜🫙🧈🍫🥤💧🧻🧴📎🍓🍍",
      "cafeteria_category": "beverage|food|snack|cleaning|stationery|other"
    }
  ],
  "delivery_charges": number or null,
  "discount": number or null,
  "grand_total": number,
  "payment_status": "string or null",
  "confidence_score": number between 0 and 1,
  "needs_manual_review": boolean,
  "manual_review_reason": "string or null"
}

CRITICAL RULES:
- Every item MUST have "item_name" (never use "name" or "product")
- Every item MUST have "quantity" (never use "qty")
- Extract ALL line items from the bill, even if there are many
- Use the actual product name from the bill, never return "Unknown"
- Mark needs_manual_review true if any important value is unclear`;

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

// Strip brand names, weights, and pack sizes for customer-facing display
const KNOWN_BRANDS = ['mala\'s', 'malas', 'tata', 'amul', 'nescafe', 'bru', 'britannia', 'parle', 'haldiram', 'mdh', 'everest', 'dabur', 'patanjali', 'lipton', 'brooke bond', 'red label', 'society'];

function generateDisplayName(rawName) {
  if (!rawName) return null;
  let name = rawName.trim();
  // Remove leading brand + separator: "Mala's - Mix Fruit Jam" → "Mix Fruit Jam"
  for (const brand of KNOWN_BRANDS) {
    const re = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–—:]\\s*`, 'i');
    name = name.replace(re, '');
  }
  // Remove trailing weight/pack info: ", 4 Kg", "(Pack of 500)", "500g", "1 Kg"
  name = name.replace(/[,\s]*\d+(\.\d+)?\s*(kg|g|gm|gms|ml|l|ltr|litre|litres|pcs|pack|count)\b.*$/i, '');
  // Remove parenthetical info: "(Pack of 500)", "(250ml)"
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  // Clean up extra spaces and dashes
  name = name.replace(/\s*[-–—]\s*$/, '').replace(/\s+/g, ' ').trim();
  return name || rawName.trim();
}

function calculateServings(quantity, unit) {
  if (!quantity || quantity <= 0) return quantity || 0;
  const u = (unit || '').toLowerCase().trim();
  if (['kg', 'kgs'].includes(u)) return Math.round(quantity * 25);       // 40g per serving
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(u)) return Math.round(quantity / 40);
  if (['l', 'ltr', 'litre', 'litres', 'liter'].includes(u)) return Math.round(quantity * 20); // 50ml per serving
  if (['ml'].includes(u)) return Math.round(quantity / 50);
  // pcs, count, pack, or anything else → use as-is
  return quantity;
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

  // Match on invoice number only — vendor name can vary between AI extractions
  // Use ilike for case-insensitive + trim whitespace
  const invoiceNum = String(parsed.invoice_number).trim();
  if (!invoiceNum) return null;

  const { data, error } = await supabaseAdmin
    .from('bill_uploads')
    .select('id, vendor_name, invoice_number, grand_total')
    .eq('invoice_number', invoiceNum)
    .limit(1)
    .maybeSingle();

  if (error) {
    // If maybeSingle fails because multiple rows match, still treat as duplicate
    if (error.code === 'PGRST116') {
      const { data: first } = await supabaseAdmin
        .from('bill_uploads')
        .select('id, vendor_name, invoice_number, grand_total')
        .eq('invoice_number', invoiceNum)
        .limit(1)
        .single();
      return first;
    }
    throw error;
  }
  return data;
}

// Normalize date from any format (DD-MM-YYYY, DD/MM/YYYY, etc.) to YYYY-MM-DD
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // Already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // DD-MM-YYYY or DD/MM/YYYY
  const m = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // MM-DD-YYYY (unlikely for Indian bills but handle it)
  const m2 = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  // Try JS Date parse as last resort
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

async function saveBill({ parsed, fileUrl }) {
  // Auto-approve: bills from Telegram are auto-verified (only admins upload via Telegram)
  const { data: bill, error: billErr } = await supabaseAdmin
    .from('bill_uploads')
    .insert({
      vendor_name: parsed.vendor_name || null,
      bill_date: normalizeDate(parsed.bill_date),
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
    // Internal supplies (cleaning, stationery, other) are NOT orderable by employees
    const isOrderable = ['beverage', 'food', 'snack'].includes(cafeCat);
    const displayName = generateDisplayName(itemName);
    const servings = calculateServings(qty, item.unit);

    const { data: existingCafe } = await supabaseAdmin
      .from('cafeteria_items')
      .select('id, stock_today, stock_servings')
      .ilike('item_name', itemName)
      .maybeSingle();

    if (existingCafe) {
      // Add to existing stock
      const newStock = (existingCafe.stock_today || 0) + qty;
      const newServings = (existingCafe.stock_servings || 0) + servings;
      const update = { stock_today: newStock, stock_servings: newServings, available: true, orderable: isOrderable };
      if (!existingCafe.display_name) update.display_name = displayName;
      await supabaseAdmin
        .from('cafeteria_items')
        .update(update)
        .eq('id', existingCafe.id);
    } else {
      // Create new cafeteria item
      await supabaseAdmin
        .from('cafeteria_items')
        .insert({
          item_name: itemName,
          display_name: displayName,
          emoji: emoji,
          category: cafeCat,
          available: true,
          stock_today: qty,
          stock_servings: servings,
          orderable: isOrderable,
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
      user: 'Extract all details from this vendor bill PDF. List every single item with its item_name, quantity, unit_rate, tax, and total_amount. Return valid JSON only.',
      fileBuffer: buffer,
      filename: fileName,
      mimeType: mimeType || 'application/pdf',
      model: 'gpt-4o',
    });
  }

  return visionCompletion({
    system: EXTRACTION_SYSTEM,
    user: 'Extract all details from this bill image. List every single item with its item_name, quantity, unit_rate, tax, and total_amount. Return valid JSON only.',
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
      console.log('[Telegram] Raw AI response (first 500 chars):', content.slice(0, 500));
      const parsed = JSON.parse(cleanJson(content));
      console.log('[Telegram] Parsed items count:', parsed.items?.length, 'First item keys:', parsed.items?.[0] ? Object.keys(parsed.items[0]) : 'none');

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

      // Teams notification for bill upload
      postBillToTeams({
        vendor_name: bill.vendor_name,
        invoice_number: bill.invoice_number,
        grand_total: bill.grand_total,
        items_count: itemCount,
        uploaded_by: 'Telegram Bot',
      }).catch((e) => console.error('[Teams bill]', e.message));
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
