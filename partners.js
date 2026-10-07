const Partners = (() => {
  async function ledger(p) {
    const rows = (await DB.run(db.from('partner_transactions').select('*').eq('partner_id', p.id).order('transaction_date').order('created_at'))).data;
    let bal = 0;
    const withBal = rows.map(r => ({ ...r, balance: (bal += Number(r.amount_in) - Number(r.amount_out)) }));
    UI.modal({ title: `${p.name} ledger`, drawer: true, body: Table.html(
      [{ label: 'Date', render: r => UI.date(r.transaction_date) }, { key: 'transaction_type', label: 'Transaction' },
        { label: 'Money in', num: true, render: r => r.amount_in > 0 ? UI.money(r.amount_in) : '' }, { label: 'Money out', num: true, render: r => r.amount_out > 0 ? UI.money(r.amount_out) : '' },
        { label: 'Balance', num: true, render: r => UI.money(r.balance) }], withBal, { empty: 'No transactions yet' }) });
  }

  function withdrawal(p, reload) {
    const fields = [
      { name: 'transaction_date', label: 'Date', type: 'date', required: true, default: today() },
      { name: 'amount', label: 'Amount', type: 'number', min: 0.01, required: true, hint: `Available balance: ${UI.money(p.current_balance)}` },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ];
    const m = UI.modal({ title: `Withdrawal by ${p.name}`, body: Form.html(fields),
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn" id="wSave">Record withdrawal</button>` });
    m.el.querySelector('#wSave').onclick = async e => {
      const { ok, values: v } = Form.read(m.el, fields); if (!ok) return;
      if (v.amount > Number(p.current_balance)) return UI.toast(`A withdrawal cannot be more than the balance of ${UI.money(p.current_balance)}.`, 'error');
      e.target.disabled = true;
      try {
        await DB.run(db.from('partner_transactions').insert({ partner_id: p.id, transaction_date: v.transaction_date, transaction_type: 'Withdrawal', amount_out: v.amount, notes: v.notes, created_by: (await Auth.profile()).id }));
        m.close(); UI.toast('Withdrawal recorded'); reload();
      } catch (err) { UI.toast(err.message, 'error'); e.target.disabled = false; }
    };
  }

  function render(el) {
    Crud({
      el, table: 'partners', source: 'v_partners', entity: 'Partner', title: 'Partners', search: ['name', 'email', 'phone'], order: { col: 'name', asc: true },
      columns: [{ key: 'name', label: 'Partner', sort: 'name' }, { label: 'Ownership', num: true, render: r => r.ownership_percent + '%' },
        { label: 'Initial', num: true, render: r => UI.money(r.initial_investment) }, { label: 'Total invested', num: true, render: r => UI.money(r.total_investment) },
        { label: 'Withdrawals', num: true, render: r => UI.money(r.withdrawals) }, { label: 'Balance', num: true, render: r => UI.money(r.current_balance) }],
      exportColumns: [['name', 'Partner'], ['email', 'Email'], ['phone', 'Phone'], ['ownership_percent', 'Ownership %'], ['initial_investment', 'Initial Investment'], ['total_investment', 'Total Investment'], ['withdrawals', 'Withdrawals'], ['current_balance', 'Current Balance']].map(([key, label]) => ({ key, label })),
      exportName: 'partners',
      fields: [
        { name: 'name', label: 'Partner name', required: true, full: true },
        { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' },
        { name: 'ownership_percent', label: 'Ownership %', type: 'number', min: 0, max: 100, required: true, default: 0 },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true }
      ],
      beforeSave: async (v, row) => {
        const others = (await DB.run(db.from('partners').select('id,ownership_percent'))).data.filter(p => !row || p.id !== row.id);
        const total = others.reduce((s, p) => s + Number(p.ownership_percent), 0) + Number(v.ownership_percent);
        if (total > 100.001) throw new Error(`Total ownership would be ${total}%. It cannot be more than 100%.`);
        return v;
      },
      rowActions: [{ label: 'Ledger', fn: p => ledger(p).catch(e => UI.toast(e.message, 'error')) }, { label: 'Withdraw', fn: (p, reload) => withdrawal(p, reload) }],
      onRowClick: p => ledger(p).catch(e => UI.toast(e.message, 'error'))
    });
  }
  return { render };
})();
