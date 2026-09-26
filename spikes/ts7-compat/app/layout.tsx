import type { ReactNode } from "react";

export const metadata = {
  title: "Spike TS7 — Informe de ejemplo",
  description: "Prototipo de compatibilidad TypeScript 7 con Next.js 16.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
