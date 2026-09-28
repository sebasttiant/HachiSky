import Image from "next/image";
import Link from "next/link";
import styles from "./AppHeader.module.css";
import { MainNav } from "./MainNav.tsx";
import { Wordmark } from "./Wordmark.tsx";

export function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link href="/" className={styles.brand}>
          <Image
            className={styles.mark}
            src="/brand/hachisky-mark.png"
            alt="HachiSky"
            width={512}
            height={506}
            unoptimized
            priority
          />
          <Wordmark />
        </Link>
        <MainNav />
      </div>
    </header>
  );
}
