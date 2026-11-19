import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Inbox,
  Search,
  X,
} from "lucide-react";
import { initials, statuses } from "../lib/billing.mjs";

export function Logo() {
  return (
    <span className="brand">
      <img src="/billfold.svg" width="36" height="36" alt="" style={{ flexShrink: 0 }} />
      <span>
        I Shree <span style={{ color: "var(--gold)" }}>Enterprise</span>
      </span>
    </span>
  );
}
export function Badge({ value }) {
  return (
    <span className={"badge " + value}>
      <i />
      {statuses[value] || value}
    </span>
  );
}
export function Avatar({ name }) {
  const colors = ["orchid", "peach", "aqua", "sand", "rose", "sky"];
  const hash = Array.from(name).reduce(
    (v, c) => (v * 7 + c.charCodeAt(0)) | 0,
    0,
  );
  return (
    <span
      aria-hidden="true"
      className={"avatar " + colors[Math.abs(hash) % colors.length]}
    >
      {initials(name)}
    </span>
  );
}
export function CustomerName({ name, sub }) {
  return (
    <span className="who">
      <Avatar name={name} />
      <span className="who-copy">
        <strong>{name}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </span>
  );
}
export function PanelHead({ title, extra, subtitle }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {extra}
    </div>
  );
}
export function Field({ name, children, help, wide = false }) {
  const uid = useId();
  const controlId = children?.props?.id || uid;
  return (
    <label htmlFor={controlId} className={"field" + (wide ? " wide" : "")}>
      <span id={uid + "-label"}>{name}</span>
      {isValidElement(children)
        ? cloneElement(children, {
            id: controlId,
            "aria-labelledby": uid + "-label",
            "aria-describedby": help ? uid + "-help" : undefined,
          })
        : children}
      {help && <small id={uid + "-help"}>{help}</small>}
    </label>
  );
}
export function Empty({ title = "No records yet", text, action }) {
  return (
    <div className="empty">
      <Inbox size={22} />
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}
export function RowAction({ label, onClick }) {
  return (
    <button
      type="button"
      className="row-action"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <ChevronRight size={16} />
    </button>
  );
}
export function LinkAction({ children, onClick }) {
  return (
    <button type="button" className="text-btn" onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
export function Notice({ error, children }) {
  const Icon = error ? CircleAlert : Check;
  return (
    <div
      role={error ? "alert" : "status"}
      className={"notice" + (error ? " error" : "")}
    >
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}
export function Toolbar({
  query,
  setQuery,
  placeholder,
  filter,
  setFilter,
  options,
  label = "Filter by status",
}) {
  return (
    <div className="toolbar">
      <div className="search">
        <Search size={16} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </div>
      {options && (
        <select
          aria-label={label}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {options.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
export function RecordsTable({
  headers,
  rows,
  render,
  empty,
  perPage = 10,
  noun = "records",
  totalLabel,
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages - 1);
  const start = current * perPage;
  if (!rows.length)
    return (
      <Empty
        title={empty || "No matching records"}
        text="Try a different filter or add a record."
      />
    );
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.slice(start, start + perPage).map(render)}</tbody>
        </table>
      </div>
      {(rows.length > perPage || totalLabel) && (
        <div className="table-foot">
          <span>
            {rows.length > perPage
              ? start +
                1 +
                "–" +
                Math.min(start + perPage, rows.length) +
                " of "
              : ""}
            {rows.length} {noun}
          </span>
          {rows.length > perPage && (
            <span className="pages">
              <button
                className="row-action"
                onClick={() => setPage(current - 1)}
                disabled={!current}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="row-action"
                onClick={() => setPage(current + 1)}
                disabled={current === pages - 1}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </span>
          )}
        </div>
      )}
    </>
  );
}
export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current,
      prior = document.activeElement;
    el.showModal();
    document.body.classList.add("modal-open");
    return () => {
      el.close();
      document.body.classList.remove("modal-open");
      prior?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={wide ? "dialog large" : "dialog"}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
