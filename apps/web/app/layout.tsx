import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { APP_LOCALE } from "../src/shared/format/date.ts";
import "./globals.css";

// Roboto is the IL Asesorías site typeface. It is self-hosted on purpose: the
// test runner builds with no network egress, so `next/font/google` would fail
// there. These are the official Google Fonts variable subsets (Apache-2.0).
const roboto = localFont({
  src: [
    { path: "./fonts/roboto-latin.woff2", weight: "400 700", style: "normal" },
    {
      path: "./fonts/roboto-latin-ext.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-roboto",
  display: "swap",
  // Keeps the pre-swap layout close to the final one.
  fallback: ["system-ui", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "HachiSky — Gestión empresarial inteligente",
    template: "%s · HachiSky",
  },
  description:
    "HachiSky by IL Asesorías: gestión empresarial inteligente. Vista previa de clientes, trabajo, informes y facturación.",
};

// Applies the saved (or system) theme before first paint, so dark mode never
// flashes light on load. Kept tiny and dependency-free on purpose.
const themeScript = `(function(){try{var t=localStorage.getItem('hachisky-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={APP_LOCALE}
      className={roboto.variable}
      suppressHydrationWarning
    >
      <body>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, author-controlled no-FOUC theme snippet with no interpolated input */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
