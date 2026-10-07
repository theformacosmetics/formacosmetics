(async () => {
  if (await Auth.session()) { location.replace('pages/dashboard.html'); return; }
  const form = document.getElementById('loginForm');
  const err = document.getElementById('formError');
  const btn = document.getElementById('submitBtn');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.textContent = '';
    const email = form.email.value.trim(), password = form.password.value;
    if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
    btn.disabled = true; btn.textContent = 'Signing in...';
    try { await Auth.login(email, password); }
    catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Sign in'; }
  });
})();
