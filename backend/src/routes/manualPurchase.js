/**
 * Manual Purchase API — Review, approve, reject, clarify, sync
 * for no-invoice purchases submitted via Telegram.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// ── GET / — List all manual purchases ────────────────────────────────────────
// Finance + Leadership see all. FM sees all. Office Boy sees own only.
// Query params: ?status=pending_review&limit=50&offset=0
router.get('/',
  requireRole('finance', 'leadership', 'facility_manager', 'office_boy'),
  async (req, res, next) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      let query = supabaseAdmin
        .from('manual_purchases')
        .select('*')
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      // Office boy: only own
      if (req.user.role === 'office_boy') {
        query = query.eq('sender_user_id', req.user.id);
      }

      // Optional status filter
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;

      res.json({ purchases: data || [], count: data?.length || 0 });
    } catch (e) { next(e); }
  }
);

// ── GET /:id — Get single purchase ───────────────────────────────────────────
router.get('/:id',
  requireRole('finance', 'leadership', 'facility_manager', 'office_boy'),
  async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('manual_purchases')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Purchase not found' });

      // Office boy can only see own
      if (req.user.role === 'office_boy' && data.sender_user_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only view your own submissions' });
      }

      res.json(data);
    } catch (e) { next(e); }
  }
);

// ── POST /:id/approve — Approve a purchase ───────────────────────────────────
router.post('/:id/approve',
  requireRole('finance', 'leadership'),
  async (req, res, next) => {
    try {
      const { data: purchase, error: fetchErr } = await supabaseAdmin
        .from('manual_purchases')
        .select('id, status')
        .eq('id', req.params.id)
        .single();

      if (fetchErr) throw fetchErr;
      if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

      if (purchase.status === 'approved' || purchase.status === 'synced_to_inventory') {
        return res.status(400).json({ error: 'Already approved' });
      }

      const { error } = await supabaseAdmin
        .from('manual_purchases')
        .update({
          status: 'approved',
          approved_by: req.user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id);

      if (error) throw error;

      console.log(`[ManualPurchase] Approved #${req.params.id.slice(0, 8)} by ${req.user.full_name}`);
      res.json({ ok: true, status: 'approved' });
    } catch (e) { next(e); }
  }
);

// ── POST /:id/reject — Reject a purchase ─────────────────────────────────────
router.post('/:id/reject',
  requireRole('finance', 'leadership'),
  async (req, res, next) => {
    try {
      const { reason } = req.body;

      const { error } = await supabaseAdmin
        .from('manual_purchases')
        .update({
          status: 'rejected',
          rejection_reason: reason || 'Rejected by reviewer',
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id);

      if (error) throw error;

      console.log(`[ManualPurchase] Rejected #${req.params.id.slice(0, 8)} by ${req.user.full_name}`);
      res.json({ ok: true, status: 'rejected' });
    } catch (e) { next(e); }
  }
);

// ── POST /:id/clarify — Ask a clarification question ─────────────────────────
router.post('/:id/clarify',
  requireRole('finance', 'leadership', 'facility_manager'),
  async (req, res, next) => {
    try {
      const { question } = req.body;
      if (!question) return res.status(400).json({ error: 'question is required' });

      const { data: purchase, error: fetchErr } = await supabaseAdmin
        .from('manual_purchases')
        .select('id, telegram_chat_id, status')
        .eq('id', req.params.id)
        .single();

      if (fetchErr) throw fetchErr;
      if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

      // Update purchase with question
      const { error } = await supabaseAdmin
        .from('manual_purchases')
        .update({
          clarification_question: question,
          status: 'draft_needs_clarification',
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id);

      if (error) throw error;

      // Send Telegram message if chat_id exists
      if (purchase.telegram_chat_id) {
        try {
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: purchase.telegram_chat_id,
                text: `⚠️ Clarification needed for your purchase:\n\n${question}\n\nPlease reply to this message with your answer.`,
              }),
            });
          }
        } catch (tgErr) {
          console.error('[ManualPurchase] Telegram clarify send failed:', tgErr.message);
        }
      }

      console.log(`[ManualPurchase] Clarification asked for #${req.params.id.slice(0, 8)} by ${req.user.full_name}`);
      res.json({ ok: true, status: 'draft_needs_clarification' });
    } catch (e) { next(e); }
  }
);

// ── POST /:id/sync — Sync approved purchase to inventory + finance ───────────
router.post('/:id/sync',
  requireRole('finance', 'leadership'),
  async (req, res, next) => {
    try {
      const { data: purchase, error: fetchErr } = await supabaseAdmin
        .from('manual_purchases')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (fetchErr) throw fetchErr;
      if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

      if (!['approved', 'auto_approved'].includes(purchase.status)) {
        return res.status(400).json({ error: 'Purchase must be approved before syncing' });
      }

      if (purchase.synced_to_inventory && purchase.synced_to_finance) {
        return res.status(400).json({ error: 'Already synced' });
      }

      const itemName = purchase.item_name || 'Unknown Item';
      const qty = Number(purchase.quantity) || 1;
      const amount = Number(purchase.amount) || 0;

      // 1. Find or create product
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
            category: purchase.category || 'Pantry',
            unit: purchase.unit || 'pcs',
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

        // 3. Log transaction (finance record)
        await supabaseAdmin.from('transactions').insert({
          product_id: productId,
          type: 'add',
          quantity: qty,
          unit_cost: amount / qty,
          total_cost: amount,
          notes: `Manual purchase — ${purchase.vendor_name || 'Local Shop'} — ${purchase.payment_method || 'Cash'} — No invoice`,
        });
      }

      // 4. Mark as synced
      const { error: updateErr } = await supabaseAdmin
        .from('manual_purchases')
        .update({
          synced_to_inventory: true,
          synced_to_finance: true,
          synced_at: new Date().toISOString(),
          status: 'synced_to_inventory',
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id);

      if (updateErr) throw updateErr;

      console.log(`[ManualPurchase] Synced #${req.params.id.slice(0, 8)} — ${itemName} x${qty} — by ${req.user.full_name}`);
      res.json({ ok: true, status: 'synced_to_inventory', productId });
    } catch (e) { next(e); }
  }
);

export default router;
