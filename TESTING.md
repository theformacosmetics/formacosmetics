# Test checklist

Load demo data first (Settings > Data). Expected values below are for ALL TIME (Reports use "All Time"; Profit & Loss use a custom range covering the last 100 days).

## Numbers that must match
| Check | Expected |
|---|---|
| Stock: Face Wash / Serum / Moisturizer | 302 / 247 / 295 |
| Cost per unit from batches | 95.00 / 240.00 / 148.75 |
| Inventory value | 131,851.25 |
| Units sold | 356 |
| Revenue (excluding GST) | 122,382.00 |
| COGS | 47,148.75 |
| Gross profit | 75,233.25 |
| Operating expenses | 33,000.00 |
| Net profit | 42,233.25 |
| Total investment | 100,000.00 (investments are NOT in expenses) |
| Low stock | 0 |
| Pending payments | Beauty Hub 51,774.00, Glow Pharmacy 12,272.00 |
| Invoice numbers | FORMA-<year>-0001 to 0008, no gaps, no repeats |

## Flows
1. New Sale: pick customer, add two products, add discount and other charges. Totals match the invoice. Stock drops. Invoice opens.
2. Try selling more than stock: blocked with a clear message (admin can tick "allow above stock").
3. Partial payment: amount must be above 0 and below total. Add payment later from All Sales until Paid.
4. Void a sale (admin): stock returns, invoice disappears. Next new sale does not reuse a deleted number only if it was the latest; numbers are never edited.
5. Manufacturing: add a Completed batch. Product stock rises by the quantity and a batch appears under Expiry/Stock Overview. Planned > Complete does the same. Completed batches cannot be edited or deleted.
6. Stock In with a new batch number creates a batch. Stock Out picks a batch and cannot exceed it.
7. Expense with a receipt: receipt opens from the table. Investment: appears in Partners ledger as Money In; Withdrawal cannot exceed balance; ownership cannot total over 100%.
8. Invoice: Download PDF, Print, Share.
9. Staff user: no Manufacturing / Expenses / Investments / P&L / Settings in the menu; opening those URLs redirects; direct API writes to those tables are rejected by RLS.
10. Mobile (about 380px wide): menu drawer opens, tables scroll sideways, forms are single column.
11. Settings > Data > each CSV export opens in Excel/Sheets. Backup downloads JSON.
12. Remove demo data: demo rows vanish, real rows stay, invoice counter resets only if no invoices remain.
