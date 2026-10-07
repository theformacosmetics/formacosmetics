// Shared UI: layout (sidebar + header), toast, modal, confirm, formatting.
const NAV = [
  { label: 'Dashboard', href: 'dashboard.html' },
  { label: 'Sales', children: [
    { label: 'New Sale', href: 'sales.html?view=new' },
    { label: 'All Sales', href: 'sales.html' },
    { label: 'Invoices', href: 'sales.html?view=invoices' } ] },
  { label: 'Customers', href: 'customers.html' },
  { label: 'Products', children: [
    { label: 'All Products', href: 'products.html' },
    { label: 'Categories', href: 'products.html?view=categories' } ] },
  { label: 'Inventory', children: [
    { label: 'Stock Overview', href: 'inventory.html' },
    { label: 'Stock In', href: 'inventory.html?view=in' },
    { label: 'Stock Out', href: 'inventory.html?view=out' },
    { label: 'Stock History', href: 'inventory.html?view=history' },
    { label: 'Low Stock', href: 'inventory.html?view=low' },
    { label: 'Expiry', href: 'inventory.html?view=expiry' } ] },
  { label: 'Manufacturing', admin: true, children: [
    { label: 'Production Batches', href: 'manufacturing.html' },
    { label: 'Manufacturing Costs', href: 'manufacturing.html?view=costs' } ] },
  { label: 'Expenses', admin: true, children: [
    { label: 'All Expenses', href: 'expenses.html' },
    { label: 'Add Expense', href: 'expenses.html?view=new' },
    { label: 'Categories', href: 'expenses.html?view=categories' } ] },
  { label: 'Investments', admin: true, children: [
    { label: 'Investments', href: 'investments.html' },
    { label: 'Partners', href: 'investments.html?view=partners' },
    { label: 'Transactions', href: 'investments.html?view=transactions' } ] },
  { label: 'Profit & Loss', href: 'profit-loss.html', admin: true },
  { label: 'Reports', href: 'reports.html' },
  { label: 'Settings', href: 'settings.html', admin: true }
];

const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const L = () => window.FORMA_CONFIG.LOCALE;
  const money = n => new Intl.NumberFormat(L(), { style: 'currency', currency: window.FORMA_CONFIG.CURRENCY, maximumFractionDigits: 2 }).format(Number(n || 0));
  const num = n => new Intl.NumberFormat(L()).format(Number(n || 0));
  const date = d => d ? new Date(d).toLocaleDateString(L(), { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  function layout(profile, title) {
    const file = location.pathname.split('/').pop();
    const here = file + location.search;
    const isActive = i => here === i.href || (!location.search && i.href === file);
    const link = i => `<a class="nav-link ${isActive(i) ? 'active' : ''}" href="${i.href}">${esc(i.label)}</a>`;
    const items = NAV.filter(i => !i.admin || profile.role === 'admin').map(i => i.children
      ? `<details class="nav-group" ${i.children.some(c => c.href.split('?')[0] === file) ? 'open' : ''}>
           <summary>${esc(i.label)}</summary><div class="nav-sub">${i.children.map(link).join('')}</div></details>`
      : link(i)).join('');
    document.getElementById('app').innerHTML = `
      <aside class="sidebar"><div class="brand">FORMA</div><nav>${items}</nav></aside>
      <div class="main">
        <header class="header">
          <button class="btn btn-outline btn-sm menu-toggle" id="menuBtn" aria-label="Open menu">Menu</button>
          <h1>${esc(title)}</h1>
          <span class="muted">${esc(profile.full_name || profile.email)} (${esc(profile.role)})</span>
          <button class="btn btn-outline btn-sm" id="logoutBtn">Log out</button>
        </header>
        <main class="content" id="content"></main>
      </div>`;
    document.getElementById('menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    document.body.addEventListener('click', e => { if (e.target === document.body) document.body.classList.remove('nav-open'); });
    document.getElementById('logoutBtn').onclick = Auth.logout;
    return document.getElementById('content');
  }

  function toast(msg, type = 'info') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'error' ? 'error' : ''); t.textContent = msg;
    box.appendChild(t); setTimeout(() => t.remove(), 4000);
  }

  function modal({ title, body, footer = '', drawer = false }) {
    const o = document.createElement('div');
    o.className = 'overlay' + (drawer ? ' drawer' : '');
    o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-sm" data-close>Close</button></div>
      <div class="modal-body"></div><div class="modal-foot">${footer}</div></div>`;
    const b = o.querySelector('.modal-body');
    typeof body === 'string' ? b.innerHTML = body : b.appendChild(body);
    const close = () => o.remove();
    o.addEventListener('click', e => { if (e.target === o || e.target.hasAttribute('data-close')) close(); });
    document.body.appendChild(o);
    return { el: o, close };
  }

  function confirm(message, okLabel = 'Delete') {
    return new Promise(res => {
      const m = modal({ title: 'Please confirm', body: `<p>${esc(message)}</p>`,
        footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn" id="okBtn">${esc(okLabel)}</button>` });
      m.el.querySelector('#okBtn').onclick = () => { m.close(); res(true); };
      m.el.addEventListener('click', e => { if (e.target.hasAttribute('data-close') || e.target === m.el) res(false); });
    });
  }

  const loading = () => `<div class="state"><span class="spinner"></span></div>`;
  const empty = (t, s = '') => `<div class="state"><strong>${esc(t)}</strong>${esc(s)}</div>`;
  const error = (m) => `<div class="state"><strong>Something went wrong</strong>${esc(m)}</div>`;

  return { esc, money, num, date, layout, toast, modal, confirm, loading, empty, error };
})();
