// Reusable data + UI building blocks: DB helpers, forms, tables, CRUD screen, CSV export,
// file storage, date ranges. Loaded after common.js.

const DB = {
  friendly(err) {
    const m = (err && err.message) || String(err);
    if (!err || !err.code) return m;
    if (err.code === '23505') return 'That value already exists. Use a different one.';
    if (err.code === '23503') return 'This record is used by other records, so it cannot be changed or deleted.';
    if (err.code === '23514') return 'One of the values is outside the allowed range.';
    if (err.code === '23502') return 'A required field is missing.';
    if (err.code === '42501' || /row-level security/i.test(m)) return 'You do not have permission to do this.';
    return m;
  },
  async run(q) {
    const { data, error, count } = await q;
    if (error) throw new Error(DB.friendly(error));
    return { data, count };
  },
  async rpc(name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(DB.friendly(error));
    return data;
  },
  // fetch every row of a query in pages of 1000 (for exports / reports)
  async all(makeQuery, max = 20000) {
    let out = [], from = 0;
    while (from < max) {
      const { data } = await DB.run(makeQuery().range(from, from + 999));
      out = out.concat(data); if (data.length < 1000) break; from += 1000;
    }
    return out;
  }
};

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };

// ---------- CSV / Excel-compatible export ----------
const Export = {
  csv(filename, rows, columns) {
    if (!rows.length) { UI.toast('Nothing to export.', 'error'); return; }
    const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k }));
    const cell = v => { v = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.map(c => cell(c.label)).join(',')]
      .concat(rows.map(r => cols.map(c => cell(c.value ? c.value(r) : r[c.key])).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    Export.download(filename.endsWith('.csv') ? filename : filename + '.csv', blob);
  },
  json(filename, obj) { Export.download(filename, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); },
  download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
};

// ---------- Storage ----------
const Files = {
  MAX: 5 * 1024 * 1024,
  async upload(bucket, file, folder = '') {
    if (file.size > Files.MAX) throw new Error('File is larger than 5 MB.');
    if (!/^(image\/|application\/pdf)/.test(file.type)) throw new Error('Only images and PDFs are allowed.');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${folder ? folder + '/' : ''}${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from(bucket).upload(path, file, { contentType: file.type });
    if (error) throw new Error(DB.friendly(error));
    return path;
  },
  async url(bucket, path, seconds = 3600) {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).createSignedUrl(path, seconds);
    return data ? data.signedUrl : null;
  }
};

// ---------- Forms ----------
const Form = {
  opts(o) { return (o || []).map(x => typeof x === 'object' ? x : { value: x, label: x }); },
  html(fields, v = {}) {
    return `<div class="form-grid">${fields.map(f => {
      const val = v[f.name] ?? f.default ?? '';
      const id = 'f_' + f.name, req = f.required ? ' *' : '';
      let input;
      if (f.type === 'select') {
        input = `<select class="select" id="${id}" name="${f.name}"><option value="">${f.placeholder || 'Select'}</option>${Form.opts(f.options).map(o =>
          `<option value="${UI.esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${UI.esc(o.label)}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        input = `<textarea class="textarea" id="${id}" name="${f.name}" rows="3">${UI.esc(val)}</textarea>`;
      } else if (f.type === 'file') {
        input = `<input class="input" id="${id}" name="${f.name}" type="file" accept="image/*,application/pdf">`;
      } else {
        input = `<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${UI.esc(val)}"
          ${f.step ? `step="${f.step}"` : f.type === 'number' ? 'step="any"' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}>`;
      }
      return `<div class="field ${f.full ? 'full' : ''}" data-field="${f.name}"><label for="${id}">${UI.esc(f.label)}${req}</label>${input}${f.hint ? `<span class="hint">${UI.esc(f.hint)}</span>` : ''}<span class="error"></span></div>`;
    }).join('')}</div>`;
  },
  // validates and returns {ok, values}; files are returned as File objects
  read(root, fields) {
    const values = {}; let ok = true, first = null;
    fields.forEach(f => {
      const wrap = root.querySelector(`[data-field="${f.name}"]`), el = wrap.querySelector('[name]');
      const err = wrap.querySelector('.error'); let msg = '';
      let v = f.type === 'file' ? (el.files[0] || null) : el.value.trim();
      if (f.required && (v === '' || v === null)) msg = `${f.label} is required.`;
      else if (v !== '' && v !== null) {
        if (f.type === 'number') {
          v = Number(v);
          if (!Number.isFinite(v)) msg = `${f.label} must be a number.`;
          else if (f.min != null && v < f.min) msg = `${f.label} must be at least ${f.min}.`;
          else if (f.max != null && v > f.max) msg = `${f.label} must be at most ${f.max}.`;
          else if (f.integer && !Number.isInteger(v)) msg = `${f.label} must be a whole number.`;
        } else if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) msg = 'Enter a valid email address.';
        else if (f.pattern && !f.pattern.test(v)) msg = f.patternMsg || `${f.label} is not valid.`;
      }
      wrap.classList.toggle('invalid', !!msg); err.textContent = msg;
      if (msg) { ok = false; first = first || el; }
      values[f.name] = v === '' ? null : v;
    });
    if (first) first.focus();
    return { ok, values };
  }
};

// ---------- Tables ----------
const Table = {
  html(cols, rows, { empty = 'No records found', sort } = {}) {
    if (!rows.length) return UI.empty(empty, 'Try a different search or add a new record.');
    return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c =>
      `<th class="${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}" ${c.sort ? `data-sort="${c.sort}"` : ''}>${UI.esc(c.label)}${sort && c.sort === sort.col ? (sort.asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-i="${i}">${cols.map(c =>
        `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : UI.esc(c.format ? c.format(r[c.key], r) : r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  },
  tag: (t, solid) => `<span class="tag ${solid ? 'tag-solid' : ''}">${UI.esc(t)}</span>`
};

// ---------- Date range ----------
const Range = {
  presets() {
    const n = new Date(), t = iso(n), dow = (n.getDay() + 6) % 7;
    return {
      today: { from: t, to: t },
      week: { from: addDays(t, -dow), to: addDays(t, 6 - dow) },
      month: { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) },
      year: { from: `${n.getFullYear()}-01-01`, to: `${n.getFullYear()}-12-31` },
      lastmonth: { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) },
      quarter: { from: iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)), to: iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3 + 3, 0)) },
      lastyear: { from: `${n.getFullYear() - 1}-01-01`, to: `${n.getFullYear() - 1}-12-31` },
      all: { from: '2000-01-01', to: '2099-12-31' }
    };
  },
  // renders a range selector into `el`; onChange({from,to})
  control(el, onChange, def = 'month', labels = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', custom: 'Custom Range' }) {
    const P = Range.presets();
    el.innerHTML = `<select class="select" style="width:auto" id="rg">${Object.entries(labels).map(([k, l]) => `<option value="${k}" ${k === def ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span id="rgc" hidden><input class="input" style="width:auto" type="date" id="rgf"> <input class="input" style="width:auto" type="date" id="rgt"></span>`;
    const sel = el.querySelector('#rg'), box = el.querySelector('#rgc'), f = el.querySelector('#rgf'), t = el.querySelector('#rgt');
    const fire = () => {
      if (sel.value === 'custom') {
        box.hidden = false;
        if (f.value && t.value && f.value <= t.value) onChange({ from: f.value, to: t.value });
        else if (f.value && t.value) UI.toast('The start date must be before the end date.', 'error');
      } else { box.hidden = true; onChange(P[sel.value]); }
    };
    sel.onchange = fire; f.onchange = fire; t.onchange = fire;
    return { current: () => (sel.value === 'custom' ? { from: f.value, to: t.value } : P[sel.value]), fire };
  }
};

// ---------- CRUD screen ----------
function Crud(o) {
  const size = window.FORMA_CONFIG.PAGE_SIZE;
  const st = { page: 0, term: '', filters: {}, from: '', to: '', sort: o.order || { col: 'created_at', asc: false }, rows: [], count: 0 };
  const el = o.el;
  el.innerHTML = `
    <div class="page-head"><div><h2>${UI.esc(o.title)}</h2></div><div class="toolbar">${o.canAdd !== false ? `<button class="btn" id="cAdd">Add ${UI.esc(o.entity)}</button>` : ''}</div></div>
    <div class="toolbar">
      <input class="input" style="max-width:260px" id="cSearch" placeholder="Search" type="search">
      ${(o.filters || []).map(f => `<select class="select" style="width:auto" data-filter="${f.name}"><option value="">${UI.esc(f.label)}</option>${Form.opts(f.options).map(x => `<option value="${UI.esc(x.value)}">${UI.esc(x.label)}</option>`).join('')}</select>`).join('')}
      ${o.dateCol ? `<input class="input" style="width:auto" type="date" id="cFrom" aria-label="From date"><input class="input" style="width:auto" type="date" id="cTo" aria-label="To date">` : ''}
      <span style="flex:1"></span><button class="btn btn-outline" id="cExport">Export CSV</button>
    </div>
    <div class="panel"><div id="cBody"></div><div class="pagination" id="cPager"></div></div>`;
  const body = el.querySelector('#cBody'), pager = el.querySelector('#cPager');

  const query = (withCount = true) => {
    let q = db.from(o.source || o.table).select(o.select || '*', withCount ? { count: 'exact' } : undefined);
    if (st.term) {
      const t = st.term.replace(/[,()%*]/g, ' ').trim();
      if (t) q = q.or(o.search.map(c => `${c}.ilike.%${t}%`).join(','));
    }
    Object.entries(st.filters).forEach(([k, v]) => { if (v) { const f = o.filters.find(x => x.name === k); q = q.eq(f.col || k, v); } });
    if (o.dateCol && st.from) q = q.gte(o.dateCol, st.from);
    if (o.dateCol && st.to) q = q.lte(o.dateCol, st.to);
    if (o.baseFilter) q = o.baseFilter(q);
    return q.order(st.sort.col, { ascending: st.sort.asc });
  };

  async function load() {
    body.innerHTML = UI.loading();
    try {
      const { data, count } = await DB.run(query().range(st.page * size, st.page * size + size - 1));
      st.rows = data; st.count = count;
      const cols = o.columns.slice();
      if (o.canEdit !== false || o.canDelete !== false || (o.rowActions || []).length) {
        cols.push({ label: '', render: r => `<div style="display:flex;gap:4px;justify-content:flex-end">
          ${(o.rowActions || []).map((a, i) => (!a.show || a.show(r)) ? `<button class="btn btn-outline btn-sm" data-act="${i}" data-id="${r.id}">${UI.esc(a.label)}</button>` : '').join('')}
          ${o.canEdit !== false ? `<button class="btn btn-outline btn-sm" data-edit="${r.id}">Edit</button>` : ''}
          ${o.canDelete !== false ? `<button class="btn btn-ghost btn-sm" data-del="${r.id}">Delete</button>` : ''}</div>` });
      }
      body.innerHTML = Table.html(cols, data, { empty: `No ${o.entity.toLowerCase()} records yet`, sort: st.sort });
      const pages = Math.max(1, Math.ceil(count / size));
      pager.innerHTML = `<span>${UI.num(count)} record${count === 1 ? '' : 's'}</span><span><button class="btn btn-outline btn-sm" id="pPrev" ${st.page === 0 ? 'disabled' : ''}>Previous</button>
        <span style="margin:0 10px">Page ${st.page + 1} of ${pages}</span><button class="btn btn-outline btn-sm" id="pNext" ${st.page + 1 >= pages ? 'disabled' : ''}>Next</button></span>`;
      pager.querySelector('#pPrev').onclick = () => { st.page--; load(); };
      pager.querySelector('#pNext').onclick = () => { st.page++; load(); };
    } catch (e) { body.innerHTML = UI.error(e.message); }
  }

  async function openForm(row) {
    const fields = typeof o.fields === 'function' ? await o.fields(row) : o.fields;
    const m = UI.modal({
      title: (row ? 'Edit ' : 'Add ') + o.entity, body: Form.html(fields, row || {}),
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn" id="saveBtn">Save</button>`
    });
    if (o.onForm) o.onForm(m.el, row);
    const save = m.el.querySelector('#saveBtn');
    save.onclick = async () => {
      const { ok, values } = Form.read(m.el, fields);
      if (!ok) return;
      save.disabled = true; save.textContent = 'Saving...';
      try {
        const payload = { ...values };
        for (const f of fields) if (f.type === 'file') {
          const file = payload[f.name]; delete payload[f.name];
          if (file) payload[f.storeAs] = await Files.upload(f.bucket, file, f.folder || '');
        }
        const final = o.beforeSave ? await o.beforeSave(payload, row) : payload;
        if (row) await DB.run(db.from(o.table).update(final).eq('id', row.id));
        else { if (o.stampUser) final.created_by = (await Auth.profile()).id; await DB.run(db.from(o.table).insert(final)); }
        m.close(); UI.toast(o.entity + ' saved'); if (o.afterSave) o.afterSave(); load();
      } catch (e) { UI.toast(e.message, 'error'); save.disabled = false; save.textContent = 'Save'; }
    };
  }

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-edit],[data-del],[data-act],[data-sort],tr[data-i]');
    if (!t) return;
    if (t.dataset.sort) { st.sort = { col: t.dataset.sort, asc: st.sort.col === t.dataset.sort ? !st.sort.asc : true }; st.page = 0; return load(); }
    const find = id => st.rows.find(r => r.id === id);
    if (t.dataset.edit) { const r = find(t.dataset.edit), g = o.guard && o.guard.edit && o.guard.edit(r); if (g) return UI.toast(g, 'error'); return openForm(r); }
    if (t.dataset.act) return o.rowActions[+t.dataset.act].fn(find(t.dataset.id), load);
    if (t.dataset.del) {
      const g = o.guard && o.guard.del && o.guard.del(find(t.dataset.del)); if (g) return UI.toast(g, 'error');
      if (!(await UI.confirm(`Delete this ${o.entity.toLowerCase()}? This cannot be undone.`))) return;
      try { await DB.run(db.from(o.table).delete().eq('id', t.dataset.del)); UI.toast(o.entity + ' deleted'); load(); }
      catch (err) { UI.toast(err.message, 'error'); }
    } else if (t.tagName === 'TR' && o.onRowClick && !e.target.closest('button')) o.onRowClick(st.rows[+t.dataset.i], load);
  });

  let timer;
  el.querySelector('#cSearch').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { st.term = e.target.value.trim(); st.page = 0; load(); }, 300); };
  el.querySelectorAll('[data-filter]').forEach(s => s.onchange = () => { st.filters[s.dataset.filter] = s.value; st.page = 0; load(); });
  if (o.dateCol) {
    el.querySelector('#cFrom').onchange = e => { st.from = e.target.value; st.page = 0; load(); };
    el.querySelector('#cTo').onchange = e => { st.to = e.target.value; st.page = 0; load(); };
  }
  const add = el.querySelector('#cAdd'); if (add) add.onclick = () => openForm(null);
  el.querySelector('#cExport').onclick = async () => {
    try {
      const rows = await DB.all(() => query(false));
      Export.csv(o.exportName || o.table, rows, o.exportColumns || o.columns.filter(c => c.key).map(c => ({ key: c.key, label: c.label })));
    } catch (err) { UI.toast(err.message, 'error'); }
  };
  load();
  return { reload: load, openForm };
}
