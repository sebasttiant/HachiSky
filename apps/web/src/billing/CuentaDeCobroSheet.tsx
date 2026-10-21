import { formatDate } from "../shared/format/date.ts";
import styles from "./CuentaDeCobroSheet.module.css";
import type { DocumentView } from "./document.ts";
import { formatAmount } from "./money.ts";
import { billingImagePath } from "./paths.ts";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "./validation.ts";

// The printed cuenta de cobro, laid out after the owner's reference documents:
// the letterhead carries the brand only — the issuer's own data goes at the
// bottom, with the signature, never at the top (owner, 2026-10-21) and without
// the address. Then the title row with the document's identity (its
// consecutive and issue date), one recipient block, the item table, the
// total, the payment note, the signature block, the bank account to consign
// to — complete and prominent, because that is what the client acts on — and
// the tax declaration last.
//
// The recipient is stated once. An earlier version greeted the client and
// then repeated its name and identification inside a boxed grid, which read
// as two different blocks saying the same thing.
//
// Items carry no unit price on purpose. The owner fixed the columns as
// PRODUCTO | DESCRIPCIÓN | CANTIDAD | PRECIO TOTAL, with the total entered per
// line and the quantity informative, so a PRECIO UND column would imply a
// multiplication this document does not do.
//
// A draft has no number yet: it says so instead of showing a provisional
// one. The consecutive exists only from issuing on, and every issued cuenta
// carries it — code, number and date (owner, 2026-10-21).

function Missing({ children }: { children: string }) {
  return <span className={styles.missing}>{children}</span>;
}

export function CuentaDeCobroSheet({ view }: { view: DocumentView }) {
  const { client, issuer, signer, bankAccount, declaration } = view;
  // Some cuentas list quantities (hours, units) and some do not. The column
  // follows the data: it appears only when a line actually carries a quantity,
  // so a document without quantities reads as a clean three-column sheet.
  const showQuantity = view.lines.some(
    (line) => (line.quantity ?? "").trim() !== "",
  );
  const totalLabelSpan = showQuantity ? 3 : 2;
  const columnCount = showQuantity ? 4 : 3;
  return (
    <article className={styles.sheet} aria-label="Cuenta de cobro">
      <div className={styles.worlds} aria-hidden="true" />

      {/* The letterhead is the brand alone. Who issues this — name,
          identification, title — signs at the bottom of the document. */}
      {issuer.logoImageId ? (
        <header className={styles.top}>
          {/* biome-ignore lint/performance/noImgElement: private, per-version image served by an authenticated route; next/image would proxy it through the public optimizer */}
          <img
            className={styles.logo}
            src={billingImagePath(issuer.logoImageId)}
            alt={issuer.legalName}
          />
        </header>
      ) : null}

      {/* The document's own identity, given the emphasis: what it is, and
          which one it is. An issued cuenta always carries its consecutive
          and its date; a draft says it has neither, yet. */}
      <section className={styles.identity}>
        <h1 className={styles.title}>Cuenta de cobro</h1>
        <dl className={styles.identityFacts}>
          <div>
            <dt>N.º</dt>
            <dd>{view.number ?? <Missing>Sin número</Missing>}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>
              {view.issuedAt ? (
                formatDate(view.issuedAt.toISOString().slice(0, 10))
              ) : (
                <Missing>Sin emitir</Missing>
              )}
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={styles.statusPill}>
                {view.status === "issued" ? "Emitida" : "Borrador"}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <p className={styles.greeting}>Saludos Cordiales,</p>

      <section className={styles.party} aria-label="Cliente">
        <p className={styles.partyLabel}>Debe a</p>
        <dl className={styles.partyGrid}>
          <div className={styles.partyWide}>
            <dt>Razón social</dt>
            <dd className={styles.partyName}>{client.name}</dd>
          </div>
          <div>
            <dt>{client.identificationType}</dt>
            <dd>{client.identificationNumber}</dd>
          </div>
          <div>
            <dt>Ciudad</dt>
            <dd>{client.city ?? <Missing>Sin ciudad</Missing>}</dd>
          </div>
          <div className={styles.partyWide}>
            <dt>Dirección</dt>
            <dd>{client.address ?? <Missing>Sin dirección</Missing>}</dd>
          </div>
        </dl>
      </section>

      <table className={styles.items}>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Descripción</th>
            {showQuantity ? <th scope="col">Cantidad</th> : null}
            <th scope="col" className={styles.amountCol}>
              Precio total
            </th>
          </tr>
        </thead>
        <tbody>
          {view.lines.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className={styles.empty}>
                <Missing>Sin conceptos todavía</Missing>
              </td>
            </tr>
          ) : (
            view.lines.map((line) => (
              <tr key={line.position}>
                <td>{line.product}</td>
                <td>{line.description ?? ""}</td>
                {showQuantity ? <td>{line.quantity ?? ""}</td> : null}
                <td className={styles.amountCol}>
                  {formatAmount(line.amountMinor, view.currency)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={totalLabelSpan}>
              Valor Total
            </th>
            <td className={styles.total}>
              {formatAmount(view.totalMinor, view.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className={styles.note}>
        <strong>Nota:</strong>{" "}
        {view.paymentTerms ?? <Missing>Sin forma de pago</Missing>}
      </p>

      <footer className={styles.closing}>
        <p className={styles.cordially}>CORDIALMENTE,</p>

        {signer ? (
          <div className={styles.signature}>
            {signer.signatureImageId ? (
              // biome-ignore lint/performance/noImgElement: private, per-version image served by an authenticated route; next/image would proxy it through the public optimizer
              <img
                className={styles.signatureImage}
                src={billingImagePath(signer.signatureImageId)}
                alt={`Firma de ${signer.fullName}`}
              />
            ) : (
              <p className={styles.signatureLine}>
                <Missing>Sin firma cargada</Missing>
              </p>
            )}
            <p className={styles.signerName}>{signer.fullName}</p>
            <p className={styles.signerLine}>
              {signer.identificationType}: {signer.identificationNumber}
            </p>
            <p className={styles.signerLine}>
              {signer.jobTitle} en {issuer.legalName} · {signer.email}
            </p>
          </div>
        ) : (
          <p className={styles.signature}>
            <Missing>Sin firmante seleccionado</Missing>
          </p>
        )}

        {/* Where to pay, complete and prominent: this document exists so
            the client consigns, so the account number goes in full — the
            masking rule belongs to the on-screen pickers, not to the paper
            the client acts on (owner, 2026-10-21). */}
        {bankAccount ? (
          <div className={styles.bank}>
            <p className={styles.bankTitle}>Favor consignar</p>
            <p className={styles.bankNumber}>
              {ACCOUNT_TYPE_LABEL[bankAccount.accountType as AccountType] ??
                bankAccount.accountType}{" "}
              {bankAccount.bankName} · {bankAccount.accountNumber}
            </p>
            <p className={styles.bankLine}>
              A nombre de {bankAccount.holderName} · {bankAccount.currency}
            </p>
          </div>
        ) : (
          <p className={styles.bank}>
            <Missing>Sin cuenta bancaria seleccionada</Missing>
          </p>
        )}
      </footer>

      <p className={styles.declaration}>
        {declaration ? (
          declaration.body
        ) : (
          <Missing>Sin declaración tributaria</Missing>
        )}
      </p>

      {/* Discreet maker's mark, bottom-right: the software signature, kept small
          so it never competes with the issuer's identity. */}
      <p className={styles.madeWith}>
        {/* biome-ignore lint/performance/noImgElement: tiny static brand derivative, no optimizer */}
        <img
          className={styles.madeWithMark}
          src="/brand/hachisky-mark-96.png"
          alt=""
          width={18}
          height={18}
        />
        <span className={styles.madeWithText}>
          <span className={styles.madeWithName}>HachiSky</span>
          <span className={styles.madeWithBy}>by IL Asesorías</span>
        </span>
      </p>
    </article>
  );
}
