(async () => {
  const profile = await Auth.require(['admin']);
  if (!profile) return;
  const view = new URLSearchParams(location.search).get('view') || 'main';
  const content = UI.layout(profile, view === 'categories' ? 'Expense Categories' : view === 'new' ? 'Add Expense' : 'Expenses');
  const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'];

  if (view === 'categories') {
    Crud({ el: content, table: 'expense_categories', entity: 'Category', title: 'Expense categories', search: ['name'], order: { col: 'name', asc: true },
      columns: [{ key: 'name', label: 'Name', sort: 'name' }], fields: [{ name: 'name', label: 'Name', required: true }], exportName: 'expense-categories' });
    return;
  }

  const cats = (await DB.run(db.from('expense_categories').select('id,name').order('name'))).data;
  const catOpts = cats.map(c => ({ value: c.id, label: c.name }));
  const crud = Crud({
    el: content, table: 'expenses', source: 'v_expenses', entity: 'Expense', title: 'Operating expenses', stampUser: true,
    search: ['description', 'vendor', 'expense_code', 'category_name'], dateCol: 'expense_date', order: { col: 'expense_date', asc: false },
    filters: [{ name: 'category_id', label: 'All categories', options: catOpts }, { name: 'payment_method', label: 'All payment methods', options: METHODS }],
    columns: [{ key: 'expense_code', label: 'ID' }, { label: 'Date', sort: 'expense_date', render: r => UI.date(r.expense_date) }, { key: 'category_name', label: 'Category' },
      { key: 'description', label: 'Description' }, { key: 'vendor', label: 'Vendor' }, { key: 'payment_method', label: 'Method' },
      { label: 'Amount', num: true, sort: 'amount', render: r => UI.money(r.amount) },
      { label: 'Receipt', render: r => r.receipt_path ? `<button class="btn btn-ghost btn-sm" data-receipt="${UI.esc(r.receipt_path)}">View</button>` : '' }],
    exportColumns: [['expense_code', 'Expense ID'], ['expense_date', 'Date'], ['category_name', 'Category'], ['description', 'Description'], ['amount', 'Amount'], ['payment_method', 'Payment Method'], ['vendor', 'Vendor'], ['notes', 'Notes']].map(([key, label]) => ({ key, label })),
    exportName: 'expenses',
    fields: [
      { name: 'expense_date', label: 'Date', type: 'date', required: true, default: today() },
      { name: 'category_id', label: 'Category', type: 'select', required: true, options: catOpts },
      { name: 'description', label: 'Description', required: true, full: true },
      { name: 'amount', label: 'Amount', type: 'number', min: 0.01, required: true },
      { name: 'payment_method', label: 'Payment method', type: 'select', options: METHODS },
      { name: 'vendor', label: 'Vendor' },
      { name: 'receipt', label: 'Receipt', type: 'file', bucket: 'receipts', storeAs: 'receipt_path' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ],
    beforeSave: v => { if (v.expense_date > today()) throw new Error('Expense date cannot be in the future.'); return v; }
  });
  content.addEventListener('click', async e => {
    const b = e.target.closest('[data-receipt]'); if (!b) return;
    const url = await Files.url('receipts', b.dataset.receipt);
    url ? window.open(url, '_blank', 'noopener') : UI.toast('Could not open the receipt.', 'error');
  });
  if (view === 'new') crud.openForm(null);
})();
