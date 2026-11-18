"use client";
import { useState } from "react";
import { Field } from "./ui.jsx";
import { expenses, materials, labels } from "../lib/workshop.mjs";
import { money } from "../lib/billing.mjs";

const rupees = (v) => Math.round(Number(v || 0) * 100);
export const options = (rows, empty) => (
  <>
    {empty && <option value="">{empty}</option>}
    {rows.map((row) => {
      const [value, label] = Array.isArray(row) ? row : [row, row];
      return (
        <option key={value} value={value}>
          {label}
        </option>
      );
    })}
  </>
);
const input = (name, settings = {}) => (
  <input name={name} maxLength="160" {...settings} />
);
const number = (name, min = 0, step = "0.01", settings = {}) =>
  input(name, { type: "number", min, step, ...settings });
const values = (e) => Object.fromEntries(new FormData(e.currentTarget));
function Buttons({ busy, close, label = "Save entry" }) {
  return (
    <div className="form-actions">
      <button type="button" className="secondary" onClick={close}>
        Cancel
      </button>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
export function WorkerForm({ worker: w, save, busy, close }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = values(e);
        save("worker", {
          ...v,
          id: w?.id,
          active: v.active === "on",
          rate: rupees(v.rate),
        });
      }}
    >
      <div className="form-grid">
        <Field name="Worker name">
          {input("name", {
            required: true,
            defaultValue: w?.name,
            maxLength: 100,
          })}
        </Field>
        <Field name="Work / role">
          {input("job", {
            required: true,
            defaultValue: w?.job,
            maxLength: 80,
          })}
        </Field>
        <Field name="Machine number">
          {input("machine", { defaultValue: w?.machine, maxLength: 40 })}
        </Field>
        <Field name="Monthly salary (₹)" help="Daily pay uses a 30-day month.">
          {number("rate", 0.01, 0.01, {
            defaultValue: w ? w.rate / 100 : "",
            required: true,
          })}
        </Field>
        {w && (
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={w.active} />
            Active worker
          </label>
        )}
      </div>
      <Buttons {...{ close, busy }} label="Save worker" />
    </form>
  );
}
export function ProfileForm({ profile, save, busy, close }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save("profile", values(e));
      }}
    >
      <div className="form-grid">
        {[
          ["name", "Business name", 100],
          ["contact", "Contact details", 120],
          ["address", "Business address", 250],
          ["taxId", "Tax registration (optional)", 40],
          ["terms", "Invoice terms", 500],
        ].map(([key, label, limit]) => (
          <Field
            key={key}
            name={label}
            wide={["terms", "address"].includes(key)}
          >
            {["terms", "address"].includes(key) ? (
              <textarea
                name={key}
                maxLength={limit}
                defaultValue={profile[key]}
              />
            ) : (
              input(key, {
                required: key === "name",
                maxLength: limit,
                defaultValue: profile[key],
              })
            )}
          </Field>
        ))}
      </div>
      <Buttons {...{ busy, close }} label="Save seller profile" />
    </form>
  );
}
export function RecordForm({ initial, book, today, save, busy, close }) {
  const [kind, setKind] = useState(initial || "expense"),
    [category, setCategory] = useState("Syroski"),
    [preview, setPreview] = useState({});
  const worker = ["advance", "payout", "night", "bonus", "adjustment"].includes(
      kind,
    ),
    bill = ["expense", "material"].includes(kind),
    split =
      bill || ["advance", "payout", "cashbook", "settlement"].includes(kind);
  const customers = book.customers.map((c) => [c.id, c.name]);
  const defaultDay = today.startsWith(book.month) ? today : book.month + "-01";
  const derived =
    kind === "material"
      ? (preview.units !== "" && preview.units != null
          ? Number(preview.units)
          : Number(preview.packs || 0) * materials[category].factor) *
        rupees(preview.rate)
      : Math.max(0, Number(preview.pieces || 0) - Number(preview.short || 0)) *
        rupees(preview.rate);
  const handle = (e) => {
    e.preventDefault();
    const v = values(e);
    const data = { ...v, kind };
    for (const k of ["cash", "bank", "amount", "rate"])
      if (k in v) data[k] = rupees(v[k]);
    for (const k of ["days", "packs", "units", "pieces", "short"])
      if (k in v) {
        if (v[k] === "") delete data[k];
        else data[k] = Number(v[k]);
      }
    save("record", data);
  };
  return (
    <form
      onSubmit={handle}
      onChange={(e) =>
        setPreview(Object.fromEntries(new FormData(e.currentTarget)))
      }
    >
      <div className="form-grid">
        <Field name="Entry type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPreview({});
            }}
          >
            {options(Object.entries(labels))}
          </select>
        </Field>
        <Field name="Posting date">
          {input("day", {
            type: "date",
            required: true,
            min: book.month + "-01",
            max: [
              today,
              new Date(
                Date.UTC(
                  Number(book.month.slice(0, 4)),
                  Number(book.month.slice(5)),
                  0,
                ),
              )
                .toISOString()
                .slice(0, 10),
            ].sort()[0],
            defaultValue: defaultDay,
          })}
        </Field>
        {worker && (
          <Field name="Karigar">
            <select name="workerId" required>
              {options(
                book.workers
                  .filter(
                    (w) =>
                      w.active || kind === "payout" || kind === "adjustment",
                  )
                  .map((w) => [w.id, w.name]),
                "Select worker",
              )}
            </select>
          </Field>
        )}
        {kind === "expense" && (
          <Field name="Expense register">
            <select name="category">{options(expenses)}</select>
          </Field>
        )}
        {kind === "material" && (
          <Field name="Material register">
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {options(Object.keys(materials))}
            </select>
          </Field>
        )}
        {kind === "cashbook" && (
          <Field name="Direction">
            <select name="category">
              {options([
                ["Credit", "Jama · money in"],
                ["Debit", "Udhar · money out"],
              ])}
            </select>
          </Field>
        )}
        {(bill || ["advance", "payout", "cashbook"].includes(kind)) && (
          <Field name={bill ? "Supplier / party" : "Party / firm"}>
            {input("party")}
          </Field>
        )}
        {(bill || kind === "sale") && (
          <Field
            name={
              bill
                ? "Recharge to customer (optional)"
                : "Customer / sales register"
            }
          >
            <select name="customerId" required={kind === "sale"}>
              {options(
                customers,
                kind === "sale" ? "Select customer" : "Internal cost",
              )}
            </select>
          </Field>
        )}
        {kind === "sale" && (
          <>
            <Field name="Party challan number">
              {input("challan", { required: true, maxLength: 40 })}
            </Field>
            <Field name="Party design number">
              {input("partyDesign", { maxLength: 40 })}
            </Field>
            <Field name="Design number">
              {input("design", { maxLength: 40 })}
            </Field>
            <Field name="Pieces">
              {number("pieces", 1, 1, { required: true, max: 10000 })}
            </Field>
            <Field name="Sort / rejected pieces">
              {number("short", 0, 1, {
                defaultValue: 0,
                max: preview.pieces || 10000,
              })}
            </Field>
            <Field name="Rate per accepted piece (₹)">
              {number("rate", 0.01, 0.01, { required: true })}
            </Field>
            <Field name="Jama date">
              {input("jamaDate", { type: "date" })}
            </Field>
            <Field name="Jama bill number">
              {input("jamaBill", { maxLength: 50 })}
            </Field>
          </>
        )}
        {kind === "material" && (
          <>
            <Field
              name={materials[category].pack}
              help={
                "1 pack = " +
                materials[category].factor +
                " " +
                materials[category].unit
              }
            >
              {number("packs", 0.001, 0.001, { required: true })}
            </Field>
            <Field
              name={"Counted " + materials[category].unit + " (optional)"}
              help="Explain any difference in particulars."
            >
              {number("units", 1, 1)}
            </Field>
            <Field name="Rate per unit (₹)">
              {number("rate", 0.01, 0.01, { required: true })}
            </Field>
          </>
        )}
        {kind === "settlement" && (
          <Field name="Open supplier bill" wide>
            <select name="parentId" required>
              {options(
                book.unpaidBills.map((b) => [
                  b.id,
                  [
                    b.day,
                    b.party,
                    b.reference || b.category,
                    money(b.outstanding),
                  ].join(" · "),
                ]),
                "Select unpaid bill",
              )}
            </select>
          </Field>
        )}
        {kind === "night" && (
          <Field name="Night days">
            {number("days", 0.5, 0.5, { required: true, max: 31 })}
          </Field>
        )}
        {["expense", "night", "bonus", "adjustment"].includes(kind) && (
          <Field name={kind === "expense" ? "Bill total (₹)" : "Amount (₹)"}>
            {number("amount", kind === "adjustment" ? -20000000 : 0.01, 0.01, {
              required: true,
            })}
          </Field>
        )}
        {split && (
          <>
            <Field name="Cash (₹)">
              {number("cash", 0, 0.01, { defaultValue: 0 })}
            </Field>
            <Field name="Bank (₹)">
              {number("bank", 0, 0.01, { defaultValue: 0 })}
            </Field>
          </>
        )}
        {["material", "expense", "settlement", "cashbook"].includes(kind) && (
          <Field name="Bill / reference">
            {input("reference", { maxLength: 70 })}
          </Field>
        )}
        <Field
          name={
            kind === "adjustment" ? "Adjustment reason" : "Particulars / notes"
          }
          wide
        >
          <textarea
            name="memo"
            maxLength="350"
            required={kind === "adjustment" || kind === "cashbook"}
          />
        </Field>
      </div>
      {["sale", "material"].includes(kind) && (
        <div className="calc-strip">
          <span>
            {kind === "sale"
              ? "Accepted pieces × rate"
              : "Counted units × rate"}
          </span>
          <strong>{money(derived)}</strong>
        </div>
      )}
      {bill && (
        <div className="calc-strip">
          <span>Supplier balance · baki</span>
          <strong>
            {money(
              (kind === "material" ? derived : rupees(preview.amount)) -
                rupees(preview.cash) -
                rupees(preview.bank),
            )}
          </strong>
        </div>
      )}
      <Buttons {...{ busy, close }} />
    </form>
  );
}
