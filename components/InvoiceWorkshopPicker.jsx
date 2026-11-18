"use client";
import { useEffect, useState } from "react";
import { money } from "../lib/billing.mjs";
import { sections } from "../lib/workshop.mjs";
export default function InvoiceWorkshopPicker({
  client,
  day,
  choice,
  onChange,
}) {
  const [open, setOpen] = useState(false),
    [book, setBook] = useState(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const month = choice.month || day.slice(0, 7);
  useEffect(() => {
    let active = true;
    if (!open) return;
    setBook(null);
    setError("");
    fetch("/api/workshop?month=" + month)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (active) setBook(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open, month, retry]);
  const sources =
    book?.records.filter(
      (r) =>
        r.customerId === client &&
        !r.voidedAt &&
        !r.invoiceId &&
        r.day <= day &&
        r.amount > 0 &&
        ["sale", "expense", "material"].includes(r.kind),
    ) || [];
  return (
    <div className="invoice-workshop">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Workshop entries &amp; PDF attachments</span>
        <b>{open ? "−" : "+"}</b>
      </button>
      {!open && (choice.items.length || choice.sections.length) > 0 && (
        <small>
          {choice.items.length} billable entries · {choice.sections.length}{" "}
          report sections
        </small>
      )}
      {open && (
        <div className="picker-body">
          <label className="field">
            <span>Source month</span>
            <input
              aria-label="Source month"
              type="month"
              value={month}
              max={day.slice(0, 7)}
              onChange={(e) => {
                if (e.target.value && e.target.validity.valid)
                  onChange({ month: e.target.value, items: [], sections: [] });
              }}
            />
          </label>
          <h4>Billable entries</h4>
          {!client ? (
            <p>Choose a customer to see their entries.</p>
          ) : error ? (
            <p role="alert">
              {error}{" "}
              <button
                type="button"
                className="text-btn"
                onClick={() => setRetry((v) => v + 1)}
              >
                Retry
              </button>
            </p>
          ) : !book ? (
            <p>Loading entries…</p>
          ) : !sources.length ? (
            <p>No unbilled entries for this customer and month.</p>
          ) : (
            sources.map((r) => (
              <label className="check" key={r.id}>
                <input
                  type="checkbox"
                  checked={choice.items.some((x) => x.id === r.id)}
                  onChange={(e) =>
                    onChange({
                      ...choice,
                      month,
                      items: e.target.checked
                        ? [...choice.items, { id: r.id, amount: r.amount }]
                        : choice.items.filter((x) => x.id !== r.id),
                    })
                  }
                />
                {r.day} · {r.reference || r.detail.challan || r.category} ·{" "}
                {money(r.amount)}
              </label>
            ))
          )}
          <h4>Attach a monthly report to this customer’s PDF</h4>
          <p>
            Selected sections include the whole workshop for this month,
            including other parties or workers. Their figures do not change the
            invoice amount.
          </p>
          <div className="report-checks">
            {Object.entries(sections).map(([key, name]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={choice.sections.includes(key)}
                  onChange={(e) =>
                    onChange({
                      ...choice,
                      month,
                      sections: e.target.checked
                        ? [...choice.sections, key]
                        : choice.sections.filter((x) => x !== key),
                    })
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
