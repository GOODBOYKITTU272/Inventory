import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  Eye, 
  CheckCircle, 
  XCircle, 
  FileText,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function BillApproval() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    try {
      const data = await api.listBills();
      setBills(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateBillStatus(billId, vStatus, aStatus) {
    setBusy(true);
    try {
      await api.updateBillStatus(billId, { 
        verification_status: vStatus, 
        approval_status: aStatus 
      });
      await loadBills();
      setSelectedBill(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading bills for approval...</div>;

  const pendingCount = bills.filter(b => b.verification_status === 'Pending Admin Verification').length;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Bill Approvals</h1>
          <p className="text-slate-500">Verify extracted data and approve vendor payments.</p>
        </div>
        <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-xl text-sm font-bold border border-amber-200 shrink-0">
          {pendingCount} Pending
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Bill List */}
        <div className="xl:col-span-1 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Queue</h2>
          <div className="space-y-3">
            {bills.map((bill) => (
              <button
                key={bill.id}
                onClick={() => setSelectedBill(bill)}
                className={`
                  w-full text-left card p-4 transition-all hover:translate-x-1
                  ${selectedBill?.id === bill.id ? 'ring-2 ring-brand bg-brand/5 border-brand' : 'hover:border-brand/40'}
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-slate-900">{bill.vendor_name || 'Processing...'}</div>
                  <div className="text-sm font-bold text-brand">₹{bill.grand_total}</div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                  <FileText size={12} /> {bill.invoice_number || 'No Invoice #'}
                  <span>•</span>
                  <span>{new Date(bill.created_at).toLocaleDateString()}</span>
                </div>
                <div className={`mt-3 text-[10px] font-bold uppercase inline-block px-2 py-0.5 rounded-md ${
                  bill.verification_status === 'Admin Verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {bill.verification_status}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail View */}
        <div className="xl:col-span-2">
          <AnimatePresence mode="wait">
            {selectedBill ? (
              <motion.div 
                key={selectedBill.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="card p-0 overflow-hidden sticky top-6"
              >
                <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">{selectedBill.vendor_name}</h3>
                    <p className="text-xs text-slate-500">Uploaded by {selectedBill.uploaded_by_name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary text-rose-600 border-rose-100 hover:bg-rose-50 text-sm"
                      onClick={() => updateBillStatus(selectedBill.id, 'Rejected', 'Rejected')}
                      disabled={busy}
                    >
                      <XCircle size={16} /> Reject
                    </button>
                    <button
                      className="btn-primary text-sm"
                      onClick={() => updateBillStatus(selectedBill.id, 'Admin Verified', 'Pending Accounts Approval')}
                      disabled={busy}
                    >
                      <CheckCircle size={16} /> Approve
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2">
                  {/* Image Preview */}
                  <div className="p-6 bg-slate-900 flex items-center justify-center min-h-[400px]">
                    <img 
                      src={selectedBill.file_url} 
                      className="max-w-full rounded shadow-2xl cursor-zoom-in"
                      alt="Invoice"
                    />
                  </div>

                  {/* Extracted Data */}
                  <div className="p-6 space-y-6 overflow-y-auto max-h-[700px]">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Extracted Items</h4>
                      <div className="space-y-3">
                        {selectedBill.bill_items?.map((item, idx) => (
                          <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="font-bold text-sm text-slate-800">{item.item_name}</div>
                            <div className="flex justify-between text-xs mt-1 text-slate-500">
                              <span>{item.quantity} {item.unit} x ₹{item.unit_rate}</span>
                              <span className="font-bold text-slate-900">₹{item.total_amount}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Subtotal</span>
                        <span className="font-medium">₹{selectedBill.grand_total - selectedBill.delivery_charges + selectedBill.discount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Delivery</span>
                        <span className="font-medium text-rose-600">+ ₹{selectedBill.delivery_charges}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Discount</span>
                        <span className="font-medium text-emerald-600">- ₹{selectedBill.discount}</span>
                      </div>
                      <div className="flex justify-between text-xl font-bold pt-2 border-t border-slate-100">
                        <span>Grand Total</span>
                        <span className="text-brand">₹{selectedBill.grand_total}</span>
                      </div>
                    </div>

                    {selectedBill.needs_manual_review && (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800 italic text-sm">
                        <AlertTriangle size={20} className="shrink-0" />
                        AI Flag: {selectedBill.manual_review_reason || 'Image clarity is low. Please double check quantities.'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[500px] border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 space-y-4">
                <ShieldCheck size={64} className="opacity-20" />
                <div className="font-medium">Select a bill from the queue to verify</div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
