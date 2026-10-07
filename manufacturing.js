(async () => {
  const profile = await Auth.require(['admin']);
  if (!profile) return;
  const view = new URLSearchParams(location.search).get('view') || 'main';
  const content = UI.layout(profile, view === 'costs' ? 'Manufacturing Costs' : 'Production Batches');
  const asExport = pairs => pairs.map(([key, label]) => ({ key, label }));
  const products = (await DB.run(db.from('products').select('id,name').order('name'))).data;
  const prodOpts = products.map(p => ({ value: p.id, label: p.name }));

  const common = {
    table: 'manufacturing_batches', source: 'v_manufacturing', entity: 'Production', search: ['product_name', 'batch_number', 'production_code', 'manufacturer'],
    dateCol: 'manufacturing_date', order: { col: 'manufacturing_date', asc: false },
    filters: [{ name: 'product_id', label: 'All products', options: prodOpts }, { name: 'status', label: 'All statuses', options: ['planned', 'completed', 'cancelled'] }]
  };

  if (view === 'costs') {
    content.innerHTML = `<div class="grid grid-kpi" id="mKpi" style="margin-bottom:16px"></div><div id="mList"></div>`;
    Crud({ ...common, el: content.querySelector('#mList'), title: 'Cost breakdown per batch', canAdd: false, canEdit: false, canDelete: false,
      baseFilter: q => q.neq('status', 'cancelled'),
      columns: [{ key: 'production_code', label: 'ID' }, { key: 'product_name', label: 'Product' }, { key: 'batch_number', label: 'Batch' },
        { label: 'Manufacturing', num: true, render: r => UI.money(r.manufacturing_cost) }, { label: 'Packaging', num: true, render: r => UI.money(r.packaging_cost) },
        { label: 'Shipping', num: true, render: r => UI.money(r.shipping_cost) }, { label: 'Other', num: true, render: r => UI.money(r.other_cost) },
        { label: 'Total', num: true, sort: 'total_batch_cost', render: r => `<strong>${UI.money(r.total_batch_cost)}</strong>` }, { label: 'Per unit', num: true, render: r => UI.money(r.cost_per_unit) }],
      exportColumns: asExport([['production_code', 'Production ID'], ['product_name', 'Product'], ['batch_number', 'Batch'], ['manufacturing_cost', 'Manufacturing'], ['packaging_cost', 'Packaging'], ['shipping_cost', 'Shipping'], ['other_cost', 'Other'], ['total_batch_cost', 'Total'], ['cost_per_unit', 'Cost Per Unit']]),
      exportName: 'manufacturing-costs' });
    try {
      const rows = await DB.all(() => db.from('manufacturing_batches').select('total_batch_cost,quantity_produced').eq('status', 'completed'));
      const total = rows.reduce((s, r) => s + Number(r.total_batch_cost), 0), units = rows.reduce((s, r) => s + r.quantity_produced, 0);
      content.querySelector('#mKpi').innerHTML = [['Total manufacturing spend', UI.money(total)], ['Units produced', UI.num(units)], ['Average cost per unit', UI.money(units ? total / units : 0)]]
        .map(([l, v]) => `<div class="kpi"><div class="label">${l}</div><div class="kpi-value">${v}</div></div>`).join('');
    } catch (e) { UI.toast(e.message, 'error'); }
    return;
  }

  const fields = [
    { name: 'product_id', label: 'Product', type: 'select', required: true, options: prodOpts },
    { name: 'batch_number', label: 'Batch number', required: true },
    { name: 'manufacturer', label: 'Manufacturer' },
    { name: 'manufacturing_date', label: 'Manufacturing date', type: 'date', required: true, default: today() },
    { name: 'expiry_date', label: 'Expiry date', type: 'date' },
    { name: 'quantity_produced', label: 'Quantity produced', type: 'number', min: 1, integer: true, required: true },
    { name: 'manufacturing_cost', label: 'Manufacturing cost', type: 'number', min: 0, required: true, default: 0 },
    { name: 'packaging_cost', label: 'Packaging cost', type: 'number', min: 0, default: 0 },
    { name: 'shipping_cost', label: 'Shipping cost', type: 'number', min: 0, default: 0 },
    { name: 'other_cost', label: 'Other cost', type: 'number', min: 0, default: 0 },
    { name: 'status', label: 'Status', type: 'select', options: ['planned', 'completed'], default: 'completed', required: true,
      hint: 'Completed production is added to inventory immediately and can no longer be edited.' },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true }
  ];

  Crud({
    ...common, el: content, title: 'Production batches', stampUser: true, fields,
    guard: {
      edit: r => r.status === 'completed' ? 'Completed production has already added stock and cannot be edited.' : null,
      del: r => r.status === 'completed' ? 'Completed production cannot be deleted because its stock is already in inventory.' : null
    },
    columns: [{ key: 'production_code', label: 'ID' }, { key: 'product_name', label: 'Product', sort: 'product_id' }, { key: 'batch_number', label: 'Batch' },
      { label: 'Date', sort: 'manufacturing_date', render: r => UI.date(r.manufacturing_date) }, { label: 'Qty', num: true, render: r => UI.num(r.quantity_produced) },
      { label: 'Total cost', num: true, render: r => UI.money(r.total_batch_cost) }, { label: 'Per unit', num: true, render: r => UI.money(r.cost_per_unit) },
      { label: 'Expiry', render: r => UI.date(r.expiry_date) }, { label: 'Status', render: r => Table.tag(r.status, r.status === 'completed') }],
    exportColumns: asExport([['production_code', 'Production ID'], ['product_name', 'Product'], ['batch_number', 'Batch'], ['manufacturer', 'Manufacturer'], ['manufacturing_date', 'Date'], ['quantity_produced', 'Quantity'],
      ['manufacturing_cost', 'Manufacturing Cost'], ['packaging_cost', 'Packaging Cost'], ['shipping_cost', 'Shipping Cost'], ['other_cost', 'Other Cost'], ['total_batch_cost', 'Total Batch Cost'], ['cost_per_unit', 'Cost Per Unit'], ['expiry_date', 'Expiry'], ['status', 'Status']]),
    exportName: 'manufacturing',
    rowActions: [{ label: 'Complete', show: r => r.status === 'planned',
      fn: async (r, reload) => {
        if (!(await UI.confirm(`Complete ${r.batch_number}? ${r.quantity_produced} units will be added to inventory.`, 'Complete'))) return;
        try { await DB.run(db.from('manufacturing_batches').update({ status: 'completed' }).eq('id', r.id)); UI.toast('Production completed. Stock added.'); reload(); }
        catch (e) { UI.toast(e.message, 'error'); }
      } }],
    onForm: root => {
      const total = document.createElement('div');
      total.className = 'panel-body'; total.style.cssText = 'border:1px solid var(--line);margin-top:16px';
      root.querySelector('.modal-body').appendChild(total);
      const calc = () => {
        const n = k => Number(root.querySelector(`[name=${k}]`).value) || 0;
        const sum = n('manufacturing_cost') + n('packaging_cost') + n('shipping_cost') + n('other_cost'), q = n('quantity_produced');
        total.innerHTML = `Total batch cost <strong>${UI.money(sum)}</strong> &nbsp; Cost per unit <strong>${q > 0 ? UI.money(sum / q) : '-'}</strong>`;
      };
      root.addEventListener('input', calc); calc();
    },
    beforeSave: v => {
      if (v.expiry_date && v.expiry_date <= v.manufacturing_date) throw new Error('Expiry date must be after the manufacturing date.');
      ['packaging_cost', 'shipping_cost', 'other_cost'].forEach(k => { if (v[k] == null) v[k] = 0; });
      return v;
    }
  });
})();
