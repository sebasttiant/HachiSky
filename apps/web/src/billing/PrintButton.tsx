"use client";

import type { ReactNode } from "react";

// Exports the printable document by opening the browser's print dialog, where
// the user chooses "Save as PDF". There is no server-side PDF generator; the
// print stylesheet on the document route isolates the sheet so the PDF is just
// the cuenta de cobro.
export function PrintButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {children}
    </button>
  );
}
