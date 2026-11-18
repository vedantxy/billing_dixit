import "@fontsource-variable/dm-sans/index.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";
import "./workshop.css";
export const metadata = {
  title: "Billfold · Workshop accounts",
  description: "Billing, jobwork challans, payroll and workshop accounts.",
  icons: { icon: "/billfold.svg" },
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
