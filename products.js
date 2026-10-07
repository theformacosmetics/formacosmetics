// Products + Categories
(async () => {
  const profile = await Auth.require();
  if (!profile) return;
  const view = new URLSearchParams(location.search).get('view') || 'main';
  const content = UI.layout(profile, view === 'categories' ? 'Categories' : 'Products');

  if (view === 'categories') {
    Crud({
      el: content, table: 'categories', entity: 'Category', title: 'Product categories',
      search: ['name', 'description'], order: { col: 'name', asc: true },
      columns: [{ key: 'name', label: 'Name', sort: 'name' }, { key: 'description', label: 'Description' }],
      fields: [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description', type: 'textarea', full: true }],
      exportName: 'categories'
    });
    return;
  }

  const cats = (await DB.run(db.from('categories').select('id,name').order('name'))).data;
  const tax = (await DB.run(db.from('settings').select('value').eq('key', 'tax').maybeSingle())).data;
  const defaultGst = tax && tax.value && tax.value.default_gst_percent != null ? tax.value.default_gst_percent : 18;
  const fields = [
    { name: 'name', label: 'Product name', required: true, full: true },
    { name: 'sku', label: 'SKU', required: true },
    { name: 'category_id', label: 'Category', type: 'select', options: cats.map(c => ({ value: c.id, label: c.name })) },
    { name: 'mrp', label: 'MRP', type: 'number', min: 0, required: true, default: 0 },
    { name: 'selling_price', label: 'Selling price', type: 'number', min: 0, required: true, default: 0 },
    { name: 'cost_price', label: 'Cost price', type: 'number', min: 0, required: true, default: 0, hint: 'Used when stock has no batch cost.' },
    { name: 'gst_percent', label: 'GST %', type: 'number', min: 0, max: 100, required: true, default: defaultGst },
    { name: 'hsn_code', label: 'HSN/SAC' },
    { name: 'minimum_stock', label: 'Minimum stock', type: 'number', min: 0, integer: true, required: true, default: 10 },
    { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], default: 'active', required: true },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'image', label: 'Product image', type: 'file', bucket: 'product-images', storeAs: 'image_path', full: true }
  ];

  async function detail(p) {
    const [stats, batches, hist, img] = await Promise.all([
      DB.rpc('product_stats', { p_product: p.id }),
      DB.run(db.from('v_batches').select('*').eq('product_id', p.id).order('created_at', { ascending: false })),
      DB.run(db.from('v_stock_history').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(15)),
      Files.url('product-images', p.image_path)
    ]);
    const kv = (k, v) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><strong>${v}</strong></div>`;
    UI.modal({
      title: p.name, drawer: true,
      body: `${img ? `<img src="${img}" alt="" style="max-width:100%;max-height:200px;margin-bottom:16px;border:1px solid var(--line)">` : ''}
        ${kv('Product ID', UI.esc(p.product_code))}${kv('SKU', UI.esc(p.sku))}${kv('Category', UI.esc(p.category_name || '-'))}
        ${kv('MRP / Selling / Cost', `${UI.money(p.mrp)} / ${UI.money(p.selling_price)} / ${UI.money(p.cost_price)}`)}
        ${kv('GST / HSN', `${p.gst_percent}% / ${UI.esc(p.hsn_code || '-')}`)}
        ${kv('Current stock', UI.num(p.current_stock) + (p.is_low_stock ? ' (low)' : ''))}${kv('Stock value', UI.money(p.stock_value))}
        ${kv('Units sold', UI.num(stats.units))}${kv('Revenue', UI.money(stats.revenue))}${kv('COGS', UI.money(stats.cogs))}${kv('Profit', UI.money(stats.profit))}
        <h3 style="margin:20px 0 8px">Batches</h3>
        ${Table.html([{ key: 'batch_number', label: 'Batch' }, { label: 'Expiry', render: r => UI.date(r.expiry_date) }, { key: 'quantity_remaining', label: 'Left', num: true }, { label: 'Status', render: r => Table.tag(r.status, r.status !== 'Active') }], batches.data, { empty: 'No batches yet' })}
        <h3 style="margin:20px 0 8px">Recent stock history</h3>
        ${Table.html([{ label: 'Date', render: r => UI.date(r.created_at) }, { key: 'transaction_type', label: 'Type' }, { key: 'quantity', label: 'Qty', num: true }], hist.data, { empty: 'No stock movement yet' })}`
    });
  }

  Crud({
    el: content, table: 'products', source: 'v_products', entity: 'Product', title: 'All products',
    search: ['name', 'sku', 'product_code'], order: { col: 'name', asc: true },
    filters: [{ name: 'category_id', label: 'All categories', options: cats.map(c => ({ value: c.id, label: c.name })) },
              { name: 'status', label: 'All statuses', options: ['active', 'inactive'] }],
    columns: [
      { key: 'product_code', label: 'ID' }, { key: 'name', label: 'Product', sort: 'name' }, { key: 'sku', label: 'SKU', sort: 'sku' },
      { key: 'category_name', label: 'Category' },
      { label: 'Price', num: true, render: r => UI.money(r.selling_price) },
      { label: 'Stock', num: true, render: r => `${UI.num(r.current_stock)}${r.is_low_stock ? ' ' + Table.tag('Low', true) : ''}` },
      { label: 'Status', render: r => Table.tag(r.status, r.status === 'active') }
    ],
    exportColumns: [['product_code', 'Product ID'], ['name', 'Name'], ['sku', 'SKU'], ['category_name', 'Category'], ['mrp', 'MRP'], ['selling_price', 'Selling Price'],
      ['cost_price', 'Cost Price'], ['gst_percent', 'GST %'], ['hsn_code', 'HSN'], ['current_stock', 'Current Stock'], ['stock_value', 'Stock Value'], ['status', 'Status']].map(([key, label]) => ({ key, label })),
    exportName: 'products', fields,
    rowActions: [{ label: 'View', fn: p => detail(p).catch(e => UI.toast(e.message, 'error')) }],
    onRowClick: p => detail(p).catch(e => UI.toast(e.message, 'error')),
    beforeSave: async (v) => {
      if (v.selling_price > v.mrp && v.mrp > 0) throw new Error('Selling price cannot be higher than MRP.');
      v.sku = v.sku.toUpperCase();
      return v;
    }
  });
})();
