// Profit & Loss: Revenue - COGS = Gross Profit; Gross Profit - Operating Expenses = Net Profit.
// Investments are capital and never appear here.
(async () => {
  const profile = await Auth.require(['admin']);
  if (!profile) return;
  const content = UI.layout(profile, 'Profit & Loss');
  content.innerHTML = `<div class="page-head"><div><h2>Profit and loss statement</h2><span class="muted" id="plRange"></span></div>
    <div class="toolbar"><span id="plRangeSel" class="toolbar"></span>
    <select class="select" style="width:auto" id="plGroup"><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select>
    <button class="btn btn-outline" id="plCsv">Export CSV</button><button class="btn btn-outline" id="plPrint">Print</button></div></div><div id="plBody">${UI.loading()}</div>`;
  const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '-';
  let last = null;

  async function load({ from, to }) {
    const body = document.getElementById('plBody'), group = document.getElementById('plGroup').value;
    document.getElementById('plRange').textContent = `${UI.date(from)} to ${UI.date(to)}`;
    body.innerHTML = UI.loading();
    try {
      const [s, series, cats] = await Promise.all([
        DB.rpc('dashboard_summary', { p_from: from, p_to: to }),
        DB.rpc('revenue_expense_series', { p_from: from, p_to: to, p_group: group }),
        DB.rpc('expense_breakdown', { p_from: from, p_to: to })
      ]);
      last = { s, series, cats, from, to, group };
      const line = (label, val, strong, sub) => `<tr><td style="${strong ? 'font-weight:700' : ''}${sub ? ';padding-left:32px;color:var(--muted)' : ''}">${label}</td><td class="num" style="${strong ? 'font-weight:700' : ''}">${val}</td></tr>`;
      const pLabel = p => { const d = new Date(p + 'T00:00:00'); return group === 'year' ? d.getFullYear() : group === 'quarter' ? `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}` : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };
      body.innerHTML = `
        <div class="grid grid-2">
          <div class="panel"><table class="table"><tbody>
            ${line('Revenue (excluding GST)', UI.money(s.revenue), true)}
            ${line('Cost of goods sold', '- ' + UI.money(s.cogs))}
            ${line('Gross profit', UI.money(s.gross_profit), true)}
            ${line('Gross margin', pct(s.gross_profit, s.revenue), false, true)}
            ${line('Operating expenses', '- ' + UI.money(s.expenses))}
            ${line('Net profit', UI.money(s.net_profit), true)}
            ${line('Net margin', pct(s.net_profit, s.revenue), false, true)}
          </tbody></table></div>
          <div class="panel"><div class="panel-head"><h2>Operating expenses by category</h2></div>
            ${Table.html([{ key: 'category', label: 'Category' }, { label: 'Amount', num: true, render: r => UI.money(r.total) }, { label: '% of expenses', num: true, render: r => pct(r.total, s.expenses) }], cats, { empty: 'No expenses in this period' })}</div>
        </div>
        <p class="muted" style="margin:12px 0">GST collected (${UI.money(s.gst)}) is a tax liability and is not counted as revenue. Partner investments are capital and are not counted as expenses.</p>
        <div class="panel"><div class="panel-head"><h2>By period</h2></div>
          ${Table.html([{ label: 'Period', render: r => pLabel(r.period) }, { label: 'Revenue', num: true, render: r => UI.money(r.revenue) }, { label: 'COGS', num: true, render: r => UI.money(r.cogs) },
            { label: 'Gross profit', num: true, render: r => UI.money(r.revenue - r.cogs) }, { label: 'Expenses', num: true, render: r => UI.money(r.expenses) },
            { label: 'Net profit', num: true, render: r => `<strong>${UI.money(r.revenue - r.cogs - r.expenses)}</strong>` }], series, { empty: 'No data' })}</div>`;
    } catch (e) { body.innerHTML = UI.error(e.message); }
  }

  const rc = Range.control(document.getElementById('plRangeSel'), load, 'month',
    { month: 'This Month', lastmonth: 'Last Month', quarter: 'This Quarter', year: 'This Year', lastyear: 'Last Year', custom: 'Custom Range' });
  document.getElementById('plGroup').onchange = () => { const r = rc.current(); if (r.from && r.to) load(r); };
  document.getElementById('plPrint').onclick = () => window.print();
  document.getElementById('plCsv').onclick = () => {
    if (!last) return; const { s, series, from, to } = last;
    Export.csv(`profit-loss-${from}-to-${to}`, [
      { Item: 'Revenue', Amount: s.revenue }, { Item: 'COGS', Amount: s.cogs }, { Item: 'Gross Profit', Amount: s.gross_profit },
      { Item: 'Operating Expenses', Amount: s.expenses }, { Item: 'Net Profit', Amount: s.net_profit }, {}, ...series.map(r => ({ Item: r.period, Amount: r.revenue - r.cogs - r.expenses }))]
      .filter(r => r.Item !== undefined), [{ key: 'Item', label: 'Item' }, { key: 'Amount', label: 'Amount' }]);
  };
  load(rc.current());
})();
