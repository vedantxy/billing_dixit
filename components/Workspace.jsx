"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronRight,
  CircleCheck,
  CreditCard,
  FileText,
  Layers3,
  LayoutDashboard,
  Menu,
  BookOpen,
  LogOut,
  PanelLeft,
  Plus,
  RefreshCw,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { businessDay, niceDate, summarize } from "../lib/billing.mjs";
import { Logo, Notice } from "./ui.jsx";
import Workshop from "./Workshop.jsx";
import Dashboard from "./Dashboard.jsx";
import Records from "./Records.jsx";
import Dialogs from "./Dialogs.jsx";
const sections = {
  overview: {
    label: "Dashboard",
    title: "Dashboard",
    desc: "Welcome to I Shree Enterprise · Revenue, invoices and operations at a glance.",
    icon: LayoutDashboard,
    action: "New invoice",
    form: "invoiceForm",
  },
  workshop: {
    label: "Factory Accounts",
    title: "Factory Accounts",
    desc: "Jobwork, payroll, challans and monthly accounts for I Shree Enterprise.",
    icon: BookOpen,
  },
  customers: {
    label: "Customers",
    title: "Customers",
    desc: "Manage billing profiles and see each customer’s history.",
    icon: Users,
    action: "New customer",
    form: "customerForm",
  },
  products: {
    label: "Products & plans",
    title: "Products & plans",
    desc: "Set prices for your products and services.",
    icon: Boxes,
    action: "New product",
    form: "productForm",
  },
  subscriptions: {
    label: "Subscriptions",
    title: "Subscriptions",
    desc: "Track plan changes, billing cycles and upcoming renewals.",
    icon: Layers3,
    action: "New subscription",
    form: "subscriptionForm",
  },
  invoices: {
    label: "Invoices",
    title: "Invoices",
    desc: "Create invoices and track what’s paid or still due.",
    icon: FileText,
    action: "New invoice",
    form: "invoiceForm",
  },
  payments: {
    label: "Payments",
    title: "Payments",
    desc: "Track customer receipts and outstanding payments.",
    icon: CreditCard,
    action: "Record payment",
    form: "paymentForm",
  },
};
function route() {
  const [raw, filter] = window.location.hash.slice(1).split("/");
  return {
    section: Object.hasOwn(sections, raw) ? raw : "overview",
    filter: filter || "all",
  };
}
export default function Workspace({ user }) {
  const [location, setLocation] = useState({
    section: "overview",
    filter: "all",
  });
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const [modal, setModal] = useState(null),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState("");
  const latest = useRef(0),
    timer = useRef(null);
  const reload = useCallback(async () => {
    const version = ++latest.current;
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const json = await res.json();
      if (!res.ok) throw Error(json.error);
      if (version === latest.current) {
        setData(json);
        setError("");
      }
    } catch (e) {
      if (version === latest.current)
        setError(e.message || "Could not load the workspace.");
    }
  }, []);
  useEffect(() => {
    const handle = () => {
      setLocation(route());
      setMobile(false);
      setModal(null);
      window.scrollTo(0, 0);
    };
    handle();
    window.addEventListener("hashchange", handle);
    reload();
    return () => {
      window.removeEventListener("hashchange", handle);
      clearTimeout(timer.current);
    };
  }, [reload]);
  useEffect(() => {
    if (!mobile) return;
    const close = (e) => {
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobile]);
  const go = (section, filter = "all") => {
    const hash = section + (filter === "all" ? "" : "/" + filter);
    if (window.location.hash === "#" + hash) {
      setMobile(false);
      setModal(null);
    } else window.location.hash = hash;
  };
  const open = (type, id = null, extra = {}) => {
    if (user.role === "viewer" && /form|remove|delete/i.test(type)) {
      notify("This staff account has read-only access.");
      return;
    }
    setModal({ type, id, ...extra });
  };
  const notify = (message) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4000);
  };
  const write = async (url, method, body, key) => {
    const res = await fetch("/api/" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key || crypto.randomUUID(),
      },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw Error(json.error || "Could not save this change.");
    await reload();
    return json;
  };
  const book = data?.book;
  const today = data?.today || businessDay();
  const stats = useMemo(
    () => (book ? summarize(book, today) : null),
    [book, today],
  );
  const { section, filter } = location;
  const info = sections[section];
  return (
    <div className={"app-shell" + (user.role === "viewer" ? " read-only" : "")}>
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar" + (mobile ? " mobile-open" : "")}>
        <a
          className="brand-link"
          href="#overview"
          aria-label="I Shree Enterprise overview"
        >
          <Logo />
        </a>
        <button
          className="mobile-close icon-btn"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={18} />
        </button>
        <div className="workspace-chip">
          <span
            className="workspace-icon"
            style={{
              background: "linear-gradient(135deg, var(--gold) 0%, #A38430 100%)",
              color: "#111827",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.5px",
            }}
          >
            ISE
          </span>
          <div>
            <strong>I Shree Enterprise</strong>
            <small>ISE Billing & Operations</small>
          </div>
        </div>
        <div className="nav-group-label">ISE Platform</div>
        <nav aria-label="Main navigation">
          {Object.entries(sections).map(([id, s]) => (
            <a
              key={id}
              href={"#" + id}
              className={"nav-item" + (id === section ? " selected" : "")}
              aria-current={id === section ? "page" : undefined}
              onClick={() => setMobile(false)}
            >
              <s.icon size={18} strokeWidth={1.75} />
              {s.label}
              {id === section && <i />}
            </a>
          ))}
        </nav>
        <div className="profile">
          <span>{user.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <button
            className="logout"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              const r = await fetch("/api/session", { method: "DELETE" });
              if (r.ok) window.location.reload();
              else notify("Sign out failed. Retry.");
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-btn"
              aria-label="Open navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <PanelLeft className="desktop-glyph" size={16} />
            <span>I Shree Enterprise</span>
            <ChevronRight size={13} />
            <strong>{info.label}</strong>
          </div>
          <div className="today">
            <span /> {data ? niceDate(today, true) : "Billing workspace"}
          </div>
        </header>
        <main id="main-content" tabIndex="-1">
          <div className="page-heading">
            <div>
              <h1>{info.title}</h1>
              <p>{info.desc}</p>
            </div>
            {info.form && user.role !== "viewer" && (
              <button
                className="primary"
                disabled={!data}
                onClick={() => open(info.form)}
              >
                <Plus size={17} />
                {info.action}
              </button>
            )}
          </div>
          {error && (
            <div className="load-error">
              <Notice error>{error}</Notice>
              <button className="secondary" onClick={reload}>
                Retry
              </button>
            </div>
          )}
          {!data && !error && (
            <div className="loading" role="status">
              <RefreshCw size={18} />
              Loading records…
            </div>
          )}
          {book &&
            (section === "workshop" ? (
              <Workshop
                user={user}
                today={today}
                notify={notify}
                onBillingChange={reload}
              />
            ) : section === "overview" ? (
              <Dashboard
                book={book}
                stats={stats}
                today={today}
                go={go}
                open={open}
              />
            ) : (
              <Records
                key={section + "/" + filter}
                view={section}
                book={book}
                stats={stats}
                today={today}
                open={open}
                initialFilter={filter}
              />
            ))}
        </main>
      </div>
      {book && modal && (
        <Dialogs
          key={
            modal.type +
            (modal.id || "") +
            (modal.productId || "") +
            (modal.invoiceId || "")
          }
          modal={modal}
          book={book}
          stats={stats}
          today={today}
          open={open}
          close={() => setModal(null)}
          write={write}
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
