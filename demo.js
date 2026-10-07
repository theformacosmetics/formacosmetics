// Demo data: created through the same tables/functions the app uses, ids recorded so it can be removed.
const Demo = (() => {
  const ins = async (table, rows) => (await DB.run(db.from(table).insert(rows).select('id'))).data.map(r => r.id);
  const ago = n => addDays(today(), -n);

  async function recorded() {
    const { data } = await DB.run(db.from('settings').select('value').eq('key', 'demo_ids').maybeSingle());
    return data ? data.value : null;
  }

  async function load(onStep = () => {}) {
    if (await recorded()) throw new Error('Demo data is already loaded. Remove it first to load it again.');
    const ids = { customers: [], products: [], partners: [], investments: [], expenses: [], sales: [], manufacturing: [] };
    const save = () => DB.run(db.from('settings').upsert({ key: 'demo_ids', value: ids }));
    const uid = (await Auth.profile()).id;
    try {
      onStep('Products');
      const cats = (await DB.run(db.from('categories').select('id,name'))).data, cat = n => (cats.find(c => c.name === n) || {}).id || null;
      const P = [
        { name: 'Forma Face Wash', sku: 'DEMO-FW-001', category_id: cat('Face Care'), mrp: 399, selling_price: 349, cost_price: 95, gst_percent: 18, hsn_code: '33049990', minimum_stock: 50, description: 'Gentle daily gel face wash.' },
        { name: 'Forma Brightening Serum', sku: 'DEMO-BS-001', category_id: cat('Skin Care'), mrp: 899, selling_price: 799, cost_price: 240, gst_percent: 18, hsn_code: '33049990', minimum_stock: 40, description: 'Vitamin C brightening serum.' },
        { name: 'Forma Moisturizer', sku: 'DEMO-MO-001', category_id: cat('Skin Care'), mrp: 599, selling_price: 499, cost_price: 160, gst_percent: 18, hsn_code: '33049990', minimum_stock: 40, description: 'Lightweight daily moisturizer.' }
      ];
      ids.products = await ins('products', P); await save();

      onStep('Customers');
      ids.customers = await ins('customers', [
        { name: 'Demo - Aanya Shah', phone: '9876500001', email: 'aanya@example.com', customer_type: 'Direct Customer', billing_address: 'Ahmedabad, Gujarat' },
        { name: 'Demo - Glow Pharmacy', phone: '9876500002', customer_type: 'Retailer', billing_address: 'Surat, Gujarat', gstin: '24ABCDE1234F1Z5' },
        { name: 'Demo - Dr. Mehta Skin Clinic', phone: '9876500003', customer_type: 'Doctor', billing_address: 'Vadodara, Gujarat' },
        { name: 'Demo - Beauty Hub Distributors', phone: '9876500004', customer_type: 'Distributor', billing_address: 'Mumbai, Maharashtra', gstin: '27ABCDE1234F1Z5' },
        { name: 'Demo - Riya Patel', phone: '9876500005', customer_type: 'Direct Customer', billing_address: 'Rajkot, Gujarat' }
      ]); await save();

      onStep('Partners and investments');
      ids.partners = await ins('partners', [{ name: 'Demo - Yash', ownership_percent: 60, email: 'yash@example.com' }, { name: 'Demo - Co-founder', ownership_percent: 40 }]); await save();
      ids.investments = await ins('investments', [
        { partner_id: ids.partners[0], investment_date: ago(90), amount: 50000, investment_type: 'Initial Capital', payment_method: 'Bank Transfer', created_by: uid },
        { partner_id: ids.partners[1], investment_date: ago(90), amount: 30000, investment_type: 'Initial Capital', payment_method: 'UPI', created_by: uid },
        { partner_id: ids.partners[0], investment_date: ago(40), amount: 20000, investment_type: 'Additional Investment', payment_method: 'Bank Transfer', created_by: uid }
      ]); await save();

      onStep('Manufacturing batches');
      ids.manufacturing = await ins('manufacturing_batches', [
        { product_id: ids.products[0], batch_number: 'DEMO-FW-B1', manufacturer: 'Demo Labs', manufacturing_date: ago(75), expiry_date: addDays(ago(75), 900), quantity_produced: 500, manufacturing_cost: 30000, packaging_cost: 12000, shipping_cost: 3000, other_cost: 2500, status: 'completed', created_by: uid },
        { product_id: ids.products[1], batch_number: 'DEMO-BS-B1', manufacturer: 'Demo Labs', manufacturing_date: ago(70), expiry_date: addDays(ago(70), 730), quantity_produced: 300, manufacturing_cost: 50000, packaging_cost: 15000, shipping_cost: 4000, other_cost: 3000, status: 'completed', created_by: uid },
        { product_id: ids.products[2], batch_number: 'DEMO-MO-B1', manufacturer: 'Demo Labs', manufacturing_date: ago(65), expiry_date: addDays(ago(65), 800), quantity_produced: 400, manufacturing_cost: 40000, packaging_cost: 14000, shipping_cost: 3500, other_cost: 2000, status: 'completed', created_by: uid }
      ]); await save();

      onStep('Expenses');
      const ec = (await DB.run(db.from('expense_categories').select('id,name'))).data, e = n => ec.find(c => c.name === n).id;
      ids.expenses = await ins('expenses', [
        { expense_date: ago(60), category_id: e('Website'), description: 'Domain and hosting', amount: 4500, payment_method: 'Card', vendor: 'Demo Host', created_by: uid },
        { expense_date: ago(55), category_id: e('Software'), description: 'Accounting subscription', amount: 1800, payment_method: 'UPI', vendor: 'Demo Software', created_by: uid },
        { expense_date: ago(45), category_id: e('Marketing'), description: 'Instagram ads', amount: 9000, payment_method: 'Card', vendor: 'Meta', created_by: uid },
        { expense_date: ago(38), category_id: e('Influencer'), description: 'Skincare creator collaboration', amount: 7500, payment_method: 'Bank Transfer', vendor: 'Demo Creator', created_by: uid },
        { expense_date: ago(30), category_id: e('Samples'), description: 'Sample kits for doctors', amount: 3200, payment_method: 'Cash', created_by: uid },
        { expense_date: ago(20), category_id: e('Shipping'), description: 'Courier charges', amount: 2600, payment_method: 'UPI', vendor: 'Demo Courier', created_by: uid },
        { expense_date: ago(12), category_id: e('Professional Fees'), description: 'CA consultation', amount: 3000, payment_method: 'Bank Transfer', created_by: uid },
        { expense_date: ago(5), category_id: e('Office'), description: 'Stationery and packing material', amount: 1400, payment_method: 'Cash', created_by: uid }
      ]); await save();

      onStep('Sales and invoices');
      const [fw, bs, mo] = ids.products, [c1, c2, c3, c4, c5] = ids.customers;
      const sale = async (customer, day, method, status, items, paid) => {
        const r = await DB.rpc('create_sale', { p_customer_id: customer, p_sale_date: ago(day), p_payment_method: method, p_payment_status: status, p_other_charges: 0, p_amount_paid: paid || null, p_notes: 'Demo sale', p_items: items, p_allow_negative: false });
        ids.sales.push(r.sale_id); await save();
      };
      await sale(c1, 40, 'UPI', 'Paid', [{ product_id: fw, quantity: 2, rate: 349, discount: 0 }, { product_id: bs, quantity: 1, rate: 799, discount: 50 }]);
      await sale(c2, 34, 'Bank Transfer', 'Paid', [{ product_id: fw, quantity: 50, rate: 260, discount: 0 }, { product_id: mo, quantity: 30, rate: 380, discount: 0 }]);
      await sale(c3, 28, 'Cash', 'Paid', [{ product_id: bs, quantity: 10, rate: 700, discount: 0 }]);
      await sale(c4, 22, 'Bank Transfer', 'Partially Paid', [{ product_id: fw, quantity: 100, rate: 240, discount: 500 }, { product_id: bs, quantity: 40, rate: 620, discount: 0 }, { product_id: mo, quantity: 60, rate: 350, discount: 0 }], 30000);
      await sale(c5, 15, 'UPI', 'Paid', [{ product_id: mo, quantity: 2, rate: 499, discount: 0 }]);
      await sale(c1, 9, 'Card', 'Paid', [{ product_id: bs, quantity: 2, rate: 799, discount: 100 }, { product_id: mo, quantity: 1, rate: 499, discount: 0 }]);
      await sale(c2, 4, 'Bank Transfer', 'Pending', [{ product_id: fw, quantity: 40, rate: 260, discount: 0 }]);
      await sale(c3, 1, 'UPI', 'Paid', [{ product_id: mo, quantity: 12, rate: 420, discount: 0 }, { product_id: fw, quantity: 6, rate: 300, discount: 0 }]);
      onStep('Done');
    } catch (e) {
      e.message = 'Demo data stopped part-way: ' + e.message + ' Use "Remove demo data" to clean up.';
      throw e;
    }
  }

  async function reset() {
    const ids = await recorded();
    if (!ids) throw new Error('There is no demo data to remove.');
    await DB.rpc('reset_demo_data', { p_ids: ids });
    await DB.run(db.from('settings').delete().eq('key', 'demo_ids'));
  }

  return { load, reset, recorded };
})();
