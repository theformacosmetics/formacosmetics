// Inventory: overview, stock in/out forms, history, low stock, expiry
(async () => {
  const profile = await Auth.require();
  if (!profile) return;
  const view = new URLSearchParams(location.search).get('view') || 'main';
  const titles = { main: 'Stock Overview', in: 'Stock In', out: 'Stock Out', history: 'Stock History', low: 'Low Stock', expiry: 'Expiry' };
  const content = UI.layout(profile, titles[view] || 'Inventory');
  const noEdit = { canAdd: false, canEdit: false, canDelete: false };

  const batchCols = [
    { key: 'product_name', label: 'Product' }, { key: 'batch_number', label: 'Batch' },
    { label: 'Mfg date', render: r => UI.date(r.manufacturing_date) }, { label: 'Expiry', render: r => UI.date(r.expiry_date), sort: 'expiry_date' },
    { key: 'quantity_remaining', label: 'Remaining', num: true }, { label: 'Cost / unit', num: true, render: r => UI.money(r.cost_per_unit) },
    { label: 'Status', render: r => Table.tag(r.status, r.status !== 'Active') }
  ];
  const asExport = pairs => pairs.map(([key, label]) => ({ key, label }));

  if (view === 'main') {
    content.innerHTML = `<div class="grid grid-kpi" id="invKpi" style="margin-bottom:16px"></div><div id="invList"></div>`;
    Crud({
      el: content.querySelector('#invList'), table: 'products', source: 'v_products', entity: 'Product', title: 'Stock by product', ...noEdit,
      search: ['name', 'sku'], order: { col: 'name', asc: true }, baseFilter: q => q.eq('status', 'active'),
      columns: [{ key: 'name', label: 'Product', sort: 'name' }, { key: 'sku', label: 'SKU' },
        { label: 'Current stock', num: true, sort: 'current_stock', render: r => UI.num(r.current_stock) },
        { label: 'Minimum', num: true, render: r => UI.num(r.minimum_stock) },
        { label: 'Stock value', num: true, sort: 'stock_value', render: r => UI.money(r.stock_value) },
        { label: 'Level', render: r => r.current_stock <= 0 ? Table.tag('Out of stock', true) : r.is_low_stock ? Table.tag('Low', true) : Table.tag('OK') }],
      exportColumns: asExport([['name', 'Product'], ['sku', 'SKU'], ['current_stock', 'Current Stock'], ['minimum_stock', 'Minimum Stock'], ['stock_value', 'Stock Value']]),
      exportName: 'inventory'
    });
    try {
      const [s, b] = await Promise.all([
        DB.rpc('dashboard_summary', { p_from: today(), p_to: today() }),
        DB.run(db.from('v_batches').select('id', { count: 'exact', head: true }).neq('status', 'Active').gt('quantity_remaining', 0))
      ]);
      content.querySelector('#invKpi').innerHTML = [['Inventory value', UI.money(s.inventory_value)], ['Low stock products', UI.num(s.low_stock)], ['Batches expiring or expired', UI.num(b.count)]]
        .map(([l, v]) => `<div class="kpi"><div class="label">${l}</div><div class="kpi-value">${v}</div></div>`).join('');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  else if (view === 'history') {
    Crud({
      el: content, table: 'inventory_transactions', source: 'v_stock_history', entity: 'Transaction', title: 'Stock movement', ...noEdit,
      search: ['product_name', 'batch_number', 'notes'], dateCol: 'created_at', order: { col: 'created_at', asc: false },
      filters: [{ name: 'transaction_type', label: 'All types', options: ['Opening Stock', 'Stock In', 'Sale', 'Return', 'Damage', 'Adjustment', 'Manufacturing', 'Other'] }],
      columns: [{ label: 'Date', sort: 'created_at', render: r => UI.date(r.created_at) }, { key: 'product_name', label: 'Product' }, { key: 'batch_number', label: 'Batch' },
        { key: 'transaction_type', label: 'Type' }, { label: 'Quantity', num: true, render: r => (r.quantity > 0 ? '+' : '') + r.quantity },
        { label: 'Unit cost', num: true, render: r => UI.money(r.unit_cost) }, { key: 'notes', label: 'Notes' }],
      exportColumns: asExport([['created_at', 'Date'], ['product_name', 'Product'], ['batch_number', 'Batch'], ['transaction_type', 'Type'], ['quantity', 'Quantity'], ['unit_cost', 'Unit Cost'], ['notes', 'Notes']]),
      exportName: 'stock-history'
    });
  }

  else if (view === 'low') {
    Crud({
      el: content, table: 'products', source: 'v_products', entity: 'Product', title: 'Products at or below minimum stock', ...noEdit,
      search: ['name', 'sku'], order: { col: 'current_stock', asc: true }, baseFilter: q => q.eq('is_low_stock', true).eq('status', 'active'),
      columns: [{ key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { label: 'In stock', num: true, render: r => UI.num(r.current_stock) },
        { label: 'Minimum', num: true, render: r => UI.num(r.minimum_stock) }, { label: 'To reorder', num: true, render: r => UI.num(Math.max(0, r.minimum_stock - r.current_stock)) }],
      exportColumns: asExport([['name', 'Product'], ['sku', 'SKU'], ['current_stock', 'In Stock'], ['minimum_stock', 'Minimum']]), exportName: 'low-stock'
    });
  }

  else if (view === 'expiry') {
    Crud({
      el: content, table: 'product_batches', source: 'v_batches', entity: 'Batch', title: 'Batches and expiry', ...noEdit,
      search: ['product_name', 'batch_number'], order: { col: 'expiry_date', asc: true },
      filters: [{ name: 'status', label: 'All statuses', options: ['Active', 'Expiring Soon', 'Expired'] }],
      baseFilter: q => q.gt('quantity_remaining', 0), columns: batchCols,
      exportColumns: asExport([['product_name', 'Product'], ['batch_number', 'Batch'], ['manufacturing_date', 'Mfg Date'], ['expiry_date', 'Expiry'], ['quantity_remaining', 'Remaining'], ['status', 'Status']]),
      exportName: 'expiry'
    });
  }

  else { // 'in' | 'out'
    const products = (await DB.run(db.from('v_products').select('id,name,sku,cost_price,current_stock').eq('status', 'active').order('name'))).data;
    const IN = view === 'in';
    const types = IN ? ['Stock In', 'Opening Stock', 'Return', 'Adjustment'] : ['Damage', 'Adjustment', 'Other'];
    const fields = [
      { name: 'product_id', label: 'Product', type: 'select', required: true, options: products.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` })) },
      { name: 'transaction_type', label: IN ? 'Reason' : 'Reason', type: 'select', required: true, options: types, default: types[0] },
      ...(IN ? [
        { name: 'batch_number', label: 'Batch number', hint: 'Leave empty for stock without a batch. A new number creates a new batch.' },
        { name: 'manufacturing_date', label: 'Manufacturing date', type: 'date' },
        { name: 'expiry_date', label: 'Expiry date', type: 'date' },
        { name: 'unit_cost', label: 'Cost per unit', type: 'number', min: 0, hint: 'Defaults to the product cost price.' }
      ] : [{ name: 'batch_id', label: 'Batch', type: 'select', options: [], placeholder: 'No batch' }]),
      { name: 'quantity', label: 'Quantity', type: 'number', min: 1, integer: true, required: true },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ];
    content.innerHTML = `<div class="panel" style="max-width:720px"><div class="panel-head"><h2>${IN ? 'Add stock' : 'Remove stock'}</h2><span class="muted" id="stockNow"></span></div>
      <div class="panel-body"><div id="stockForm">${Form.html(fields)}</div><div style="margin-top:16px"><button class="btn" id="stockSave">${IN ? 'Add stock' : 'Remove stock'}</button></div></div></div>`;
    const root = content.querySelector('#stockForm');
    let batches = [];

    root.querySelector('[name=product_id]').onchange = async e => {
      const p = products.find(x => x.id === e.target.value);
      content.querySelector('#stockNow').textContent = p ? `Current stock: ${UI.num(p.current_stock)}` : '';
      if (IN) { if (p) root.querySelector('[name=unit_cost]').placeholder = String(p.cost_price); return; }
      const sel = root.querySelector('[name=batch_id]');
      batches = p ? (await DB.run(db.from('product_batches').select('id,batch_number,quantity_remaining,cost_per_unit,expiry_date').eq('product_id', p.id).gt('quantity_remaining', 0).order('expiry_date', { nullsFirst: false }))).data : [];
      sel.innerHTML = `<option value="">No batch</option>` + batches.map(b => `<option value="${b.id}">${UI.esc(b.batch_number)} (${b.quantity_remaining} left)</option>`).join('');
    };

    content.querySelector('#stockSave').onclick = async function () {
      const { ok, values: v } = Form.read(root, fields);
      if (!ok) return;
      const p = products.find(x => x.id === v.product_id);
      try {
        if (IN && v.manufacturing_date && v.expiry_date && v.expiry_date <= v.manufacturing_date) throw new Error('Expiry date must be after the manufacturing date.');
        let batchId = null, unitCost = IN ? (v.unit_cost ?? p.cost_price) : p.cost_price, qty = v.quantity;
        if (IN) {
          if (v.batch_number) {
            const ex = await DB.run(db.from('product_batches').select('id,cost_per_unit').eq('product_id', p.id).eq('batch_number', v.batch_number).maybeSingle());
            if (ex.data) { batchId = ex.data.id; if (v.unit_cost == null) unitCost = ex.data.cost_per_unit; }
            else {
              const nb = await DB.run(db.from('product_batches').insert({ batch_number: v.batch_number, product_id: p.id, manufacturing_date: v.manufacturing_date,
                expiry_date: v.expiry_date, quantity_produced: qty, quantity_remaining: 0, manufacturing_cost: +(qty * unitCost).toFixed(2), cost_per_unit: unitCost }).select('id').single());
              batchId = nb.data.id;
            }
          }
        } else {
          qty = -qty; batchId = v.batch_id;
          if (batchId) { const b = batches.find(x => x.id === batchId); unitCost = b.cost_per_unit; if (-qty > b.quantity_remaining) throw new Error(`Batch ${b.batch_number} only has ${b.quantity_remaining} units.`); }
          else if (batches.length) throw new Error('This product has batches in stock. Choose the batch to remove from.');
          if (-qty > p.current_stock) throw new Error(`Only ${p.current_stock} units are in stock.`);
        }
        this.disabled = true;
        await DB.run(db.from('inventory_transactions').insert({ product_id: p.id, batch_id: batchId, transaction_type: v.transaction_type, quantity: qty,
          unit_cost: unitCost, reference_type: 'manual', notes: v.notes, created_by: profile.id }));
        UI.toast(IN ? 'Stock added' : 'Stock removed');
        setTimeout(() => location.reload(), 600);
      } catch (e) { UI.toast(e.message, 'error'); this.disabled = false; }
    };
  }
})();
