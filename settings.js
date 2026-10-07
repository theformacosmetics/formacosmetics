(async () => {
  const profile = await Auth.require(['admin']);
  if (!profile) return;
  const content = UI.layout(profile, 'Settings');
  const TABS = [['company', 'Company'], ['invoice', 'Invoice'], ['tax', 'Tax'], ['users', 'Users'], ['data', 'Data']];
  let tab = new URLSearchParams(location.search).get('tab') || 'company';

  content.innerHTML = `<div class="toolbar" id="tabs">${TABS.map(([k, l]) => `<button class="btn ${k === tab ? '' : 'btn-outline'}" data-tab="${k}">${l}</button>`).join('')}</div><div id="pane"></div>`;
  content.querySelector('#tabs').onclick = e => {
    const k = e.target.dataset.tab; if (!k) return; tab = k;
    content.querySelectorAll('[data-tab]').forEach(b => b.className = 'btn ' + (b.dataset.tab === k ? '' : 'btn-outline')); show();
  };
  const pane = content.querySelector('#pane');

  const getSettings = async () => Object.fromEntries((await DB.run(db.from('settings').select('*'))).data.map(r => [r.key, r.value]));
  const put = (key, value) => DB.run(db.from('settings').upsert({ key, value }));
  const panel = (title, inner) => `<div class="panel" style="max-width:760px"><div class="panel-head"><h2>${title}</h2></div><div class="panel-body">${inner}</div></div>`;

  async function formTab(title, fields, values, save, extraHtml = '') {
    pane.innerHTML = panel(title, `<div id="sForm">${Form.html(fields, values)}</div>${extraHtml}<div style="margin-top:16px"><button class="btn" id="sSave">Save changes</button></div>`);
    pane.querySelector('#sSave').onclick = async e => {
      const { ok, values: v } = Form.read(pane.querySelector('#sForm'), fields); if (!ok) return;
      e.target.disabled = true;
      try { await save(v); UI.toast('Settings saved'); show(); } catch (err) { UI.toast(err.message, 'error'); e.target.disabled = false; }
    };
  }

  async function show() {
    pane.innerHTML = UI.loading();
    try {
      const s = await getSettings();
      if (tab === 'company') {
        const c = s.company || {}, logo = await Files.url('company', c.logo_path);
        await formTab('Company details', [
          { name: 'name', label: 'Company name', required: true, full: true }, { name: 'address', label: 'Address', type: 'textarea', full: true },
          { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'website', label: 'Website' },
          { name: 'gstin', label: 'GSTIN', pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i, patternMsg: 'GSTIN must be 15 characters, e.g. 24ABCDE1234F1Z5.' },
          { name: 'logo', label: 'Logo (appears on invoices)', type: 'file', full: true }
        ], c, async v => {
          const file = v.logo; delete v.logo;
          v.logo_path = file ? await Files.upload('company', file, 'logo') : c.logo_path || ''; if (v.gstin) v.gstin = v.gstin.toUpperCase();
          await put('company', v);
        }, logo ? `<img src="${logo}" alt="Current logo" style="max-height:60px;margin-top:12px;border:1px solid var(--line);padding:6px">` : '');
      } else if (tab === 'invoice') {
        const i = s.invoice || {}, sign = await Files.url('company', i.signature_path);
        const counters = (await DB.run(db.from('invoice_counters').select('*').order('year', { ascending: false }))).data;
        await formTab('Invoice settings', [
          { name: 'prefix', label: 'Invoice prefix', required: true, pattern: /^[A-Za-z0-9]{2,10}$/, patternMsg: 'Use 2 to 10 letters or numbers.', hint: 'Numbers look like PREFIX-2026-0001 and count up automatically each year.' },
          { name: 'terms', label: 'Terms and conditions', type: 'textarea', full: true }, { name: 'footer', label: 'Footer text', type: 'textarea', full: true },
          { name: 'bank_details', label: 'Bank details', type: 'textarea', full: true }, { name: 'signature', label: 'Signature image', type: 'file', full: true }
        ], { ...i, prefix: s.invoice_prefix || 'FORMA' }, async v => {
          const file = v.signature, prefix = v.prefix.toUpperCase(); delete v.signature; delete v.prefix;
          v.signature_path = file ? await Files.upload('company', file, 'signature') : i.signature_path || '';
          await put('invoice', v); await put('invoice_prefix', prefix);
        }, `${sign ? `<img src="${sign}" alt="Current signature" style="max-height:50px;margin-top:12px;border:1px solid var(--line);padding:6px">` : ''}
          <p class="muted" style="margin-top:12px">Invoices issued: ${counters.length ? counters.map(c => `${c.year}: ${c.last_number}`).join(', ') : 'none yet'}. Numbers never repeat and cannot be edited.</p>`);
      } else if (tab === 'tax') {
        const t = s.tax || {};
        await formTab('Tax defaults', [{ name: 'default_gst_percent', label: 'Default GST % for new products', type: 'number', min: 0, max: 100, required: true, default: 18 }], t, v => put('tax', { ...t, ...v }));
      } else if (tab === 'users') await users();
      else await data();
    } catch (e) { pane.innerHTML = UI.error(e.message); }
  }

  async function users() {
    const rows = (await DB.run(db.from('profiles').select('*').order('created_at'))).data;
    pane.innerHTML = panel('Users and roles', `
      <p class="muted">To add someone, create the user in Supabase under Authentication > Users. They appear here after they are created and you can set their role.</p>
      ${Table.html([{ label: 'Name', render: r => UI.esc(r.full_name || '') }, { key: 'email', label: 'Email' },
        { label: 'Role', render: r => `<select class="select" style="width:auto" data-uid="${r.id}" data-f="role" ${r.id === profile.id ? 'disabled' : ''}><option value="admin" ${r.role === 'admin' ? 'selected' : ''}>Admin</option><option value="staff" ${r.role === 'staff' ? 'selected' : ''}>Staff</option></select>` },
        { label: 'Active', render: r => `<select class="select" style="width:auto" data-uid="${r.id}" data-f="is_active" ${r.id === profile.id ? 'disabled' : ''}><option value="true" ${r.is_active ? 'selected' : ''}>Active</option><option value="false" ${!r.is_active ? 'selected' : ''}>Disabled</option></select>` }], rows)}
      <h3 style="margin:20px 0 8px">Permissions</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>Area</th><th>Admin</th><th>Staff</th></tr></thead><tbody>
        ${[['Sales, invoices, customers, products, inventory', 'Full', 'Create and edit (no delete)'], ['Manufacturing, expenses', 'Full', 'No access'], ['Investments, partners, profit and loss', 'Full', 'No access'], ['Settings, users, backup', 'Full', 'No access'], ['Void a sale', 'Yes', 'No']].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="margin-top:8px">These rules are enforced by the database, not only by this screen.</p>`);
    pane.onchange = async e => {
      const el = e.target.closest('[data-uid]'); if (!el) return;
      const val = el.dataset.f === 'is_active' ? el.value === 'true' : el.value;
      try { await DB.run(db.from('profiles').update({ [el.dataset.f]: val }).eq('id', el.dataset.uid)); UI.toast('User updated'); } catch (err) { UI.toast(err.message, 'error'); show(); }
    };
  }

  async function data() {
    const demo = await Demo.recorded();
    const EXPORTS = [['Sales', 'v_sales'], ['Expenses', 'v_expenses'], ['Investments', 'v_investments'], ['Inventory', 'v_products'], ['Products', 'products'], ['Customers', 'customers'], ['Profit and loss (this year, monthly)', 'pl']];
    pane.innerHTML = `${panel('Export (CSV, opens in Excel or Google Sheets)', `<div class="toolbar">${EXPORTS.map(([l, k]) => `<button class="btn btn-outline" data-exp="${k}">${l}</button>`).join('')}</div>`)}
      <div style="height:16px"></div>${panel('Backup', `<p class="muted">Downloads every table as one JSON file. Uploaded images and PDFs stay in Supabase Storage and are not included.</p><button class="btn" id="backup">Download full backup</button>`)}
      <div style="height:16px"></div>${panel('Demo data', `<p class="muted">${demo ? 'Demo data is loaded. Removing it deletes only the demo records created by this tool.' : 'Adds sample products, customers, batches, sales, invoices, expenses and investments so you can try the system.'}</p>
        ${demo ? '<button class="btn btn-outline" id="demoReset">Remove demo data</button>' : '<button class="btn" id="demoLoad">Load demo data</button>'}<span class="muted" id="demoMsg" style="margin-left:12px"></span>`)}`;
    pane.onclick = async e => {
      const k = e.target.dataset.exp;
      if (k) {
        try {
          let rows;
          if (k === 'pl') { const y = new Date().getFullYear(); rows = (await DB.rpc('revenue_expense_series', { p_from: `${y}-01-01`, p_to: `${y}-12-31`, p_group: 'month' })).map(r => ({ month: r.period, revenue: r.revenue, cogs: r.cogs, gross_profit: r.revenue - r.cogs, expenses: r.expenses, net_profit: r.revenue - r.cogs - r.expenses })); }
          else rows = await DB.all(() => db.from(k).select('*'));
          Export.csv(k === 'pl' ? 'profit-loss' : k.replace('v_', ''), rows);
        } catch (err) { UI.toast(err.message, 'error'); }
      }
      if (e.target.id === 'backup') {
        e.target.disabled = true;
        try {
          const T = ['profiles', 'partners', 'investments', 'partner_transactions', 'customers', 'categories', 'products', 'product_batches', 'inventory_transactions', 'manufacturing_batches', 'sales', 'sale_items', 'invoices', 'invoice_counters', 'expense_categories', 'expenses', 'settings', 'attachments'];
          const out = { exported_at: new Date().toISOString() };
          for (const t of T) out[t] = await DB.all(() => db.from(t).select('*'), 100000);
          Export.json(`forma-backup-${today()}.json`, out); UI.toast('Backup downloaded');
        } catch (err) { UI.toast(err.message, 'error'); } finally { e.target.disabled = false; }
      }
      if (e.target.id === 'demoLoad') {
        e.target.disabled = true; const msg = pane.querySelector('#demoMsg');
        try { await Demo.load(s => { msg.textContent = s + '...'; }); UI.toast('Demo data loaded'); data(); } catch (err) { UI.toast(err.message, 'error'); msg.textContent = ''; e.target.disabled = false; }
      }
      if (e.target.id === 'demoReset') {
        if (!(await UI.confirm('Remove all demo data? Real records you added yourself are not touched.', 'Remove'))) return;
        try { await Demo.reset(); UI.toast('Demo data removed'); data(); } catch (err) { UI.toast(err.message, 'error'); }
      }
    };
  }

  show();
})();
