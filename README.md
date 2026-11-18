# Billfold Workshop

A single-workshop billing and accounts app for a textile jobwork business. It combines customer invoices with challan sales, attendance, payroll, purchases, supplier balances and a monthly cashbook. The application lives in `billfold/`. It extends the original [Billfold project](https://github.com/vedantxy/Billing_Subscription_Management).

## Run on Windows

Use Node.js 22.12 or later and a separate empty PostgreSQL database. In PowerShell, start in the folder containing this README.

```powershell
cd billfold
npm ci
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` to the pooled application connection string from your **new** Neon database. Set `DIRECT_URL` to the direct connection string for the same database, branch and role. With local PostgreSQL, both variables can use the same connection string. Keep the complete URLs inside quotes in the local file.

```powershell
npm run db:setup
npm run staff -- owner@example.com owner "Workshop Owner"
npm run dev
```

Replace the email and display name with your own. The staff command prompts for a password of 12–256 characters. Open [localhost:3000](http://localhost:3000) and sign in. The database starts empty. For a demo database, the optional `npm run db:seed` adds fictional customers, subscriptions and invoices.

## First invoice from a challan

1. Open **Workshop books → Settings → Edit seller**. Add the business name, address, contact, optional registration number and invoice terms.
2. Open **Customers → New customer**. Each customer can have its own sales register, including the two parties represented in the workbook.
3. In **Workshop books → Sales → Add job sale**, enter the party challan number, design numbers, pieces, sort and rate. For 100 pieces with 4 sort at ₹25, the line is 96 × ₹25 = ₹2,400. When a jama date or bill number arrives later, open **Sales → Jama details** to record it.
4. In **Invoices → New invoice**, select that customer. Expand **Workshop entries & PDF attachments**, choose the source month and tick the challan. You can combine it with custom items, a pricing plan or costs explicitly assigned to that customer.
5. Set the invoice and due dates, discount and tax if applicable. Save as a draft or issue immediately. Open the resulting invoice to download its PDF or record a receipt. A source entry can belong to one invoice.
6. Monthly attachments are optional. Each checked section includes the entire workshop for the selected month. Payroll includes workers’ names and wages. Review the selection before sending the file. The app saves the chosen tables with the invoice, so subsequent ledger changes do not rewrite the attachment. Receipt totals on the invoice reflect later successful payments.

## Workbook coverage

| Workbook area | Where it appears | What the app records |
|---|---|---|
| Final | Workshop books → Monthly result | Sales by party, wages, operating and material costs, monthly profit or loss |
| KariGar Name | Attendance → Worker directory | Name, job, machine, monthly salary, derived daily rate, active or archived status |
| Attendance | Attendance → Daily attendance | Present, absent, half day, Dodh day and extra machine days; rate captured with each mark |
| Karigar, Karigar Upad | Payroll | Earned wages, bonuses, signed corrections with reasons, night pay, date, firm, cash and bank advances, payouts and remaining salary |
| Pagar salary sheet | Reports → Salary sheet | Name, hajari, pagar, upad, total, night salary, fusing, tea, safsafai and a reconciled grand total |
| Parchuran Kharch, MAMA, Machinery Kharch, Makan Rent, Light Bill, Fusing, Alter, Petrol | Expenses | Category, supplier, bill/reference, particulars, purchase value, cash, bank and baki; settle unpaid bills later |
| Syroski | Materials | Peti × 40 packets, counted units, rate, value, cash, bank and baki |
| Paper Sheet | Materials | Boxes × 1,000 sheets, counted units, rate, value and supplier balance |
| M F, Riddhi Siddi | Sales | A register for each customer, challan, party design, design, pieces, sort, accepted pieces, rate, line amount, challan total, jama date and jama bill number |
| Rojmel | Rojmel | Jama/credit and udhar/debit, particulars, cash and bank movement, opening balance, running balance and closing balance |

The empty worksheet has no accounting fields. Start the new application with your own records. The original cashbook, salary PDF and employee data are excluded from the source.

### Accounting rules

- Money is stored in integer paise. A workday pays one thirtieth of the recorded monthly rate. P = 1, H = 0.5, E/Dodh = 1.5 and A = 0. Daily rate snapshots are multiplied by weighted days and rounded once per worker and month.
- The salary sheet’s day total is earned day pay plus bonus and adjustments less advances. The reconciliation adds night pay and specified expenses. Actual salary payouts reduce the amount still owed. Use a signed, explained adjustment for a manual payroll correction.
- Enter a credit purchase once. Its full value is a cost in the posting month. Cash and bank track actual payments. A supplier settlement reduces baki and the cashbook without creating another purchase expense.
- Fractional material packs are supported. If the counted units differ from the nominal pack conversion, enter the count and the reason.
- The monthly result recognizes job sales on the ledger date. Converting a sale into an invoice avoids counting the same revenue twice. Invoice discounts reduce sales and tax is excluded from operating revenue.
- Successful invoice receipts flow into Rojmel automatically. Enter opening balances as a dated Rojmel credit or debit before the first reporting month. Posted entry corrections use **Void** with a reason, followed by a replacement entry. Invoiced sources and bills with live settlements are protected.
- Run **Reports** for a standalone PDF or spreadsheet-friendly CSV, with the month and sections you choose. PDF downloads use embedded fonts for English, Gujarati and Devanagari.

## Vercel

Create a new Vercel project from this repository. Use a separate Neon database for this app.

| Vercel field | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `billfold` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Framework default |
| Environment variables | `DATABASE_URL` (pooled), `DIRECT_URL` (direct). If required behind a reverse proxy, set `APP_ORIGIN` to the exact HTTPS origin without a trailing slash. |

Run `npm run db:migrate` against the selected database as a release step, then provision your first owner with `npm run staff`. For a later release, back up the database, review migrations and apply pending migrations once. Use a separate database or Neon branch for preview deployments. Confirm sign-in, a sample invoice PDF and a receipt on the deployed site before entering business records.

[Configure a Vercel build](https://vercel.com/docs/builds/configure-a-build) · [Neon connections for Prisma](https://neon.com/docs/guides/prisma)

## Staff and operations

Owners can edit seller details and inspect the 100 latest audit events. Accountants can post billing and workshop transactions. Viewers can read records and download reports, including payroll. All three roles are **internal staff**. A customer receives its selected PDF externally. The application records payments taken by cash, bank, card or UPI. Payment collection through a gateway and government e-invoice submission are separate integrations.

Use `npm run staff -- email role "Display name"` to create an account, change its role or reset its password. Re-provisioning expires its previous sessions. Staff sessions expire after 12 hours. The server verifies the session, role and request origin on changes. The audit trail, transactional invoice-source linking and request keys cover retries and duplicate submissions.

## Verification

From `billfold/`:

```powershell
npm test
npm run build
```

For the integration suite, set `TEST_DATABASE_URL` to a separate **disposable, empty** PostgreSQL database and run `npm run test:integration` after building. The suite migrates this database, creates fictional staff and register entries, starts a local production server and checks permissions, concurrency, accounting, exports and sign-out. For the optional desktop and mobile checks install Python Playwright and its Chromium browser, then set `TEST_BROWSER=1` before running the suite. You can set `CHROMIUM_BIN` to a local Chromium executable.

The runtime uses Next.js App Router, React, Prisma 6, PostgreSQL and pdf-lib. The workshop module and its tests live alongside the original billing engine.
