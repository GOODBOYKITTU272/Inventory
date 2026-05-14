import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const updateSchema = z.object({
  current_stock: z.number().nonnegative().optional(),
  min_threshold: z.number().nonnegative().optional(),
  expiry_date: z.string().nullable().optional(),  // ISO date
  date_added:  z.string().nullable().optional(),
});

const dailyUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        current_stock: z.number().nonnegative(),
        expiry_date: z.string().optional().nullable(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

// GET /api/inventory — current status of every active product
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('v_inventory_status')
      .select('*')
      .order('category')
      .order('product_name');
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/inventory/alerts — items low / out / expiring soon / expired
router.get('/alerts', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('v_inventory_status')
      .select('*')
      .or('stock_status.in.(low,out_of_stock),expiry_status.in.(expiring_soon,expired)');
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// PATCH /api/inventory/:productId — update one product's inventory
router.patch(
  '/:productId',
  requireRole('facility_manager', 'leadership'),
  async (req, res, next) => {
    try {
      const payload = updateSchema.parse(req.body);
      const { data, error } = await supabaseAdmin
        .from('inventory')
        .update({ ...payload, last_updated_by: req.user.id })
        .eq('product_id', req.params.productId)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) { next(e); }
  },
);

// POST /api/inventory/daily-update — facility manager bulk morning update
// Compares submitted stock to current stock; logs a transaction for the delta.
router.post(
  '/daily-update',
  requireRole('facility_manager', 'leadership'),
  async (req, res, next) => {
    try {
      const { updates } = dailyUpdateSchema.parse(req.body);

      // 1. fetch current rows for diffing + product cost
      const ids = updates.map((u) => u.product_id);
      const { data: currentRows, error: fetchErr } = await supabaseAdmin
        .from('inventory')
        .select('product_id, current_stock, products(id, cost_per_unit)')
        .in('product_id', ids);
      if (fetchErr) throw fetchErr;

      const currentMap = new Map(currentRows.map((r) => [r.product_id, r]));
      const transactions = [];
      const inventoryUpdates = [];

      for (const u of updates) {
        const current = currentMap.get(u.product_id);
        if (!current) continue;
        const delta = Number(u.current_stock) - Number(current.current_stock);
        if (delta !== 0) {
          const isAdd = delta > 0;
          const unitCost = current.products?.cost_per_unit ?? 0;
          const qty = Math.abs(delta);
          transactions.push({
            product_id: u.product_id,
            type: isAdd ? 'add' : 'remove',
            quantity: qty,
            unit_cost: unitCost,
            total_cost: Number((qty * Number(unitCost)).toFixed(2)),
            facility_manager_id: req.user.id,
            notes: u.notes || (isAdd ? 'daily restock' : 'daily consumption'),
          });
        }

        inventoryUpdates.push({
          product_id: u.product_id,
          current_stock: u.current_stock,
          ...(u.expiry_date ? { expiry_date: u.expiry_date } : {}),
          last_updated_by: req.user.id,
        });
      }

      // 2. apply updates (one at a time — small dataset, simpler than upsert race conditions)
      for (const upd of inventoryUpdates) {
        const { product_id, ...rest } = upd;
        const { error } = await supabaseAdmin
          .from('inventory')
          .update(rest)
          .eq('product_id', product_id);
        if (error) throw error;
      }

      // 3. log transactions
      if (transactions.length) {
        const { error: txnErr } = await supabaseAdmin.from('transactions').insert(transactions);
        if (txnErr) throw txnErr;
      }

      res.json({
        ok: true,
        updated: inventoryUpdates.length,
        transactions_logged: transactions.length,
      });
    } catch (e) { next(e); }
  },
);

export default router;
