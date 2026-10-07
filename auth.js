// Authentication, session checks and role helpers.
// Frontend checks only improve UX. Real enforcement is Row Level Security in the database.
const Auth = (() => {
  const root = location.pathname.includes('/pages/') ? '../' : '';
  let cached = null;

  async function session() {
    const { data } = await db.auth.getSession();
    return data.session;
  }

  async function profile(force = false) {
    if (cached && !force) return cached;
    const s = await session();
    if (!s) return null;
    const { data, error } = await db.from('profiles').select('*').eq('id', s.user.id).single();
    if (error) { console.error(error); return null; }
    cached = data;
    return data;
  }

  // Call at the top of every protected page. roles: e.g. ['admin'] (omit = any signed-in user)
  async function require(roles) {
    const p = await profile();
    if (!p || !p.is_active) { await db.auth.signOut(); location.replace(root + 'login.html'); return null; }
    if (roles && !roles.includes(p.role)) { location.replace(root + 'pages/dashboard.html?denied=1'); return null; }
    return p;
  }

  async function login(email, password) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials'
      ? 'Email or password is incorrect.' : error.message);
    location.replace(root + 'pages/dashboard.html');
  }

  async function logout() {
    cached = null;
    await db.auth.signOut();
    location.replace(root + 'login.html');
  }

  const isAdmin = p => p && p.role === 'admin';

  return { session, profile, require, login, logout, isAdmin, root };
})();
