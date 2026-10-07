(async () => {
  const profile = await Auth.require();
  if (!profile) return;
  const content = UI.layout(profile, 'Customers');
  const TYPES = ['Direct Customer', 'Retailer', 'Distributor', 'Doctor', 'Other'];

  async function detail(c) {
    const [sales, invs] = await Promise.all([
      DB.run(db.from('v_sales').select('*').eq('customer_id', c.id).order('sale_date', { ascending: false }).limit(50)),
      DB.run(db.from('v_invoices').select('*').eq('customer_id', c.id).order('invoice_date', { ascending: false }).limit(50))
    ]);
    const kv = (k, v) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><strong>${v}</strong></div>`;
    UI.modal({
      title: c.name, drawer: true,
      body: `${kv('Customer ID', UI.esc(c.customer_code))}${kv('Type', UI.esc(c.customer_type))}${kv('Phone', UI.esc(c.phone || '-'))}${kv('Email', UI.esc(c.email || '-'))}${kv('GSTIN', UI.esc(c.gstin || '-'))}
        ${kv('Total orders', UI.num(c.total_orders))}${kv('Total purchase', UI.money(c.total_purchase))}${kv('Paid', UI.money(c.total_paid))}${kv('Pending', UI.money(c.total_pending))}
        <p class="muted" style="margin:12px 0 0">Billing: ${UI.esc(c.billing_address || '-')}<br>Shipping: ${UI.esc(c.shipping_address || '-')}<br>${UI.esc(c.notes || '')}</p>
        <h3 style="margin:20px 0 8px">Invoices</h3>
        ${Table.html([{ label: 'Invoice', render: r => `<a href="sales.html?view=invoices&open=${r.id}">${UI.esc(r.invoice_number)}</a>` }, { label: 'Date', render: r => UI.date(r.invoice_date) }, { label: 'Total', num: true, render: r => UI.money(r.grand_total) }, { label: 'Status', render: r => UI.esc(r.payment_status) }], invs.data, { empty: 'No invoices yet' })}
        <h3 style="margin:20px 0 8px">Sales history</h3>
        ${Table.html([{ label: 'Date', render: r => UI.date(r.sale_date) }, { label: 'Total', num: true, render: r => UI.money(r.grand_total) }, { label: 'Pending', num: true, render: r => UI.money(r.pending_amount) }], sales.data, { empty: 'No sales yet' })}`
    });
  }

  Crud({
    el: content, table: 'customers', source: 'v_customers', entity: 'Customer', title: 'Customers',
    search: ['name', 'phone', 'email', 'customer_code', 'gstin'], order: { col: 'name', asc: true },
    filters: [{ name: 'customer_type', label: 'All types', options: TYPES }],
    columns: [
      { key: 'customer_code', label: 'ID' }, { key: 'name', label: 'Name', sort: 'name' }, { key: 'phone', label: 'Phone' },
      { key: 'customer_type', label: 'Type' }, { label: 'Orders', num: true, render: r => UI.num(r.total_orders) },
      { label: 'Purchase', num: true, render: r => UI.money(r.total_purchase) }, { label: 'Pending', num: true, render: r => UI.money(r.total_pending) }
    ],
    exportColumns: [['customer_code', 'Customer ID'], ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['customer_type', 'Type'], ['gstin', 'GSTIN'],
      ['billing_address', 'Billing Address'], ['shipping_address', 'Shipping Address'], ['total_orders', 'Orders'], ['total_purchase', 'Total Purchase'], ['total_paid', 'Paid'], ['total_pending', 'Pending']].map(([key, label]) => ({ key, label })),
    exportName: 'customers',
    canDelete: true,
    fields: [
      { name: 'name', label: 'Name', required: true, full: true },
      { name: 'phone', label: 'Phone', type: 'tel', pattern: /^[0-9+\-\s()]{7,15}$/, patternMsg: 'Enter a valid phone number.' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'customer_type', label: 'Customer type', type: 'select', options: TYPES, default: 'Direct Customer', required: true },
      { name: 'gstin', label: 'GSTIN', pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i, patternMsg: 'GSTIN must be 15 characters, e.g. 24ABCDE1234F1Z5.' },
      { name: 'billing_address', label: 'Billing address', type: 'textarea', full: true },
      { name: 'shipping_address', label: 'Shipping address', type: 'textarea', full: true },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ],
    beforeSave: v => { if (v.gstin) v.gstin = v.gstin.toUpperCase(); return v; },
    rowActions: [{ label: 'View', fn: c => detail(c).catch(e => UI.toast(e.message, 'error')) }],
    onRowClick: c => detail(c).catch(e => UI.toast(e.message, 'error'))
  });
})();
