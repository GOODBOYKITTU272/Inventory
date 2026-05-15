import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { fileCompletion, visionCompletion } from '../lib/openai.js';

const router = Router();

const EXTRACTION_SYSTEM = `You are an Office Bill, Inventory, and Expense Extraction Assistant.
Extract only visible bill details. Do not guess missing values.
Return JSON only with vendor_name, bill_date, invoice_number, items, delivery_charges,
discount, grand_total, payment_status, confidence_score, needs_manual_review, and
manual_review_reason. Mark needs_manual_review true if any important value is unclear.`;

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
  const { data: bill, error: billErr } = await supabaseAdmin
    .from('bill_uploads')
    .insert({
      vendor_name: parsed.vendor_name || null,
      bill_date: parsed.bill_date || null,
      invoice_number: parsed.invoice_number || null,
      uploaded_by_name: 'Telegram Bot',
      file_url: fileUrl,
      extraction_status: parsed.extraction_status || 'Extracted',
      verification_status: parsed.verification_status || 'Pending Admin Verification',
      approval_status: parsed.approval_status || 'Pending Accounts Approval',
      grand_total: normalizeNumber(parsed.grand_total),
      delivery_charges: normalizeNumber(parsed.delivery_charges) || 0,
      discount: normalizeNumber(parsed.discount) || 0,
      confidence_score: normalizeNumber(parsed.confidence_score),
      needs_manual_review: Boolean(parsed.needs_manual_review),
      manual_review_reason: parsed.manual_review_reason || null,
    })
    .select()
    .single();

  if (billErr) throw billErr;

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length) {
    const rows = items.map((item) => ({
      bill_id: bill.id,
      item_name: item.item_name || 'Unknown item',
      category: item.category || null,
      quantity: normalizeNumber(item.quantity) || 0,
      unit: item.unit || null,
      unit_rate: normalizeNumber(item.unit_rate),
      tax: normalizeNumber(item.tax) || 0,
      total_amount: normalizeNumber(item.total_amount),
      inventory_action: item.inventory_action || null,
    }));

    const { error: itemsErr } = await supabaseAdmin.from('bill_items').insert(rows);
    if (itemsErr) throw itemsErr;
  }

  return bill;
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

router.post('/', async (req, res, next) => {
  const message = req.body?.message || req.body?.channel_post;
  const chatId = message?.chat?.id;
  const replyTo = message?.message_id;

  try {
    const expectedKey = process.env.TELEGRAM_WEBHOOK_KEY || 'app_wizz_telegram_secret';
    if (req.query.key !== expectedKey) {
      return res.status(401).json({ ok: false, error: 'Invalid telegram webhook key' });
    }

    if (!message || !chatId) return res.json({ ok: true, ignored: true });

    const file = getTelegramFile(message);
    if (!file) return res.json({ ok: true, ignored: true, reason: 'no_file' });

    if (!isSupportedFile(file.fileName, file.mimeType)) {
      return res.json({ ok: true, ignored: true, reason: 'unsupported_file' });
    }

    const buffer = await downloadTelegramFile(file.fileId);
    const fileUrl = await uploadFile({ buffer, fileName: file.fileName, mimeType: file.mimeType });
    const { content, model } = await extractBill({ ...file, buffer, fileUrl });
    const parsed = JSON.parse(cleanJson(content));

    const duplicate = await findDuplicate(parsed);
    if (duplicate) {
      const roast = DUPLICATE_MESSAGES[Math.floor(Math.random() * DUPLICATE_MESSAGES.length)];
      await sendTelegramMessage(
        chatId,
        `Duplicate Bill Detected\n\nVendor: ${duplicate.vendor_name || '-'}\nInvoice: #${duplicate.invoice_number || '-'}\nTotal: ₹${duplicate.grand_total || '-'}\n\n${roast}`,
        replyTo,
      );
      return res.json({ ok: true, duplicate: true, duplicate_bill_id: duplicate.id });
    }

    const bill = await saveBill({ parsed, fileUrl });
    await sendTelegramMessage(
      chatId,
      `Bill processed successfully\n\nVendor: ${bill.vendor_name || '-'}\nInvoice: #${bill.invoice_number || '-'}\nTotal: ₹${bill.grand_total || '-'}\n\nStatus: Sent for Admin Verification\nInventory will update only after Admin verification.`,
      replyTo,
    );

    return res.json({ ok: true, bill_id: bill.id, model });
  } catch (e) {
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `Bill processing failed\n\n${e.message || 'Unknown error'}\n\nPlease upload a clear PDF, JPG, JPEG, or PNG bill.`,
        replyTo,
      ).catch(() => {});
    }
    next(e);
  }
});

export default router;
