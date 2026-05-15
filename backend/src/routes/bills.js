import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { fileUrlCompletion, visionCompletion } from '../lib/openai.js';

const router = Router();

const EXTRACTION_SYSTEM = `You are an Office Bill, Inventory, and Expense Extraction Assistant.
Your job is to read vendor bills uploaded as images or PDFs and convert them into structured inventory and expense data.
The company buys office items from vendors such as HyperPure, JioMart, Amazon, Blinkit, BigBasket, and other suppliers.

Extract:
- vendor_name
- bill_date
- invoice_number
- uploaded_by
- items
- item_name
- category
- quantity
- unit
- unit_rate
- tax
- total_amount
- delivery_charges
- discount
- grand_total
- payment_status
- stock_update_summary
- expense_category
- confidence_score
- needs_manual_review
- manual_review_reason

Rules:
1. Extract only what is visible in the bill.
2. Do not guess rates or totals.
3. If a field is not visible, return null.
4. Categorize items as Pantry, Cleaning, Stationery, Maintenance, Electrical, Housekeeping, or Miscellaneous.
5. If the bill image is unclear, mark needs_manual_review as true.
6. If item totals do not match grand total, mark needs_manual_review as true.
7. If quantity or rate is missing, mark needs_manual_review as true.
8. Do not finalize inventory automatically.
9. Create stock update only as “Pending Admin Verification”.
10. Office Boy upload does not mean bill approval.
11. Admin must verify stock and bill details.
12. Accounts must approve payment.
13. Return JSON only.

JSON format:
{
  "vendor_name": "",
  "bill_date": "",
  "invoice_number": "",
  "uploaded_by": "Office Boy",
  "items": [
    {
      "item_name": "",
      "category": "",
      "quantity": "",
      "unit": "",
      "unit_rate": "",
      "tax": "",
      "total_amount": "",
      "inventory_action": ""
    }
  ],
  "delivery_charges": "",
  "discount": "",
  "grand_total": "",
  "payment_status": "",
  "stock_update_summary": [],
  "expense_category": "",
  "extraction_status": "Extracted",
  "verification_status": "Pending Admin Verification",
  "approval_status": "Pending Accounts Approval",
  "confidence_score": "",
  "needs_manual_review": false,
  "manual_review_reason": ""
}`;

// POST /api/bills/extract
// Body: { file_url: string }
router.post(
  '/extract',
  requireRole('office_boy', 'admin'),
  async (req, res, next) => {
    try {
      const { file_url } = req.body;
      if (!file_url) return res.status(400).json({ error: 'file_url required' });

      const isPdf = /\.pdf($|\?)/i.test(file_url);
      const { content, model } = isPdf
        ? await fileUrlCompletion({
            system: EXTRACTION_SYSTEM,
            user: 'Extract the details from this PDF vendor bill.',
            fileUrl: file_url,
            model: 'gpt-4o',
          })
        : await visionCompletion({
            system: EXTRACTION_SYSTEM,
            user: 'Extract the details from this bill image.',
            imageUrl: file_url,
          });

      let parsed;
      try {
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new Error(`Vision AI returned non-JSON: ${content.slice(0, 200)}`);
      }

      // 🛡️ Smart Duplicate Check
      const { data: existing } = await supabaseAdmin
        .from('bill_uploads')
        .select('id')
        .eq('invoice_number', parsed.invoice_number)
        .maybeSingle();

      const roasts = [
        `Bhai, ye bill pehle se hi system mein hai. Ek hi move do baar thodi chalti hai? Checkmate! ♟️❌`,
        `Waah! Ek hi bill do baar upload karke kya ameer hona chahte ho? 😂 System itna bhi bhole nahi hai.`,
        `Pantry hai bhai, Magic Show nahi. Ek bill se do baar stock nahi badhega. Duplicate blocked! 🥜🚫`,
        `Oho! Overacting ke 50 rupay kaat iske. Ye bill pehle hi add ho chuka hai! 🎭`,
        `Bhai, thoda dhyan se. Ye bill duplicate hai. System ko chess sikhane ki koshish mat karo! ♟️🤖`
      ];
      const randomRoast = roasts[Math.floor(Math.random() * roasts.length)] || "Bhai, duplicate bill hai. Kya kar raha hai?";

      if (existing) return res.status(200).json({ 
        ok: false,
        error: 'Duplicate Bill Detected', 
        message: `❌ Duplicate Bill Detected!\nVendor: ${parsed.vendor_name}\nInvoice: #${parsed.invoice_number}\n\n${randomRoast}`
      });

      // Save to DB
      const { data: bill, error: billErr } = await supabaseAdmin
        .from('bill_uploads')
        .insert({
          vendor_name: parsed.vendor_name,
          bill_date: parsed.bill_date,
          invoice_number: parsed.invoice_number,
          uploaded_by_user_id: req.user.id,
          uploaded_by_name: req.user.full_name || 'Office Boy',
          file_url: file_url,
          extraction_status: 'Extracted',
          verification_status: parsed.verification_status || 'Pending Admin Verification',
          approval_status: parsed.approval_status || 'Pending Accounts Approval',
          grand_total: parsed.grand_total,
          delivery_charges: parsed.delivery_charges || 0,
          discount: parsed.discount || 0,
          confidence_score: parsed.confidence_score,
          needs_manual_review: parsed.needs_manual_review,
          manual_review_reason: parsed.manual_review_reason,
        })
        .select()
        .single();

      if (billErr) throw billErr;

      if (parsed.items && parsed.items.length > 0) {
        const billItems = parsed.items.map(item => ({
          bill_id: bill.id,
          item_name: item.item_name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          unit_rate: item.unit_rate,
          tax: item.tax || 0,
          total_amount: item.total_amount,
          inventory_action: item.inventory_action,
        }));

        const { error: itemsErr } = await supabaseAdmin
          .from('bill_items')
          .insert(billItems);
        
        if (itemsErr) throw itemsErr;
      }

      res.json({
        ok: true,
        bill_id: bill.id,
        vendor_name: bill.vendor_name,
        invoice_number: bill.invoice_number,
        grand_total: bill.grand_total,
        message: `✅ Success! ${parsed.vendor_name} bill (Invoice #${parsed.invoice_number}) processed. Stock updated for ${parsed.items.length} items.`,
        parsed,
        model
      });

    } catch (e) {
      next(e);
    }
  }
);

// PATCH /api/bills/:id/status
router.patch(
  '/:id/status',
  requireRole('admin', 'leadership', 'finance'),
  async (req, res, next) => {
    try {
      const { verification_status, approval_status, notes } = req.body;
      
      // 1. Update the bill status
      const { data: bill, error: updateErr } = await supabaseAdmin
        .from('bill_uploads')
        .update({ 
          verification_status, 
          approval_status, 
          notes,
          verified_at: verification_status === 'Admin Verified' ? new Date().toISOString() : null
        })
        .eq('id', req.params.id)
        .select('*, bill_items(*)')
        .single();
      
      if (updateErr) throw updateErr;

      // 2. If Admin Verified, try to sync with inventory
      if (verification_status === 'Admin Verified') {
        const { data: products } = await supabaseAdmin.from('products').select('id, name');
        
        for (const item of bill.bill_items || []) {
          // Simple matching: look for item name in products
          // In a production app, we'd use OpenAI here to map "Assam Tea" to "Tea (Assam)"
          const match = products.find(p => 
            p.name.toLowerCase().includes(item.item_name.toLowerCase()) || 
            item.item_name.toLowerCase().includes(p.name.toLowerCase())
          );

          if (match) {
            // Update Inventory
            const { data: inv } = await supabaseAdmin
              .from('inventory')
              .select('current_stock')
              .eq('product_id', match.id)
              .single();
            
            const qty = parseFloat(item.quantity) || 0;
            const newStock = (inv?.current_stock || 0) + qty;

            await supabaseAdmin
              .from('inventory')
              .update({ 
                current_stock: newStock,
                last_updated_by: req.user.id 
              })
              .eq('product_id', match.id);

            // Log Transaction
            await supabaseAdmin.from('transactions').insert({
              product_id: match.id,
              type: 'add',
              quantity: qty,
              unit_cost: item.unit_rate,
              total_cost: item.total_amount,
              notes: `Auto-synced from Bill #${bill.invoice_number} (${bill.vendor_name})`,
              facility_manager_id: req.user.id
            });
          }
        }
      }

      res.json(bill);
    } catch (e) {
      next(e);
    }
  }
);

// GET /api/bills
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bill_uploads')
      .select('*, bill_items(*)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export default router;

