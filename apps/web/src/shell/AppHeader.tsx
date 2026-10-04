import Link from "next/link";
import type { RoleName } from "../auth/session.ts";
import styles from "./AppHeader.module.css";
import { MainNav } from "./MainNav.tsx";
import type { ModuleId } from "./navigation.ts";
import { UserArea } from "./UserArea.tsx";
import { Wordmark } from "./Wordmark.tsx";

export function AppHeader({
  user,
  modules = [],
}: {
  user?: { name: string; role: RoleName; jobTitle: string | null };
  modules?: readonly ModuleId[];
}) {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link href="/" className={styles.brand}>
          {/* Decorative: the visible wordmark already names the link. Plain <img>
              so srcSet picks the 96/144 px derivatives (48 px at 2x/3x). */}
          {/* biome-ignore lint/performance/noImgElement: tiny static derivatives, no optimizer */}
          <img
            className={styles.mark}
            src="/brand/hachisky-mark-96.png"
            srcSet="/brand/hachisky-mark-96.png 96w, /brand/hachisky-mark-144.png 144w"
            sizes="48px"
            alt=""
            width={48}
            height={47}
            fetchPriority="high"
          />
          <Wordmark />
        </Link>
        <MainNav allowed={modules} />
        {user ? (
          <UserArea
            name={user.name}
            role={user.role}
            jobTitle={user.jobTitle}
          />
        ) : null}
      </div>
    </header>
  );
}
