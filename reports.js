// Reports: pick a report, filter by dates, search, sort, export CSV, print / save as PDF.
(async () => {
  const profile = await Auth.require();
  if (!profile) return;
  const admin = Auth.isAdmin(profile), m = UI.money, d = UI.date;
  const content = UI.layout(profile, 'Reports');

  const REPORTS = [
    { id: 'sales', name: 'Sales Report', src: 'v_sales', dateCol: 'sale_date', cols: [['invoice_number', 'Invoice'], ['sale_date', 'Date', d], ['customer_name', 'Customer'], ['payment_method', 'Method'], ['payment_status', 'Status'], ['taxable_amount', 'Taxable', m, 1], ['gst_total', 'GST', m, 1], ['grand_total', 'Total', m, 1]], total: ['taxable_amount', 'gst_total', 'grand_total'] },
    { id: 'invoices', name: 'Invoice Report', src: 'v_invoices', dateCol: 'invoice_date', cols: [['invoice_number', 'Invoice'], ['invoice_date', 'Date', d], ['customer_name', 'Customer'], ['payment_status', 'Status'], ['grand_total', 'Total', m, 1], ['amount_paid', 'Paid', m, 1], ['pending_amount', 'Pending', m, 1]], total: ['grand_total', 'amount_paid', 'pending_amount'] },
    { id: 'productsales', name: 'Product Sales Report', rpc: 'top_products', dateCol: true, cols: [['name', 'Product'], ['units', 'Units sold', null, 1], ['revenue', 'Revenue', m, 1], ['cogs', 'COGS', m, 1], ['profit', 'Profit', m, 1]], total: ['units', 'revenue', 'cogs', 'profit'], map: r => ({ ...r, profit: Number(r.revenue) - Number(r.cogs) }) },
    { id: 'customers', name: 'Customer Report', src: 'v_customers', cols: [['customer_code', 'ID'], ['name', 'Customer'], ['customer_type', 'Type'], ['phone', 'Phone'], ['total_orders', 'Orders', null, 1], ['total_purchase', 'Purchase', m, 1], ['total_paid', 'Paid', m, 1], ['total_pending', 'Pending', m, 1]], total: ['total_orders', 'total_purchase', 'total_paid', 'total_pending'] },
    { id: 'inventory', name: 'Inventory Report', src: 'v_products', cols: [['name', 'Product'], ['sku', 'SKU'], ['category_name', 'Category'], ['current_stock', 'Stock', null, 1], ['minimum_stock', 'Minimum', null, 1], ['cost_price', 'Cost', m, 1], ['stock_value', 'Stock value', m, 1]], total: ['current_stock', 'stock_value'] },
    { id: 'stock', name: 'Stock Movement Report', src: 'v_stock_history', dateCol: 'created_at', cols: [['created_at', 'Date', d], ['product_name', 'Product'], ['batch_number', 'Batch'], ['transaction_type', 'Type'], ['quantity', 'Quantity', null, 1], ['unit_cost', 'Unit cost', m, 1]] },
    { id: 'manufacturing', name: 'Manufacturing Report', admin: true, src: 'v_manufacturing', dateCol: 'manufacturing_date', cols: [['production_code', 'ID'], ['product_name', 'Product'], ['batch_number', 'Batch'], ['manufacturing_date', 'Date', d], ['quantity_produced', 'Qty', null, 1], ['total_batch_cost', 'Total cost', m, 1], ['cost_per_unit', 'Per unit', m, 1], ['status', 'Status']], total: ['quantity_produced', 'total_batch_cost'] },
    { id: 'expenses', name: 'Expense Report', admin: true, src: 'v_expenses', dateCol: 'expense_date', cols: [['expense_code', 'ID'], ['expense_date', 'Date', d], ['category_name', 'Category'], ['description', 'Description'], ['vendor', 'Vendor'], ['payment_method', 'Method'], ['amount', 'Amount', m, 1]], total: ['amount'] },
    { id: 'investments', name: 'Investment Report', admin: true, src: 'v_investments', dateCol: 'investment_date', cols: [['investment_code', 'ID'], ['investment_date', 'Date', d], ['partner_name', 'Partner'], ['investment_type', 'Type'], ['payment_method', 'Method'], ['amount', 'Amount', m, 1]], total: ['amount'] },
    { id: 'pl', name: 'Profit & Loss Report', admin: true, rpc: 'revenue_expense_series', dateCol: true, cols: [['period', 'Month', d], ['revenue', 'Revenue', m, 1], ['cogs', 'COGS', m, 1], ['gross', 'Gross profit', m, 1], ['expenses', 'Expenses', m, 1], ['net', 'Net profit', m, 1]], total: ['revenue', 'cogs', 'gross', 'expenses', 'net'], map: r => ({ ...r, gross: r.revenue - r.cogs, net: r.revenue - r.cogs - r.expenses }) },
    { id: 'batch', name: 'Batch Report', src: 'v_batches', cols: [['product_name', 'Product'], ['batch_number', 'Batch'], ['manufacturing_date', 'Mfg', d], ['expiry_date', 'Expiry', d], ['quantity_produced', 'Produced', null, 1], ['quantity_remaining', 'Remaining', null, 1], ['cost_per_unit', 'Cost / unit', m, 1], ['status', 'Status']] },
    { id: 'expiry', name: 'Expiry Report', src: 'v_batches', filter: q => q.gt('quantity_remaining', 0).neq('status', 'Active'), cols: [['product_name', 'Product'], ['batch_number', 'Batch'], ['expiry_date', 'Expiry', d], ['quantity_remaining', 'Remaining', null, 1], ['status', 'Status']] },
    { id: 'payments', name: 'Payment Report (outstanding)', src: 'v_sales', dateCol: 'sale_date', filter: q => q.neq('payment_status', 'Paid'), cols: [['invoice_number', 'Invoice'], ['sale_date', 'Date', d], ['customer_name', 'Customer'], ['payment_status', 'Status'], ['grand_total', 'Total', m, 1], ['amount_paid', 'Paid', m, 1], ['pending_amount', 'Pending', m, 1]], total: ['grand_total', 'amount_paid', 'pending_amount'] }
  ].filter(r => admin || !r.admin);

  content.innerHTML = `<div class="page-head"><h2>Reports</h2><div class="toolbar">
      <select class="select" style="width:auto" id="repSel">${REPORTS.map(r => `<option value="${r.id}">${UI.esc(r.name)}</option>`).join('')}</select>
      <span id="repRange" class="toolbar"></span>
      <input class="input" style="width:200px" type="search" id="repQ" placeholder="Search in report">
      <button class="btn btn-outline" id="repCsv">Export CSV</button><button class="btn btn-outline" id="repPdf">Print / PDF</button></div></div>
    <div class="panel"><div id="repBody"></div><div class="pagination" id="repCount"></div></div>`;
  const $ = id => document.getElementById(id);
  let rows = [], rep = REPORTS[0], sort = null, range = Range.presets().month, token = 0;

  const rangeBox = $('repRange');
  const rc = Range.control(rangeBox, r => { range = r; run(); }, 'month', { today: 'Today', month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time', custom: 'Custom Range' });

  async function run() {
    const my = ++token; rep = REPORTS.find(r => r.id === $('repSel').value);
    rangeBox.style.display = rep.dateCol ? '' : 'none';
    $('repBody').innerHTML = UI.loading(); sort = null;
    try {
      let data;
      if (rep.rpc === 'top_products') data = await DB.rpc('top_products', { p_from: range.from, p_to: range.to, p_limit: 1000 });
      else if (rep.rpc) data = await DB.rpc(rep.rpc, { p_from: range.from, p_to: range.to, p_group: 'month' });
      else data = await DB.all(() => {
        let q = db.from(rep.src).select('*');
        if (rep.dateCol && range.from) { const end = rep.dateCol === 'created_at' ? range.to + 'T23:59:59' : range.to; q = q.gte(rep.dateCol, range.from).lte(rep.dateCol, end); }
        if (rep.filter) q = rep.filter(q);
        return q.order(rep.dateCol || rep.cols[0][0], { ascending: false });
      });
      if (my !== token) return;
      rows = rep.map ? data.map(rep.map) : data; draw();
    } catch (e) { $('repBody').innerHTML = UI.error(e.message); }
  }

  function draw() {
    const q = $('repQ').value.trim().toLowerCase();
    let list = q ? rows.filter(r => rep.cols.some(c => String(r[c[0]] ?? '').toLowerCase().includes(q))) : rows.slice();
    if (sort) list.sort((a, b) => { const x = a[sort.k], y = b[sort.k]; const c = (typeof x === 'number' || !isNaN(x)) && x !== '' && x != null && !/^\d{4}-/.test(x) ? Number(x) - Number(y) : String(x ?? '').localeCompare(String(y ?? '')); return sort.asc ? c : -c; });
    const tot = rep.total ? `<tr style="font-weight:700;background:var(--wash)">${rep.cols.map((c, i) => `<td class="${c[3] ? 'num' : ''}">${i === 0 ? 'Total' : rep.total.includes(c[0]) ? (c[2] ? c[2](list.reduce((s, r) => s + Number(r[c[0]] || 0), 0)) : UI.num(list.reduce((s, r) => s + Number(r[c[0]] || 0), 0))) : ''}</td>`).join('')}</tr>` : '';
    $('repBody').innerHTML = list.length ? `<div class="table-wrap"><table class="table"><thead><tr>${rep.cols.map(c => `<th class="sortable ${c[3] ? 'num' : ''}" data-k="${c[0]}">${UI.esc(c[1])}${sort && sort.k === c[0] ? (sort.asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${list.slice(0, 1000).map(r => `<tr>${rep.cols.map(c => `<td class="${c[3] ? 'num' : ''}">${UI.esc(c[2] ? c[2](r[c[0]]) : r[c[0]])}</td>`).join('')}</tr>`).join('')}${tot}</tbody></table></div>` : UI.empty('No data for this report', 'Try a different date range.');
    $('repCount').innerHTML = `<span>${UI.num(list.length)} row${list.length === 1 ? '' : 's'}${list.length > 1000 ? ' (first 1,000 shown; the export includes all)' : ''}</span>`;
    $('repBody').dataset.n = list.length; draw.list = list;
  }

  $('repSel').onchange = run;
  $('repQ').oninput = draw;
  $('repBody').onclick = e => { const th = e.target.closest('th[data-k]'); if (!th) return; sort = { k: th.dataset.k, asc: sort && sort.k === th.dataset.k ? !sort.asc : true }; draw(); };
  $('repCsv').onclick = () => Export.csv(`${rep.id}-report`, draw.list || [], rep.cols.map(c => ({ label: c[1], value: r => r[c[0]] })));
  $('repPdf').onclick = () => window.print();
  run();
})();
