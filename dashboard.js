(async () => {
  const profile = await Auth.require();
  if (!profile) return;
  const admin = Auth.isAdmin(profile);
  const content = UI.layout(profile, 'Dashboard');
  if (new URLSearchParams(location.search).has('denied')) UI.toast('You do not have access to that page.', 'error');

  content.innerHTML = `
    <div class="page-head"><div><h2>Business overview</h2><span class="muted" id="rangeText"></span></div><div id="range" class="toolbar"></div></div>
    <div id="dash">${UI.loading()}</div>`;

  const kpi = (label, value) => `<div class="kpi"><div class="label">${label}</div><div class="kpi-value">${value}</div></div>`;
  const groupFor = (from, to) => { const d = (new Date(to) - new Date(from)) / 864e5; return d <= 31 ? 'day' : d <= 120 ? 'week' : d <= 800 ? 'month' : 'quarter'; };
  const label = (p, g) => { const d = new Date(p + 'T00:00:00'); return g === 'month' ? d.toLocaleDateString('en-IN', { month: 'short' }) : g === 'quarter' ? 'Q' + (Math.floor(d.getMonth() / 3) + 1) : d.getDate() + '/' + (d.getMonth() + 1); };

  function bars(series, g, both) {
    const max = Math.max(1, ...series.map(s => Math.max(s.revenue, both ? s.expenses : 0)));
    return `<div class="bars" role="img" aria-label="Chart">${series.map(s => `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:6px" title="${label(s.period, g)}: ${UI.money(s.revenue)}${both ? ' revenue, ' + UI.money(s.expenses) + ' expenses' : ''}">
        <div style="display:flex;gap:2px;align-items:flex-end;height:100%">
          <div class="bar" style="height:${(s.revenue / max) * 100}%"></div>
          ${both ? `<div class="bar alt" style="height:${(s.expenses / max) * 100}%"></div>` : ''}</div></div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:6px;color:var(--muted);font-size:11px">${series.map(s => `<span style="flex:1;text-align:center;overflow:hidden">${series.length > 16 ? '' : label(s.period, g)}</span>`).join('')}</div>
      ${both ? `<div class="muted" style="margin-top:10px;font-size:12px"><span style="display:inline-block;width:10px;height:10px;background:#000;margin-right:4px"></span>Revenue <span style="display:inline-block;width:10px;height:10px;background:var(--line-strong);margin:0 4px 0 12px"></span>Expenses</div>` : ''}`;
  }

  async function load({ from, to }) {
    const box = document.getElementById('dash');
    document.getElementById('rangeText').textContent = `${UI.date(from)} to ${UI.date(to)}`;
    box.innerHTML = UI.loading();
    try {
      const g = groupFor(from, to);
      const [sum, series, top, recent, low, rexp] = await Promise.all([
        DB.rpc('dashboard_summary', { p_from: from, p_to: to }),
        DB.rpc('revenue_expense_series', { p_from: from, p_to: to, p_group: g }),
        DB.rpc('top_products', { p_from: from, p_to: to, p_limit: 5 }),
        DB.run(db.from('v_sales').select('*').order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(6)),
        DB.run(db.from('v_products').select('name,sku,current_stock,minimum_stock').eq('is_low_stock', true).eq('status', 'active').order('current_stock').limit(6)),
        admin ? DB.run(db.from('v_expenses').select('*').order('expense_date', { ascending: false }).limit(6)) : Promise.resolve({ data: [] })
      ]);
      const topMax = Math.max(1, ...top.map(t => Number(t.revenue)));
      box.innerHTML = `
        <div class="grid grid-kpi">
          ${kpi('Total Revenue', UI.money(sum.revenue))}
          ${admin ? kpi('Total Expenses', UI.money(sum.expenses)) : ''}
          ${kpi('Gross Profit', UI.money(sum.gross_profit))}
          ${admin ? kpi('Net Profit', UI.money(sum.net_profit)) : ''}
          ${admin ? kpi('Total Investment', UI.money(sum.total_investment)) : ''}
          ${kpi('Inventory Value', UI.money(sum.inventory_value))}
          ${kpi('Units Sold', UI.num(sum.units_sold))}
          ${kpi('Low Stock', UI.num(sum.low_stock))}
        </div>
        <div class="grid grid-2" style="margin-top:16px">
          <div class="panel"><div class="panel-head"><h2>Sales overview</h2><span class="muted">${UI.num(sum.orders)} orders, ${UI.money(sum.billed)} billed, ${UI.money(sum.billed - sum.paid)} pending</span></div>
            <div class="panel-body">${series.length ? bars(series, g, false) : UI.empty('No sales in this period')}</div></div>
          ${admin ? `<div class="panel"><div class="panel-head"><h2>Revenue vs expenses</h2></div><div class="panel-body">${series.length ? bars(series, g, true) : UI.empty('No data')}</div></div>` : ''}
          <div class="panel"><div class="panel-head"><h2>Top products</h2></div><div class="panel-body">
            ${top.length ? top.map(t => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between"><span>${UI.esc(t.name)}</span><strong>${UI.money(t.revenue)}</strong></div>
              <div style="background:var(--wash);height:6px;margin-top:4px"><div style="background:#000;height:6px;width:${(t.revenue / topMax) * 100}%"></div></div><span class="muted" style="font-size:12px">${UI.num(t.units)} units</span></div>`).join('') : UI.empty('No sales in this period')}</div></div>
          <div class="panel"><div class="panel-head"><h2>Low stock</h2><a href="inventory.html?view=low">View all</a></div>
            ${Table.html([{ key: 'name', label: 'Product' }, { key: 'current_stock', label: 'In stock', num: true }, { key: 'minimum_stock', label: 'Minimum', num: true }], low.data, { empty: 'All products are above minimum stock' })}</div>
          <div class="panel"><div class="panel-head"><h2>Recent sales</h2><a href="sales.html">View all</a></div>
            ${Table.html([{ label: 'Invoice', render: r => UI.esc(r.invoice_number || '') }, { key: 'customer_name', label: 'Customer' }, { label: 'Date', render: r => UI.date(r.sale_date) }, { label: 'Total', num: true, render: r => UI.money(r.grand_total) }], recent.data, { empty: 'No sales yet' })}</div>
          ${admin ? `<div class="panel"><div class="panel-head"><h2>Recent expenses</h2><a href="expenses.html">View all</a></div>
            ${Table.html([{ key: 'description', label: 'Description' }, { key: 'category_name', label: 'Category' }, { label: 'Date', render: r => UI.date(r.expense_date) }, { label: 'Amount', num: true, render: r => UI.money(r.amount) }], rexp.data, { empty: 'No expenses yet' })}</div>` : ''}
        </div>`;
    } catch (e) { box.innerHTML = UI.error(e.message); }
  }

  const rc = Range.control(document.getElementById('range'), load, 'month');
  load(rc.current());
})();
