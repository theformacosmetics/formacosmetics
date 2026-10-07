# Forma Cosmetics - Business Management

Plain HTML + CSS + Vanilla JS frontend. Supabase (PostgreSQL, Auth, Storage, Row Level Security) backend.
Black, white and gray only. Manrope + Inter only.

## Setup (10 minutes)
1. Create a project at supabase.com.
2. SQL Editor: run `supabase/schema.sql`, THEN `supabase/functions.sql`.
3. Authentication > Providers > Email: turn OFF public sign-ups.
4. Authentication > Users > Add user (email + password, auto-confirm).
   The FIRST user becomes `admin`; every later user is `staff` (change roles in Settings > Users).
   Create users AFTER step 2. If a user existed before, run:
   `insert into profiles (id,email,role) select id,email,'admin' from auth.users where email='you@example.com';`
5. Project Settings > API: copy the Project URL and the **anon public** key into `js/config.js`.
   Never put the service_role key in this app.
6. Serve the folder with any static server (`npx serve .`, VS Code Live Server, Netlify, Vercel static) and open `index.html`.
7. Sign in, open Settings > Data > "Load demo data" to try everything. "Remove demo data" cleans it up.
8. Settings > Company / Invoice: add your details, logo, signature, terms and bank details.

## Structure
- `supabase/schema.sql`     tables, constraints, indexes, triggers, RLS, storage buckets, seed data
- `supabase/functions.sql`  create_sale, record_payment, void_sale, dashboard / P&L functions, read views, demo reset
- `css/`  style.css (tokens, layout), components.css, invoice.css, responsive.css
- `js/`   config, supabase, auth, common (layout, toast, modal), crud (forms, tables, CRUD screen, export, storage, date range), one file per module
- `pages/` one HTML shell per module

## How the money logic works
- Revenue = taxable sales + other charges. GST collected is NOT revenue.
- COGS = quantity sold x the batch cost per unit, frozen on the sale line at the time of sale.
- Net profit = Revenue - COGS - Operating expenses.
- Investments and withdrawals are partner capital. They never touch expenses or profit.
- Stock is never edited directly. It is the sum of `inventory_transactions`.
- A sale is ONE database transaction (`create_sale`): sale, lines, stock deduction (earliest expiry first unless a batch is chosen), COGS, invoice number. If anything fails, nothing is saved.
- Invoice numbers come from a locked counter table plus a unique constraint: FORMA-2026-0001, 0002, ...

## Roles (enforced by RLS in the database)
- admin: everything
- staff: sales, invoices, customers, products, inventory (create/edit, no delete, cannot void sales)
- Only admins: manufacturing, expenses, investments, partners, profit & loss, settings, users, backup

## Invoice design
The invoice is one function (`Invoice.html` in `js/invoices.js`) styled by `css/invoice.css`.
It currently uses a clean A4 layout. Send the real Forma invoice and it will be matched in those two files only.
PDF download loads html2pdf.js from cdnjs on first use. Print uses the browser (choose "Save as PDF" if offline).

See `TESTING.md` for the test checklist with expected numbers for the demo data.
