// Invoice rendering, viewing, PDF, print and share.
// The layout is a single function (Invoice.html) + css/invoice.css so it can be matched
// to the real Forma invoice design without touching any business logic.
const Invoice = (() => {
  const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  const imgCache = {};

  function words(num) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    const three = n => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + two(n % 100);
    const conv = n => {
      if (n === 0) return 'Zero';
      const parts = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]; let out = '';
      parts.forEach(([v, l]) => { if (n >= v) { out += three(Math.floor(n / v)) + ' ' + l + ' '; n %= v; } });
      return (out + (n ? three(n) : '')).trim();
    };
    const rupees = Math.floor(num), paise = Math.round((num - rupees) * 100);
    return `Rupees ${conv(rupees)}${paise ? ' and ' + conv(paise) + ' Paise' : ''} Only`;
  }

  async function dataUrl(bucket, path) {
    if (!path) return null;
    const k = bucket + '/' + path; if (imgCache[k]) return imgCache[k];
    try {
      const url = await Files.url(bucket, path); const blob = await (await fetch(url)).blob();
      return imgCache[k] = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
    } catch { return null; }
  }

  async function load(invoiceId) {
    const inv = (await DB.run(db.from('invoices').select('*').eq('id', invoiceId).single())).data;
    const [sale, items, cust, st] = await Promise.all([
      DB.run(db.from('sales').select('*').eq('id', inv.sale_id).single()),
      DB.run(db.from('sale_items').select('*, products(name,sku,hsn_code), product_batches(batch_number)').eq('sale_id', inv.sale_id).order('created_at')),
      DB.run(db.from('customers').select('*').eq('id', inv.customer_id).single()),
      DB.run(db.from('settings').select('*'))
    ]);
    const s = Object.fromEntries(st.data.map(r => [r.key, r.value]));
    const company = s.company || {}, conf = s.invoice || {};
    return { inv, sale: sale.data, items: items.data, cust: cust.data, company, conf,
      logo: await dataUrl('company', company.logo_path), sign: await dataUrl('company', conf.signature_path) };
  }

  const nl = t => UI.esc(t || '').replace(/\n/g, '<br>');

  function html(d) {
    const { inv, sale, items, cust, company, conf } = d, m = UI.money;
    const due = Number(sale.grand_total) - Number(sale.amount_paid);
    return `<div class="invoice-sheet">
      <div class="inv-top">
        <div class="inv-logo">${d.logo ? `<img src="${d.logo}" alt="">` : `<div class="wordmark">${UI.esc((company.name || 'FORMA').split(' ')[0].toUpperCase())}</div>`}</div>
        <div class="inv-co"><strong>${UI.esc(company.name || 'Forma Cosmetics')}</strong><br>${nl(company.address)}${company.address ? '<br>' : ''}
          ${[company.phone, company.email, company.website].filter(Boolean).map(UI.esc).join(' | ')}${company.gstin ? `<br>GSTIN: ${UI.esc(company.gstin)}` : ''}</div>
      </div>
      <div class="inv-title">TAX INVOICE</div>
      <div class="inv-meta">
        <div><div class="lbl">Invoice number</div><strong>${UI.esc(inv.invoice_number)}</strong><div class="lbl" style="margin-top:8px">Invoice date</div>${UI.date(inv.invoice_date)}</div>
        <div><div class="lbl">Billed to</div><strong>${UI.esc(cust.name)}</strong><br>${nl(cust.billing_address)}${cust.phone ? `<br>${UI.esc(cust.phone)}` : ''}${cust.gstin ? `<br>GSTIN: ${UI.esc(cust.gstin)}` : ''}</div>
        <div><div class="lbl">Shipped to</div>${nl(cust.shipping_address || cust.billing_address) || '-'}</div>
      </div>
      <table class="inv-table"><thead><tr><th>#</th><th>Description</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Discount</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>
        ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${UI.esc(it.products.name)}${it.product_batches ? `<br><span style="color:#737373;font-size:10.5px">Batch ${UI.esc(it.product_batches.batch_number)}</span>` : ''}</td>
          <td>${UI.esc(it.products.hsn_code || '')}</td><td class="r">${it.quantity}</td><td class="r">${m(it.rate)}</td><td class="r">${Number(it.discount) ? m(it.discount) : '-'}</td>
          <td class="r">${it.gst_percent}%<br><span style="color:#737373;font-size:10.5px">${m(it.gst_amount)}</span></td><td class="r">${m(it.line_total)}</td></tr>`).join('')}
      </tbody></table>
      <div class="inv-bottom">
        <div><div class="lbl" style="font:600 10.5px Manrope;color:#737373">Payment</div>
          Method: ${UI.esc(sale.payment_method)}<br>Status: ${UI.esc(sale.payment_status)}<br>Paid: ${m(sale.amount_paid)}${due > 0 ? `<br><strong>Balance due: ${m(due)}</strong>` : ''}
          ${conf.bank_details ? `<div class="lbl" style="font:600 10.5px Manrope;color:#737373;margin-top:10px">Bank details</div><div class="inv-terms">${UI.esc(conf.bank_details)}</div>` : ''}</div>
        <div class="inv-totals">
          <div><span>Subtotal</span><span>${m(sale.subtotal)}</span></div>
          <div><span>Discount</span><span>- ${m(sale.discount_total)}</span></div>
          <div><span>Taxable amount</span><span>${m(sale.taxable_amount)}</span></div>
          <div><span>GST</span><span>${m(sale.gst_total)}</span></div>
          ${Number(sale.other_charges) ? `<div><span>Other charges</span><span>${m(sale.other_charges)}</span></div>` : ''}
          <div class="grand"><span>Total</span><span>${m(sale.grand_total)}</span></div>
        </div>
      </div>
      <div class="inv-words">${words(Number(sale.grand_total))}</div>
      <div class="inv-foot">
        <div class="inv-terms"><strong>Terms</strong><br>${UI.esc(conf.terms || '')}</div>
        <div class="inv-sign">${d.sign ? `<img src="${d.sign}" alt="">` : '<div style="height:48px"></div>'}<div class="line">Authorised signatory</div></div>
      </div>
      ${conf.footer ? `<div class="inv-footer">${UI.esc(conf.footer)}</div>` : ''}
    </div>`;
  }

  function loadLib() {
    if (window.html2pdf) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDF_LIB; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF tool. Check your internet connection or use Print and choose Save as PDF.')); document.head.appendChild(s); });
  }

  async function pdf(d, asBlob) {
    await loadLib();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff';
    host.innerHTML = html(d).replace('class="invoice-sheet"', 'class="invoice-sheet" style="border:0;width:794px"');
    document.body.appendChild(host);
    try {
      const w = window.html2pdf().set({ margin: 0, filename: d.inv.invoice_number + '.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4' } }).from(host.firstElementChild);
      return asBlob ? await w.outputPdf('blob') : await w.save();
    } finally { host.remove(); }
  }

  function print(d) {
    let root = document.getElementById('printRoot');
    if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
    root.innerHTML = html(d); document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 100);
  }

  async function share(d) {
    const text = `Invoice ${d.inv.invoice_number} from ${d.company.name || 'Forma Cosmetics'}: total ${UI.money(d.sale.grand_total)}`;
    try {
      const file = new File([await pdf(d, true)], d.inv.invoice_number + '.pdf', { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: d.inv.invoice_number, text }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    if (navigator.share) { try { await navigator.share({ title: d.inv.invoice_number, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); UI.toast('Invoice details copied. Download the PDF to attach it.'); } catch { UI.toast(text); }
  }

  async function show(id) {
    const m = UI.modal({ title: 'Invoice', body: UI.loading() });
    m.el.querySelector('.modal').style.maxWidth = '900px';
    try {
      const d = await load(id);
      m.el.querySelector('.modal-head h2').textContent = d.inv.invoice_number;
      const body = m.el.querySelector('.modal-body');
      body.innerHTML = `<div class="inv-actions no-print"><button class="btn" data-a="pdf">Download PDF</button><button class="btn btn-outline" data-a="print">Print</button><button class="btn btn-outline" data-a="share">Share</button></div><div class="inv-scroll">${html(d)}</div>`;
      body.querySelector('.inv-actions').onclick = async e => {
        const a = e.target.dataset.a; if (!a) return; e.target.disabled = true;
        try { if (a === 'pdf') await pdf(d); else if (a === 'print') print(d); else await share(d); }
        catch (err) { UI.toast(err.message, 'error'); } finally { e.target.disabled = false; }
      };
    } catch (e) { m.el.querySelector('.modal-body').innerHTML = UI.error(e.message); }
  }

  return { show, load, html, pdf, print, share, words };
})();
