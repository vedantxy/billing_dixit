import "@fontsource-variable/dm-sans/index.css";
import "./globals.css";
import "./workshop.css";

export const metadata = {
  title: "I Shree Enterprise · Billing & Accounts",
  description: "Professional billing, invoicing, payroll and operations management for I Shree Enterprise.",
  icons: { icon: "/billfold.svg" },
};

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
