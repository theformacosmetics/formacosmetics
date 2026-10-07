// Investments (capital contributed by partners; never an expense) + ledger transactions
(async () => {
  const profile = await Auth.require(['admin']);
  if (!profile) return;
  const view = new URLSearchParams(location.search).get('view') || 'main';
  const titles = { main: 'Investments', partners: 'Partners', transactions: 'Transactions' };
  const content = UI.layout(profile, titles[view] || 'Investments');
  const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'];
  const exp = pairs => pairs.map(([key, label]) => ({ key, label }));

  if (view === 'partners') return Partners.render(content);

  const partners = (await DB.run(db.from('partners').select('id,name').order('name'))).data;
  const pOpts = partners.map(p => ({ value: p.id, label: p.name }));

  if (view === 'transactions') {
    Crud({ el: content, table: 'partner_transactions', source: 'v_partner_ledger', entity: 'Transaction', title: 'Partner transactions', canAdd: false, canEdit: false, canDelete: false,
      search: ['partner_name', 'notes'], dateCol: 'transaction_date', order: { col: 'transaction_date', asc: false },
      filters: [{ name: 'partner_id', label: 'All partners', options: pOpts }, { name: 'transaction_type', label: 'All types', options: ['Investment', 'Withdrawal', 'Profit Share', 'Adjustment'] }],
      columns: [{ label: 'Date', sort: 'transaction_date', render: r => UI.date(r.transaction_date) }, { key: 'partner_name', label: 'Partner' }, { key: 'transaction_type', label: 'Transaction' },
        { label: 'Money in', num: true, render: r => r.amount_in > 0 ? UI.money(r.amount_in) : '' }, { label: 'Money out', num: true, render: r => r.amount_out > 0 ? UI.money(r.amount_out) : '' }, { key: 'notes', label: 'Notes' }],
      exportColumns: exp([['transaction_date', 'Date'], ['partner_name', 'Partner'], ['transaction_type', 'Transaction'], ['amount_in', 'Money In'], ['amount_out', 'Money Out'], ['notes', 'Notes']]), exportName: 'partner-transactions' });
    return;
  }

  Crud({
    el: content, table: 'investments', source: 'v_investments', entity: 'Investment', title: 'Investments (capital, not expenses)', stampUser: true,
    search: ['partner_name', 'investment_code', 'notes'], dateCol: 'investment_date', order: { col: 'investment_date', asc: false },
    filters: [{ name: 'partner_id', label: 'All partners', options: pOpts }, { name: 'investment_type', label: 'All types', options: ['Initial Capital', 'Additional Investment', 'Loan', 'Other'] }],
    columns: [{ key: 'investment_code', label: 'ID' }, { label: 'Date', sort: 'investment_date', render: r => UI.date(r.investment_date) }, { key: 'partner_name', label: 'Partner' },
      { key: 'investment_type', label: 'Type' }, { key: 'payment_method', label: 'Method' }, { label: 'Amount', num: true, sort: 'amount', render: r => UI.money(r.amount) }],
    exportColumns: exp([['investment_code', 'Investment ID'], ['investment_date', 'Date'], ['partner_name', 'Partner'], ['investment_type', 'Type'], ['payment_method', 'Payment Method'], ['amount', 'Amount'], ['notes', 'Notes']]), exportName: 'investments',
    fields: [
      { name: 'investment_date', label: 'Date', type: 'date', required: true, default: today() },
      { name: 'partner_id', label: 'Partner', type: 'select', required: true, options: pOpts, hint: partners.length ? '' : 'Add a partner first under Partners.' },
      { name: 'amount', label: 'Amount', type: 'number', min: 0.01, required: true },
      { name: 'investment_type', label: 'Investment type', type: 'select', required: true, options: ['Initial Capital', 'Additional Investment', 'Loan', 'Other'], default: 'Initial Capital' },
      { name: 'payment_method', label: 'Payment method', type: 'select', options: METHODS },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ]
  });
})();
