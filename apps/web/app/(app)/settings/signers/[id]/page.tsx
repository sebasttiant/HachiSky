import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import {
  setSignerActiveAction,
  updateSignerAction,
} from "../../../../../src/billing/actions.ts";
import { signerSignatureUploadPath } from "../../../../../src/billing/paths.ts";
import { SignatureSection } from "../../../../../src/billing/SignatureSection.tsx";
import { SignerForm } from "../../../../../src/billing/SignerForm.tsx";
import { SignerStatusSection } from "../../../../../src/billing/SignerStatusSection.tsx";
import {
  countSignatureVersions,
  getSigner,
} from "../../../../../src/billing/signers.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { formatDateTime } from "../../../../../src/shared/format/date.ts";
import styles from "../../../../../src/users/admin.module.css";
import { StatusBadge } from "../../../../../src/users/Badges.tsx";

export const metadata: Metadata = { title: "Firmante" };

export default async function SignerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { user } = await requireModule("settings", `/settings/signers/${id}`);
  const deps = { db: getDb() };
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const signer = await getSigner(deps, actor, id);
  if (!signer) notFound();
  const versionCount = await countSignatureVersions(deps, actor, signer.id);
  const justCreated = (await searchParams).creado === "1";

  return (
    <div className="container">
      <Link href="/settings/signers" className={styles.breadcrumb}>
        ← Firmantes
      </Link>

      <div className={styles.profile}>
        <div className={styles.identity}>
          <h1>{signer.fullName}</h1>
          <span className={styles.muted}>
            {signer.jobTitle} · {signer.identificationType}{" "}
            {signer.identificationNumber}
          </span>
        </div>
        <div className={styles.badges}>
          <StatusBadge active={signer.active} />
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Firmante creado. Ahora sube su firma.
        </p>
      ) : null}

      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <SignatureSection
            signature={signer.signature}
            versionCount={versionCount}
            uploadUrl={signerSignatureUploadPath(signer.id)}
          />
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos del firmante
            </h2>
            <SignerForm
              action={updateSignerAction.bind(null, signer.id)}
              values={signer}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </section>
          <SignerStatusSection
            active={signer.active}
            label={signer.fullName}
            deactivate={setSignerActiveAction.bind(null, signer.id, false)}
            reactivate={setSignerActiveAction.bind(null, signer.id, true)}
          />
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="facts-title">
            <h2 id="facts-title" className={styles.cardTitle}>
              Resumen
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Correo</dt>
                <dd>{signer.email}</dd>
              </div>
              <div>
                <dt>Creado</dt>
                <dd>{formatDateTime(signer.createdAt)}</dd>
              </div>
              <div>
                <dt>Última modificación</dt>
                <dd>{formatDateTime(signer.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
