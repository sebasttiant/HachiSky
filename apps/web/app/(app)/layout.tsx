import type { ReactNode } from "react";
import { AppFooter } from "../../src/shell/AppFooter.tsx";
import { AppHeader } from "../../src/shell/AppHeader.tsx";
import { PreviewNotice } from "../../src/shell/PreviewNotice.tsx";

// Shell for every signed-in page. It does not authorize anything: layouts do
// not re-run on client navigation, so each page calls requireSession itself.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <PreviewNotice />
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <AppFooter />
    </>
  );
}
