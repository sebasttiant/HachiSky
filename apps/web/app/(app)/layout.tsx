import type { ReactNode } from "react";
import {
  getCurrentSession,
  getMustChangePassword,
} from "../../src/auth/guard.ts";
import { visibleModules } from "../../src/auth/permissions.ts";
import { AppFooter } from "../../src/shell/AppFooter.tsx";
import { AppHeader } from "../../src/shell/AppHeader.tsx";
import { PreviewNotice } from "../../src/shell/PreviewNotice.tsx";

// Shell for every signed-in page. It does not authorize anything: layouts do
// not re-run on client navigation, so each page calls requireModule itself.
// The session lookup is shared with the page's guard (React cache).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  const user = session.status === "authenticated" ? session.user : undefined;
  // While a password change is pending every module redirects to it.
  const pending = user ? await getMustChangePassword(user.id) : false;
  const modules =
    user && !pending ? visibleModules(user.role).map((m) => m.id) : [];
  return (
    <>
      <AppHeader user={user} modules={modules} />
      <PreviewNotice />
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <AppFooter />
    </>
  );
}
