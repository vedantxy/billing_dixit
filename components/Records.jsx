import { useState } from "react";
import { Boxes, Pencil, Plus } from "lucide-react";
import { cadences, invoiceNumber, methods, money, niceDate, statuses } from "../lib/billing.mjs";
import { Badge, CustomerName, Empty, RecordsTable, RowAction, Toolbar } from "./ui.jsx";
import { InvoiceTable } from "./Dashboard.jsx";

const matches = (q, ...fields) =>
  fields.some((f) =>
    String(f ?? "")
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
const option = (v) => [v, statuses[v] || v];
function RecordName({ name, sub, onClick }) {
  return (
    <button className="item-link" onClick={onClick}>
      <CustomerName name={name} sub={sub} />
    </button>
  );
}
export default function Records({ view, book, stats, open, initialFilter = "all", today }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const controls = { query, setQuery, filter, setFilter };
  const customer = (id) => book.customers.find((c) => c.id === id)?.name || "Customer";
  const subStatus = ["active", "paused", "cancelled", "past_due"];
  if (view === "customers") {
    const rows = book.customers
      .filter(
        (c) =>
          matches(query, c.name, c.email, c.phone, c.address) &&
          (filter === "all" || (filter === "archived") === c.archived),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return (
      <section className="panel listing">
        <Toolbar
          {...controls}
          placeholder="Search customers…"
          options={[
            ["all", "All customers"],
            ["current", "Current"],
            ["archived", "Archived"],
          ]}
        />
        <RecordsTable
          key={query + filter}
          rows={rows}
          noun="customers"
          totalLabel
          headers={["Customer", "Phone", "Subscriptions", "Balance due", "Status", ""]}
          render={(c) => (
            <tr key={c.id}>
              <td>
                <RecordName name={c.name} sub={c.email} onClick={() => open("customer", c.id)} />
              </td>
              <td>{c.phone || "—"}</td>
              <td>{book.subscriptions.filter((s) => s.customerId === c.id).length}</td>
              <td className="amount">
                {money(
                  stats.open
                    .filter((i) => i.customerId === c.id)
                    .reduce((s, i) => s + i.balance, 0),
                )}
              </td>
              <td>
                <Badge value={c.archived ? "archived" : "active"} />
              </td>
              <td>
                <RowAction label={"View " + c.name} onClick={() => open("customer", c.id)} />
              </td>
            </tr>
          )}
        />
      </section>
    );
  }
  if (view === "invoices") {
    const rows = stats.invoices.filter(
      (i) =>
        matches(query, i.billTo, invoiceNumber(i.sequence)) &&
        (filter === "all" ||
          i.status === filter ||
          (filter === "open" && ["pending", "overdue"].includes(i.status))),
    );
    return (
      <section className="panel listing">
        <Toolbar
          {...controls}
          placeholder="Search invoices…"
          options={[
            ["all", "All statuses"],
            ["open", "All open"],
            ...["draft", "pending", "paid", "overdue"].map(option),
          ]}
        />
        <InvoiceTable key={query + filter} invoices={rows} open={open} />
      </section>
    );
  }
  if (view === "subscriptions") {
    const renewals = new Set(stats.renewals.map((s) => s.id));
    const rows = book.subscriptions
      .filter(
        (s) =>
          (filter === "all" ||
            s.status === filter ||
            (filter === "renewals" && renewals.has(s.id))) &&
          matches(query, customer(s.customerId), s.planLabel),
      )
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    return (
      <section className="panel listing">
        <Toolbar
          {...controls}
          placeholder="Search subscriptions…"
          options={[
            ["all", "All subscriptions"],
            ["renewals", "Renewing in 30 days"],
            ...subStatus.map(option),
          ]}
        />
        <RecordsTable
          key={query + filter}
          rows={rows}
          noun="subscriptions"
          totalLabel
          headers={["Customer", "Pricing plan", "Renewal amount", "Next billing", "Status", ""]}
          render={(s) => (
            <tr key={s.id}>
              <td>
                <RecordName
                  name={customer(s.customerId)}
                  onClick={() => open("subscription", s.id)}
                />
              </td>
              <td>{s.planLabel}</td>
              <td className="amount">
                {money(s.price)}
                <small className="block-label">{cadences[s.cadence]}</small>
              </td>
              <td>
                {["cancelled", "paused"].includes(s.status) ? "—" : niceDate(s.nextDate, true)}
                {s.nextDate <= today && s.status === "active" && (
                  <small className="block-label">Ready to renew</small>
                )}
              </td>
              <td>
                <Badge value={s.status} />
              </td>
              <td>
                <RowAction
                  label={"View " + s.planLabel}
                  onClick={() => open("subscription", s.id)}
                />
              </td>
            </tr>
          )}
        />
      </section>
    );
  }
  if (view === "payments") {
    const invMap = new Map(book.invoices.map((i) => [i.id, i]));
    const rows = book.payments
      .filter((p) => {
        const i = invMap.get(p.invoiceId);
        return (
          (filter === "all" || p.status === filter) &&
          matches(query, i.billTo, invoiceNumber(i.sequence), methods[p.method])
        );
      })
      .sort(
        (a, b) =>
          b.paidOn.localeCompare(a.paidOn) ||
          invMap.get(b.invoiceId).sequence - invMap.get(a.invoiceId).sequence,
      );
    return (
      <section className="panel listing">
        <Toolbar
          {...controls}
          placeholder="Search payments…"
          options={[["all", "All statuses"], ...["successful", "pending", "failed"].map(option)]}
        />
        <RecordsTable
          key={query + filter}
          rows={rows}
          noun="payments"
          totalLabel
          headers={["Customer", "Invoice", "Payment date", "Method", "Amount", "Status", ""]}
          render={(p) => {
            const i = invMap.get(p.invoiceId);
            return (
              <tr key={p.id}>
                <td>
                  <RecordName name={i.billTo} onClick={() => open("payment", p.id)} />
                </td>
                <td>
                  <button className="item-link code" onClick={() => open("invoice", i.id)}>
                    {invoiceNumber(i.sequence)}
                  </button>
                </td>
                <td>{niceDate(p.paidOn, true)}</td>
                <td>{methods[p.method]}</td>
                <td className="amount">{money(p.amount)}</td>
                <td>
                  <Badge value={p.status} />
                </td>
                <td>
                  <RowAction label="View payment record" onClick={() => open("payment", p.id)} />
                </td>
              </tr>
            );
          }}
        />
      </section>
    );
  }
  const enabled = (product) => filter === "all" || (filter === "enabled") === product.enabled;
  const products = book.products.filter(
    (p) =>
      enabled(p) &&
      matches(
        query,
        p.name,
        p.description,
        ...book.plans.filter((plan) => plan.productId === p.id).map((plan) => plan.name),
      ),
  );
  return (
    <>
      <div className="panel product-tools">
        <Toolbar
          {...controls}
          placeholder="Search products or plans…"
          options={[["all", "All products"], option("enabled"), option("disabled")]}
        />
      </div>
      <div className="product-grid">
        {products.map((p) => {
          const plans = book.plans.filter((plan) => plan.productId === p.id);
          return (
            <section className="panel product-card" key={p.id}>
              <div className="catalog-top">
                <span className="catalog-icon">
                  <Boxes size={20} />
                </span>
                <Badge value={p.enabled ? "enabled" : "disabled"} />
              </div>
              <div className="product-title">
                <h2>{p.name}</h2>
                <button
                  className="row-action"
                  aria-label={"Edit " + p.name}
                  onClick={() => open("productForm", p.id)}
                >
                  <Pencil size={14} />
                </button>
              </div>
              <p className="product-desc">{p.description || "No description added."}</p>
              <ul className="plan-list">
                {plans.map((plan) => (
                  <li key={plan.id}>
                    <button onClick={() => open("planForm", plan.id)}>
                      <span>
                        <strong>{plan.name}</strong>
                        <small>
                          {cadences[plan.cadence]}
                          {!plan.enabled && " · Disabled"}
                        </small>
                      </span>
                      <b>{money(plan.price)}</b>
                      <Pencil size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              {p.enabled && (
                <button
                  className="text-btn"
                  onClick={() => open("planForm", null, { productId: p.id })}
                >
                  <Plus size={14} />
                  Add pricing plan
                </button>
              )}
            </section>
          );
        })}
      </div>
      {!products.length && (
        <section className="panel">
          <Empty title="No matching products" />
        </section>
      )}
    </>
  );
}
