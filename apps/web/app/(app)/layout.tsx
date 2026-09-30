import type { ReactNode } from "react";
import { getCurrentSession } from "../../src/auth/guard.ts";
import { AppFooter } from "../../src/shell/AppFooter.tsx";
import { AppHeader } from "../../src/shell/AppHeader.tsx";
import { PreviewNotice } from "../../src/shell/PreviewNotice.tsx";

// Shell for every signed-in page. It does not authorize anything: layouts do
// not re-run on client navigation, so each page calls requireSession itself.
// The session lookup is shared with the page's requireSession (React cache).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  const user = session.status === "authenticated" ? session.user : undefined;
  return (
    <>
      <AppHeader user={user} />
      <PreviewNotice />
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <AppFooter />
    </>
  );
}
