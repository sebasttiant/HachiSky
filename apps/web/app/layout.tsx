import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_LOCALE } from "../src/shared/format/date.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HachiSky — Gestión empresarial inteligente",
    template: "%s · HachiSky",
  },
  description:
    "HachiSky by IL Asesorías: gestión empresarial inteligente. Vista previa de clientes, trabajo, informes y facturación.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={APP_LOCALE}>
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
