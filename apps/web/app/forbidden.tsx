import type { Metadata } from "next";
import Link from "next/link";
import { AppFooter } from "../src/shell/AppFooter.tsx";
import headerStyles from "../src/shell/AppHeader.module.css";
import { ForbiddenNotice } from "../src/shell/ForbiddenNotice.tsx";
import { Wordmark } from "../src/shell/Wordmark.tsx";

export const metadata: Metadata = { title: "Sin acceso" };

// Rendered by forbidden() (src/auth/guard.ts) with HTTP 403 outside the
// signed-in shell; app/(app)/forbidden.tsx covers pages inside it.
export default function Forbidden() {
  return (
    <>
      <header className={headerStyles.header}>
        <div className={`container ${headerStyles.bar}`}>
          <Link href="/" className={headerStyles.brand}>
            {/* biome-ignore lint/performance/noImgElement: tiny static derivatives, no optimizer */}
            <img
              className={headerStyles.mark}
              src="/brand/hachisky-mark-96.png"
              srcSet="/brand/hachisky-mark-96.png 96w, /brand/hachisky-mark-144.png 144w"
              sizes="48px"
              alt=""
              width={48}
              height={47}
            />
            <Wordmark />
          </Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1}>
        <ForbiddenNotice />
      </main>

      <AppFooter />
    </>
  );
}
