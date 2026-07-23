import { formatRupiah } from './format';

const PAY_LABEL: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };

export type ReceiptOrder = {
  id: string;
  items: { product_name: string; variant_summary: string | null; price: number; qty: number; notes: string | null }[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: 'cash' | 'qris' | 'transfer';
  cash_received: number | null;
  change_amount: number | null;
  cashier_name: string;
  customer_name: string | null;
  table_number: string | null;
  created_at: string;
};

export type ReceiptStore = { name: string; address: string | null; phone: string | null };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const receiptNo = (o: ReceiptOrder) => `#${o.id.slice(0, 8).toUpperCase()}`;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const RECEIPT_STYLE = `
    * { box-sizing: border-box; }
    body { width: 58mm; margin: 0; font: 10px/1.5 -apple-system, 'Segoe UI', sans-serif; color: #1A1A1A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .header { background: linear-gradient(135deg, #6e150f 0%, #b92a1c 100%); padding: 12px 10px; text-align: center; color: #fff; }
    .sname { font-weight: 800; font-size: 14px; letter-spacing: 0.3px; margin: 0; }
    .saddr { font-size: 8px; color: rgba(255,255,255,0.85); margin-top: 3px; line-height: 1.4; }
    .infoblock { padding: 8px 10px 5px; background: #FFF8F7; border-bottom: 1px dashed #d0a139; }
    .info { font-size: 9px; color: #555; margin-top: 2px; }
    .info b { color: #6e150f; }
    .items { padding: 8px 10px; }
    .item { margin-bottom: 7px; }
    .iname { font-size: 11px; flex: 1; }
    .isub { font-size: 11px; color: #6e150f; white-space: nowrap; }
    .qty { font-size: 9px; color: #666; }
    .variant { font-size: 10px; font-weight: 700; color: #6e150f; margin: 1px 0; }
    .note { font-size: 8px; color: #b92a1c; font-style: italic; }
    .totals { border-top: 1px dashed #d0a139; margin: 0 10px; padding: 7px 0; font-size: 10px; color: #555; }
    .totals .row { margin-bottom: 2px; }
    .grand { font-size: 13px; font-weight: 800; color: #6e150f; border-top: 2px solid #6e150f; padding-top: 5px; margin-top: 3px; }
    .change { color: #2a9d5c; font-weight: 700; }
    .footer { background: #FFF8F7; border-top: 1px dashed #d0a139; padding: 8px 10px; text-align: center; }
    .footer .msg { font-size: 10px; color: #555; }
    .powered { margin-top: 6px; padding-top: 5px; border-top: 1px solid #eee; }
    .powered b { font-size: 8px; color: #b92a1c; letter-spacing: 0.5px; }
    .powered span { display: block; font-size: 7px; color: #999; }`;

function receiptBodyHtml(order: ReceiptOrder, store: ReceiptStore): string {
  const info = (label: string, value: string) =>
    value ? `<div class="row info"><span>${label}</span><b>${esc(value)}</b></div>` : '';

  const itemsHtml = order.items
    .map((it) => {
      const lineTotal = it.price * it.qty;
      return `
      <div class="item">
        <div class="row">
          <span class="iname">${esc(it.product_name)}</span>
          <span class="isub">${formatRupiah(lineTotal)}</span>
        </div>
        ${it.variant_summary ? `<div class="variant">▸ ${esc(it.variant_summary)}</div>` : ''}
        <div class="qty">${it.qty} x ${formatRupiah(it.price)}</div>
        ${it.notes ? `<div class="note">&quot;${esc(it.notes)}&quot;</div>` : ''}
      </div>`;
    })
    .join('');

  return `
    <div class="header">
      <p class="sname">${esc(store.name)}</p>
      ${store.address ? `<p class="saddr">${esc(store.address)}</p>` : ''}
      ${store.phone ? `<p class="saddr">${esc(store.phone)}</p>` : ''}
    </div>
    <div class="infoblock">
      ${info('No. Struk', receiptNo(order))}
      ${info('Tanggal', fmtTime(order.created_at))}
      ${info('Kasir', order.cashier_name)}
      ${info('Meja', order.table_number ?? '')}
      ${info('Pelanggan', order.customer_name ?? '')}
    </div>
    <div class="items">${itemsHtml}</div>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
      ${order.discount > 0 ? `<div class="row"><span>Diskon</span><span>-${formatRupiah(order.discount)}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
      <div class="row"><span>Bayar (${PAY_LABEL[order.payment_method]})</span><span>${formatRupiah(order.cash_received ?? order.total)}</span></div>
      ${order.change_amount != null && order.change_amount > 0 ? `<div class="row change"><span>Kembalian</span><span>${formatRupiah(order.change_amount)}</span></div>` : ''}
    </div>
    <div class="footer">
      <p class="msg">Terima kasih!</p>
      <div class="powered">
        <b>INSPIRA POS</b>
        <span>inspirapos.biz.id</span>
      </div>
    </div>`;
}

export function printReceipt(order: ReceiptOrder, store: ReceiptStore) {
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Struk ${receiptNo(order)}</title><style>${RECEIPT_STYLE}</style></head><body>${receiptBodyHtml(order, store)}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
