// Sales: new sale (multi-line), all sales, invoices
(async () => {
  const profile = await Auth.require();
  if (!profile) return;
  const qs = new URLSearchParams(location.search), view = qs.get('view') || 'main';
  const titles = { main: 'All Sales', new: 'New Sale', invoices: 'Invoices' };
  const content = UI.layout(profile, titles[view] || 'Sales');
  const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'];
  const STATUS = ['Paid', 'Partially Paid', 'Pending'];
  const exp = pairs => pairs.map(([key, label]) => ({ key, label }));
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

  // ---------------------------------------------------------------- all sales
  if (view === 'main') {
    content.innerHTML = `<div class="toolbar"><a class="btn" href="sales.html?view=new">New Sale</a></div><div id="list"></div>`;
    const rowActions = [
      { label: 'Invoice', show: r => r.invoice_id, fn: r => Invoice.show(r.invoice_id) },
      { label: 'Add payment', show: r => Number(r.pending_amount) > 0, fn: (r, reload) => addPayment(r, reload) }
    ];
    if (Auth.isAdmin(profile)) rowActions.push({ label: 'Void', fn: async (r, reload) => {
      if (!(await UI.confirm(`Void ${r.invoice_number || 'this sale'}? Stock will be returned to inventory and the invoice removed.`, 'Void sale'))) return;
      try { await DB.rpc('void_sale', { p_sale: r.id }); UI.toast('Sale voided. Stock restored.'); reload(); } catch (e) { UI.toast(e.message, 'error'); }
    } });
    Crud({
      el: content.querySelector('#list'), table: 'sales', source: 'v_sales', entity: 'Sale', title: 'All sales', canAdd: false, canEdit: false, canDelete: false,
      search: ['customer_name', 'invoice_number'], dateCol: 'sale_date', order: { col: 'sale_date', asc: false },
      filters: [{ name: 'payment_status', label: 'All statuses', options: STATUS }, { name: 'payment_method', label: 'All methods', options: METHODS }],
      columns: [{ key: 'invoice_number', label: 'Invoice', sort: 'invoice_number' }, { label: 'Date', sort: 'sale_date', render: r => UI.date(r.sale_date) }, { key: 'customer_name', label: 'Customer' },
        { key: 'payment_method', label: 'Method' }, { label: 'Status', render: r => Table.tag(r.payment_status, r.payment_status === 'Paid') },
        { label: 'Total', num: true, sort: 'grand_total', render: r => UI.money(r.grand_total) }, { label: 'Paid', num: true, render: r => UI.money(r.amount_paid) }, { label: 'Pending', num: true, render: r => UI.money(r.pending_amount) }],
      exportColumns: exp([['invoice_number', 'Invoice'], ['sale_date', 'Date'], ['customer_name', 'Customer'], ['payment_method', 'Payment Method'], ['payment_status', 'Status'], ['subtotal', 'Subtotal'], ['discount_total', 'Discount'], ['taxable_amount', 'Taxable'], ['gst_total', 'GST'], ['other_charges', 'Other Charges'], ['grand_total', 'Total'], ['amount_paid', 'Paid'], ['pending_amount', 'Pending'], ['cogs_total', 'COGS']]),
      exportName: 'sales', rowActions,
      onRowClick: r => r.invoice_id && Invoice.show(r.invoice_id)
    });
    return;
  }

  function addPayment(r, reload) {
    const fields = [{ name: 'amount', label: 'Amount received', type: 'number', min: 0.01, required: true, default: r.pending_amount, hint: `Pending: ${UI.money(r.pending_amount)}` }];
    const m = UI.modal({ title: `Payment for ${r.invoice_number}`, body: Form.html(fields),
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn" id="paySave">Record payment</button>` });
    m.el.querySelector('#paySave').onclick = async e => {
      const { ok, values } = Form.read(m.el, fields); if (!ok) return;
      if (values.amount > Number(r.pending_amount) + 0.001) return UI.toast(`The payment is more than the pending ${UI.money(r.pending_amount)}.`, 'error');
      e.target.disabled = true;
      try { await DB.rpc('record_payment', { p_sale: r.id, p_amount: values.amount }); m.close(); UI.toast('Payment recorded'); reload(); }
      catch (err) { UI.toast(err.message, 'error'); e.target.disabled = false; }
    };
  }

  // ---------------------------------------------------------------- invoices
  if (view === 'invoices') {
    Crud({
      el: content, table: 'invoices', source: 'v_invoices', entity: 'Invoice', title: 'Invoices', canAdd: false, canEdit: false, canDelete: false,
      search: ['invoice_number', 'customer_name'], dateCol: 'invoice_date', order: { col: 'invoice_number', asc: false },
      filters: [{ name: 'payment_status', label: 'All statuses', options: STATUS }],
      columns: [{ key: 'invoice_number', label: 'Invoice', sort: 'invoice_number' }, { label: 'Date', sort: 'invoice_date', render: r => UI.date(r.invoice_date) }, { key: 'customer_name', label: 'Customer' },
        { label: 'Status', render: r => Table.tag(r.payment_status, r.payment_status === 'Paid') }, { label: 'Total', num: true, render: r => UI.money(r.grand_total) }, { label: 'Pending', num: true, render: r => UI.money(r.pending_amount) }],
      exportColumns: exp([['invoice_number', 'Invoice'], ['invoice_date', 'Date'], ['customer_name', 'Customer'], ['payment_status', 'Status'], ['grand_total', 'Total'], ['amount_paid', 'Paid'], ['pending_amount', 'Pending']]),
      exportName: 'invoices',
      rowActions: [
        { label: 'View', fn: r => Invoice.show(r.id) },
        { label: 'PDF', fn: async r => { try { UI.toast('Preparing PDF...'); await Invoice.pdf(await Invoice.load(r.id)); } catch (e) { UI.toast(e.message, 'error'); } } },
        { label: 'Print', fn: async r => { try { Invoice.print(await Invoice.load(r.id)); } catch (e) { UI.toast(e.message, 'error'); } } }
      ],
      onRowClick: r => Invoice.show(r.id)
    });
    if (qs.get('open')) Invoice.show(qs.get('open'));
    return;
  }

  // ---------------------------------------------------------------- new sale
  content.innerHTML = UI.loading();
  let customers, products;
  try {
    [customers, products] = (await Promise.all([
      DB.run(db.from('customers').select('id,name,phone').order('name')),
      DB.run(db.from('v_products').select('id,name,sku,selling_price,gst_percent,current_stock').eq('status', 'active').order('name'))
    ])).map(x => x.data);
  } catch (e) { content.innerHTML = UI.error(e.message); return; }

  const admin = Auth.isAdmin(profile);
  const batchCache = {};
  let lines = [blank()];
  function blank() { return { product_id: '', batch_id: '', qty: 1, rate: 0, discount: 0, gst: 0 }; }
  const pById = id => products.find(p => p.id === id);

  const custOptions = sel => customers.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${UI.esc(c.name)}${c.phone ? ' (' + UI.esc(c.phone) + ')' : ''}</option>`).join('');
  content.innerHTML = `
    <div class="panel" style="margin-bottom:16px"><div class="panel-body"><div class="form-grid">
      <div class="field" data-f="customer"><label>Customer *</label><div style="display:flex;gap:8px"><select class="select" id="sCustomer"><option value="">Select customer</option>${custOptions()}</select><button class="btn btn-outline" id="sNewCust" type="button">New</button></div><span class="error"></span></div>
      <div class="field"><label>Invoice date *</label><input class="input" type="date" id="sDate" value="${today()}"></div>
      <div class="field"><label>Payment method</label><select class="select" id="sMethod">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Payment status</label><select class="select" id="sStatus">${STATUS.map(m => `<option>${m}</option>`).join('')}</select></div>
      <div class="field" id="paidWrap" hidden><label>Amount received *</label><input class="input" type="number" min="0" step="any" id="sPaid"></div>
      <div class="field full"><label>Notes</label><textarea class="textarea" id="sNotes" rows="2"></textarea></div>
    </div></div></div>
    <div class="panel"><div class="panel-head"><h2>Products</h2><button class="btn btn-outline btn-sm" id="addLine" type="button">Add product</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th style="min-width:200px">Product</th><th style="min-width:160px">Batch</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">GST %</th><th class="num">Total</th><th></th></tr></thead><tbody id="lines"></tbody></table></div></div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px"><div class="panel" style="width:360px;max-width:100%"><div class="panel-body" id="sum"></div></div></div>
    <div style="display:flex;justify-content:flex-end;gap:12px;align-items:center;margin-top:16px">
      ${admin ? `<label class="muted"><input type="checkbox" id="sNeg"> Allow selling above available stock</label>` : ''}
      <button class="btn" id="sSave" type="button">Save sale and create invoice</button></div>`;

  const $ = id => content.querySelector('#' + id);
  const calc = l => { const gross = r2(l.qty * l.rate), taxable = r2(gross - l.discount), gst = r2(taxable * l.gst / 100); return { gross, taxable, gst, total: r2(taxable + gst) }; };
  const other = () => Math.max(0, Number($('sOther') ? $('sOther').value : 0) || 0);

  function rowHtml(l, i) {
    const bs = batchCache[l.product_id] || [];
    return `<td><select class="select" data-k="product_id"><option value="">Select product</option>${products.map(p => `<option value="${p.id}" ${p.id === l.product_id ? 'selected' : ''}>${UI.esc(p.name)} (${p.current_stock} in stock)</option>`).join('')}</select></td>
      <td><select class="select" data-k="batch_id"><option value="">Auto (earliest expiry)</option>${bs.map(b => `<option value="${b.id}" ${b.id === l.batch_id ? 'selected' : ''}>${UI.esc(b.batch_number)} (${b.quantity_remaining} left${b.expiry_date ? ', exp ' + UI.date(b.expiry_date) : ''})</option>`).join('')}</select></td>
      <td><input class="input" style="width:80px" type="number" min="1" step="1" data-k="qty" value="${l.qty}"></td>
      <td><input class="input" style="width:100px" type="number" min="0" step="any" data-k="rate" value="${l.rate}"></td>
      <td><input class="input" style="width:100px" type="number" min="0" step="any" data-k="discount" value="${l.discount}"></td>
      <td><input class="input" style="width:70px" type="number" min="0" max="100" step="any" data-k="gst" value="${l.gst}"></td>
      <td class="num" data-total>${UI.money(calc(l).total)}</td>
      <td><button class="btn btn-ghost btn-sm" data-rm type="button" ${lines.length === 1 ? 'disabled' : ''}>Remove</button></td>`;
  }
  function renderLines() {
    $('lines').innerHTML = lines.map((l, i) => `<tr data-i="${i}">${rowHtml(l, i)}</tr>`).join('');
    summary();
  }
  const state = { grand: 0 };
  function initSummary() {
    const row = (k, id) => `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>${k}</span><span id="${id}"></span></div>`;
    $('sum').innerHTML = row('Subtotal', 'sSub') + row('Discount', 'sDis') + row('Taxable amount', 'sTax') + row('GST', 'sGst') +
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0"><span>Other charges</span><input class="input" style="width:110px" type="number" min="0" step="any" id="sOther" value="0"></div>
       <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #000;margin-top:6px;padding-top:10px"><span>Grand total</span><strong class="kpi-value" style="font-size:20px" id="sGrand"></strong></div>`;
    $('sOther').oninput = summary;
  }
  function summary() {
    const t = lines.reduce((a, l) => { const c = calc(l); a.sub += c.gross; a.dis += Number(l.discount) || 0; a.tax += c.taxable; a.gst += c.gst; return a; }, { sub: 0, dis: 0, tax: 0, gst: 0 });
    state.grand = r2(t.tax + t.gst + other());
    $('sSub').textContent = UI.money(t.sub); $('sDis').textContent = '- ' + UI.money(t.dis); $('sTax').textContent = UI.money(t.tax);
    $('sGst').textContent = UI.money(t.gst); $('sGrand').textContent = UI.money(state.grand);
  }

  async function loadBatches(pid) {
    if (!pid || batchCache[pid]) return;
    const { data } = await DB.run(db.from('product_batches').select('id,batch_number,quantity_remaining,expiry_date').eq('product_id', pid).gt('quantity_remaining', 0).order('expiry_date', { nullsFirst: false }));
    batchCache[pid] = data;
  }

  $('lines').addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr || !e.target.dataset.k || e.target.tagName === 'SELECT') return;
    lines[+tr.dataset.i][e.target.dataset.k] = e.target.value === '' ? 0 : Number(e.target.value);
    tr.querySelector('[data-total]').textContent = UI.money(calc(lines[+tr.dataset.i]).total); summary();
  });
  $('lines').addEventListener('change', async e => {
    const tr = e.target.closest('tr'); if (!tr) return; const i = +tr.dataset.i, l = lines[i];
    if (e.target.dataset.k === 'batch_id') l.batch_id = e.target.value;
    if (e.target.dataset.k === 'product_id') {
      l.product_id = e.target.value; l.batch_id = '';
      const p = pById(l.product_id);
      if (p) { l.rate = Number(p.selling_price); l.gst = Number(p.gst_percent); try { await loadBatches(p.id); } catch (err) { UI.toast(err.message, 'error'); } }
      else { l.rate = 0; l.gst = 0; }
      tr.innerHTML = rowHtml(l, i); summary();
    }
  });
  $('lines').addEventListener('click', e => { if (e.target.hasAttribute('data-rm')) { lines.splice(+e.target.closest('tr').dataset.i, 1); renderLines(); } });
  $('addLine').onclick = () => { lines.push(blank()); renderLines(); };
  $('sStatus').onchange = e => { $('paidWrap').hidden = e.target.value !== 'Partially Paid'; };

  $('sNewCust').onclick = () => {
    const fields = [{ name: 'name', label: 'Name', required: true, full: true }, { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'customer_type', label: 'Type', type: 'select', required: true, default: 'Direct Customer', options: ['Direct Customer', 'Retailer', 'Distributor', 'Doctor', 'Other'] }];
    const m = UI.modal({ title: 'New customer', body: Form.html(fields), footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn" id="ncSave">Save</button>` });
    m.el.querySelector('#ncSave').onclick = async e => {
      const { ok, values } = Form.read(m.el, fields); if (!ok) return; e.target.disabled = true;
      try {
        const { data } = await DB.run(db.from('customers').insert(values).select('id,name,phone').single());
        customers.push(data); $('sCustomer').innerHTML = `<option value="">Select customer</option>${custOptions(data.id)}`; m.close(); UI.toast('Customer added');
      } catch (err) { UI.toast(err.message, 'error'); e.target.disabled = false; }
    };
  };

  $('sSave').onclick = async function () {
    const err = msg => { UI.toast(msg, 'error'); return false; };
    const customer = $('sCustomer').value, status = $('sStatus').value, allowNeg = admin && $('sNeg') && $('sNeg').checked;
    if (!customer) return err('Choose a customer.');
    if (!$('sDate').value) return err('Choose the invoice date.');
    const need = {};
    for (const [i, l] of lines.entries()) {
      const p = pById(l.product_id), n = i + 1;
      if (!p) return err(`Line ${n}: choose a product.`);
      if (!Number.isInteger(l.qty) || l.qty <= 0) return err(`Line ${n}: quantity must be a whole number greater than 0.`);
      if (!(l.rate >= 0)) return err(`Line ${n}: price is not valid.`);
      if (l.discount < 0 || l.discount > l.qty * l.rate) return err(`Line ${n}: discount must be between 0 and the line amount.`);
      if (l.gst < 0 || l.gst > 100) return err(`Line ${n}: GST must be between 0 and 100.`);
      need[p.id] = (need[p.id] || 0) + l.qty;
      if (need[p.id] > p.current_stock && !allowNeg) return err(`Not enough stock for ${p.name}: ${p.current_stock} available, ${need[p.id]} requested.`);
      if (l.batch_id) { const b = (batchCache[p.id] || []).find(x => x.id === l.batch_id); if (b && l.qty > b.quantity_remaining && !allowNeg) return err(`Line ${n}: batch ${b.batch_number} only has ${b.quantity_remaining} units.`); }
    }
    const paid = Number($('sPaid').value) || 0;
    if (status === 'Partially Paid' && (paid <= 0 || paid >= state.grand)) return err('For a partial payment, enter an amount above 0 and below the grand total.');
    this.disabled = true; this.textContent = 'Saving...';
    try {
      const res = await DB.rpc('create_sale', {
        p_customer_id: customer, p_sale_date: $('sDate').value, p_payment_method: $('sMethod').value, p_payment_status: status,
        p_other_charges: other(), p_amount_paid: status === 'Partially Paid' ? paid : null, p_notes: $('sNotes').value.trim() || null,
        p_items: lines.map(l => ({ product_id: l.product_id, batch_id: l.batch_id || null, quantity: l.qty, rate: l.rate, discount: l.discount, gst_percent: l.gst })),
        p_allow_negative: !!allowNeg
      });
      UI.toast(`Invoice ${res.invoice_number} created`);
      setTimeout(() => { location.href = `sales.html?view=invoices&open=${res.invoice_id}`; }, 500);
    } catch (e) { UI.toast(e.message, 'error'); this.disabled = false; this.textContent = 'Save sale and create invoice'; }
  };

  initSummary();
  renderLines();
})();
