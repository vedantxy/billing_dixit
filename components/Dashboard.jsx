import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  FileClock,
  Layers3,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  businessDay,
  daysBetween,
  invoiceNumber,
  money,
  niceDate,
  summarize,
} from "../lib/billing.mjs";
import {
  Badge,
  CustomerName,
  Empty,
  LinkAction,
  PanelHead,
  RecordsTable,
  RowAction,
} from "./ui.jsx";

function Kpi({ icon: Icon, title, value, detail, tone, onClick }) {
  return (
    <button className={"kpi " + tone} onClick={onClick}>
      <span className="kpi-top">
        <span className="icon-tile">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <span>{title}</span>
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}
function axisValue(paise) {
  const n = paise / 100;
  if (n >= 100000) return "₹" + +(n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + +(n / 1000).toFixed(1) + "k";
  return "₹" + +n.toFixed(1);
}
function tickSize(value) {
  const pow = 10 ** Math.floor(Math.log10(value || 1));
  return ([1, 1.25, 1.5, 2, 2.5, 4, 5, 7.5, 10].find((n) => n * pow >= value) || 10) * pow;
}
function RevenueChart({ months }) {
  const [hover, setHover] = useState(null);
  const peak = Math.max(400, ...months.flatMap((m) => [m.billed, m.collected]));
  const step = tickSize(peak / 4),
    maximum = step * 4;
  const lx = 52,
    rx = 696,
    top = 13,
    base = 177,
    spread = (rx - lx) / months.length;
  const width = Math.min(20, spread * 0.27);
  const height = (v) => (v / maximum) * (base - top);
  const selected = months[hover];
  return (
    <div className="graph">
      <svg
        viewBox="0 0 710 210"
        role="group"
        aria-label="Monthly billed and collected revenue in rupees"
      >
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}>
            <line
              x1={lx}
              x2={rx}
              y1={base - (t * (base - top)) / 4}
              y2={base - (t * (base - top)) / 4}
              stroke="#e8e7ee"
              strokeDasharray={t === 0 ? "" : "3 5"}
            />
            <text
              x={lx - 10}
              y={base - (t * (base - top)) / 4 + 4}
              textAnchor="end"
              className="axis"
            >
              {axisValue(step * t)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const center = lx + (i + 0.5) * spread;
          const show = months.length <= 6 || i % 2 === 0;
          const label =
            m.label +
            " " +
            m.key.slice(0, 4) +
            ", collected " +
            money(m.collected) +
            ", billed " +
            money(m.billed);
          return (
            <g
              key={m.key}
              tabIndex="0"
              aria-label={label}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{label}</title>
              <rect
                x={center - spread * 0.46}
                y={top}
                width={spread * 0.92}
                height={base - top}
                fill={hover === i ? "#f8f6fc" : "transparent"}
              />
              <rect
                x={center - width - 1.5}
                y={base - height(m.collected)}
                width={width}
                height={height(m.collected)}
                rx="3"
                fill="#7760c3"
              />
              <rect
                x={center + 1.5}
                y={base - height(m.billed)}
                width={width}
                height={height(m.billed)}
                rx="3"
                fill="#d8cfee"
              />
              {show && (
                <text x={center} y="199" textAnchor="middle" className="axis">
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {selected && (
        <div className="chart-tip" role="status">
          {selected.label} {selected.key.slice(0, 4)} · Collected {money(selected.collected)} ·
          Billed {money(selected.billed)}
        </div>
      )}
    </div>
  );
}
export function InvoiceTable({ invoices, open, preview = false }) {
  const headers = preview
    ? ["Invoice", "Customer", "Due date", "Amount", "Status", ""]
    : ["Invoice", "Customer", "Issue date", "Due date", "Amount", "Status", ""];
  return (
    <RecordsTable
      rows={invoices}
      headers={headers}
      perPage={preview ? 5 : 10}
      noun="invoices"
      totalLabel={!preview}
      render={(inv) => (
        <tr key={inv.id}>
          <td>
            <button className="item-link code" onClick={() => open("invoice", inv.id)}>
              {invoiceNumber(inv.sequence)}
            </button>
          </td>
          <td>
            <CustomerName name={inv.billTo} />
          </td>
          {!preview && <td>{niceDate(inv.issuedOn, true)}</td>}
          <td>{niceDate(inv.dueOn, true)}</td>
          <td className="amount">{money(inv.total)}</td>
          <td>
            <Badge value={inv.status} />
          </td>
          <td>
            <RowAction
              label={"View " + invoiceNumber(inv.sequence)}
              onClick={() => open("invoice", inv.id)}
            />
          </td>
        </tr>
      )}
    />
  );
}
export default function Dashboard({ book, today = businessDay(), stats, open, go }) {
  const [range, setRange] = useState(6);
  const months = range === 6 ? stats.months : summarize(book, today, range).months;
  const names = new Map(book.customers.map((c) => [c.id, c.name]));
  const collected = months.reduce((s, m) => s + m.collected, 0);
  const rangeLabel =
    niceDate(months[0].key + "-01", true).replace(/^1 /, "") +
    " – " +
    niceDate(today, true).replace(/^\d+ /, "");
  const successful = book.payments.filter((p) => p.status === "successful").length;
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          icon={Wallet}
          title="Recorded revenue"
          value={money(stats.revenue)}
          detail={successful + " successful payments"}
          tone="mint"
          onClick={() => go("payments", "successful")}
        />
        <Kpi
          icon={ChartNoAxesCombined}
          title="Monthly recurring revenue"
          value={money(stats.mrr)}
          detail="Active plans, per month"
          tone="lilac"
          onClick={() => go("subscriptions", "active")}
        />
        <Kpi
          icon={Layers3}
          title="Active subscriptions"
          value={stats.active}
          detail={book.subscriptions.length + " subscriptions in total"}
          tone="blue"
          onClick={() => go("subscriptions", "active")}
        />
        <Kpi
          icon={FileClock}
          title="Outstanding"
          value={money(stats.outstanding)}
          detail={stats.open.length + " open · " + stats.overdue.length + " overdue"}
          tone="amber"
          onClick={() => go("invoices", "open")}
        />
      </div>
      <div className="overview-grid">
        <section className="panel revenue-panel">
          <PanelHead
            title="Revenue overview"
            subtitle={rangeLabel}
            extra={
              <label className="range">
                <CalendarDays size={14} />
                <select
                  aria-label="Revenue period"
                  value={range}
                  onChange={(e) => setRange(+e.target.value)}
                >
                  {[3, 6, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} months
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} />
              </label>
            }
          />
          <div className="chart-context">
            <span className="chart-total">
              {money(collected)} <small>collected</small>
            </span>
            <span className="legend">
              <i />
              Collected <i />
              Billed
            </span>
          </div>
          <RevenueChart key={range} months={months} />
        </section>
        <section className="panel renewal-panel">
          <PanelHead
            title="Upcoming renewals"
            subtitle="Next 30 days"
            extra={
              <span className="quiet-icon">
                <RefreshCw size={17} />
              </span>
            }
          />
          <div className="renewals">
            {stats.renewals.slice(0, 4).map((s) => {
              const days = daysBetween(today, s.nextDate);
              return (
                <button key={s.id} className="renewal" onClick={() => open("subscription", s.id)}>
                  <CustomerName name={names.get(s.customerId) || "Customer"} sub={s.planLabel} />
                  <span className="renewal-right">
                    <b>{money(s.price)}</b>
                    <small>
                      {days === 0 ? "Today" : days === 1 ? "Tomorrow" : "In " + days + " days"}
                    </small>
                  </span>
                </button>
              );
            })}
            {!stats.renewals.length && <Empty title="No upcoming renewals" />}
          </div>
          <button className="panel-bottom-link" onClick={() => go("subscriptions", "renewals")}>
            View renewals <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="panel invoice-panel">
        <PanelHead
          title="Recent invoices"
          subtitle={stats.invoices.length + " invoices · " + stats.overdue.length + " overdue"}
          extra={<LinkAction onClick={() => go("invoices")}>All invoices</LinkAction>}
        />
        <InvoiceTable invoices={stats.invoices.slice(0, 5)} open={open} preview />
      </section>
    </>
  );
}
