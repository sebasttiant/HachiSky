"use client";

import { startTransition, useActionState, useState } from "react";
import { IMAGE_LIMITS } from "../images/limits.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import type { ReportImageRecord } from "./images.ts";
import figures from "./ReportImagesEditor.module.css";
import { REPORT_LIMITS } from "./validation.ts";

// The figures of one section: add, correct the text, reorder, remove.
//
// Uploading is a plain fetch to the dedicated route rather than a Server
// Function, because that route is the only place that can bound the request
// body before anything parses it. Everything else is text and ids, so it
// goes through the ordinary Server Functions.
//
// The preview reads the authenticated route, never a public or object URL:
// these bytes are only ever served to somebody who may reach the report.

type ImageAction = (
  previous: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export interface ReportImagesEditorProps {
  reportId: string;
  sectionKey: string;
  images: ReportImageRecord[];
  updateText: ImageAction;
  remove: ImageAction;
  move: ImageAction;
  // Re-reads the page after an upload. The upload is the one mutation that
  // does not go through a Server Function, so nothing revalidated for it;
  // this closes that gap through the same guarded path as the rest instead
  // of reaching for the router, which the rest of this app never needs.
  refresh: (previous: ActionState) => Promise<ActionState>;
  limit: number;
}

const ACCEPT = "image/png,image/jpeg";

export function imagePath(id: string) {
  return `/api/reports/images/${id}`;
}

function uploadPath(reportId: string, sectionKey: string) {
  return `/api/reports/${reportId}/sections/${encodeURIComponent(sectionKey)}/images`;
}

export function ReportImagesEditor({
  reportId,
  sectionKey,
  images,
  updateText,
  remove,
  move,
  refresh,
  limit,
}: ReportImagesEditorProps) {
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [, reread] = useActionState(refresh, { status: "idle" });
  const full = images.length >= limit;

  async function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = new FormData(formElement);
    setBusy(true);
    setState({ status: "idle" });
    try {
      // No Content-Type here on purpose: the browser has to set it with its
      // own multipart boundary, and setting it by hand breaks the parse.
      const response = await fetch(uploadPath(reportId, sectionKey), {
        method: "POST",
        body,
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      if (!response.ok || !payload?.ok) {
        setState({
          status: "error",
          message: payload?.message ?? "No se pudo subir la imagen.",
          fieldErrors: payload?.fieldErrors,
        });
        return;
      }
      formElement.reset();
      setState({ status: "success", message: payload.message });
      startTransition(() => reread());
    } catch {
      setState({
        status: "error",
        message: "No se pudo subir la imagen. Revisa tu conexión.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={figures.block} aria-label="Imágenes de la sección">
      <h3 className={figures.title}>Imágenes</h3>

      {images.length === 0 ? (
        <p className={styles.cardHint}>
          Esta sección todavía no tiene imágenes.
        </p>
      ) : (
        <ol className={figures.list}>
          {images.map((image, index) => (
            <Figure
              key={image.id}
              image={image}
              first={index === 0}
              last={index === images.length - 1}
              updateText={updateText}
              remove={remove}
              move={move}
            />
          ))}
        </ol>
      )}

      <form className={styles.form} onSubmit={onUpload} noValidate>
        <div className={styles.field}>
          <label htmlFor={`image-file-${sectionKey}`}>Imagen</label>
          <input
            id={`image-file-${sectionKey}`}
            name="image"
            type="file"
            accept={ACCEPT}
            className={styles.input}
            required
            disabled={full || busy}
          />
          <p className={styles.cardHint}>
            PNG o JPEG, hasta {Math.floor(IMAGE_LIMITS.maxInputBytes / 1024)} KB
            y {IMAGE_LIMITS.dimensions.report_figure.maxWidth} ×{" "}
            {IMAGE_LIMITS.dimensions.report_figure.maxHeight} píxeles. Se guarda
            convertida a PNG, sin los metadatos del archivo original.
          </p>
          <FieldError state={state} name="image" />
        </div>

        <div className={styles.field}>
          <label htmlFor={`image-title-${sectionKey}`}>Título</label>
          <input
            id={`image-title-${sectionKey}`}
            name="title"
            className={styles.input}
            maxLength={REPORT_LIMITS.imageTitle}
            required
            disabled={full || busy}
            {...fieldProps(state, "title")}
          />
          <FieldError state={state} name="title" />
        </div>

        <div className={styles.field}>
          <label htmlFor={`image-caption-${sectionKey}`}>
            Descripción (opcional)
          </label>
          <textarea
            id={`image-caption-${sectionKey}`}
            name="caption"
            className={`${styles.input} ${styles.textarea}`}
            maxLength={REPORT_LIMITS.imageCaption}
            disabled={full || busy}
            {...fieldProps(state, "caption")}
          />
          <FieldError state={state} name="caption" />
        </div>

        {full ? (
          <p className={styles.cardHint}>
            Esta sección ya tiene {limit} imágenes, el máximo.
          </p>
        ) : null}

        <FormMessage state={state} />
        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.secondary}`}
            disabled={full || busy}
          >
            {busy ? "Subiendo…" : "Agregar imagen"}
          </button>
        </div>
      </form>
    </section>
  );
}

// One stored figure. Its three forms are siblings, never nested: a form
// inside a form is not valid HTML and the browser drops the inner one.
function Figure({
  image,
  first,
  last,
  updateText,
  remove,
  move,
}: {
  image: ReportImageRecord;
  first: boolean;
  last: boolean;
  updateText: ImageAction;
  remove: ImageAction;
  move: ImageAction;
}) {
  const text = useFormAction(updateText);
  const order = useFormAction(move);
  const removal = useFormAction(remove);

  return (
    <li className={figures.item}>
      {/* The authenticated route, so the preview obeys the same rules as the
          document: no public URL for these bytes. */}
      {/* biome-ignore lint/performance/noImgElement: private figure served by an authenticated route; next/image would proxy it through the public optimizer */}
      <img
        className={figures.preview}
        src={imagePath(image.id)}
        alt={image.title}
        width={image.width}
        height={image.height}
      />

      <form className={styles.form} onSubmit={text.onSubmit} noValidate>
        <input type="hidden" name="imageId" value={image.id} />
        <div className={styles.field}>
          <label htmlFor={`title-${image.id}`}>Título</label>
          <input
            id={`title-${image.id}`}
            name="title"
            className={styles.input}
            maxLength={REPORT_LIMITS.imageTitle}
            defaultValue={image.title}
            required
            {...fieldProps(text.state, "title")}
          />
          <FieldError state={text.state} name="title" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`caption-${image.id}`}>Descripción</label>
          <textarea
            id={`caption-${image.id}`}
            name="caption"
            className={`${styles.input} ${styles.textarea}`}
            maxLength={REPORT_LIMITS.imageCaption}
            defaultValue={image.caption ?? ""}
            {...fieldProps(text.state, "caption")}
          />
          <FieldError state={text.state} name="caption" />
        </div>
        <FormMessage state={text.state} />
        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.secondary}`}
            disabled={text.pending}
          >
            {text.pending ? "Guardando…" : "Guardar texto"}
          </button>
        </div>
      </form>

      <form className={figures.controls} onSubmit={order.onSubmit} noValidate>
        <input type="hidden" name="imageId" value={image.id} />
        {/* The button's own name and value travel with the submission, so one
            form serves both directions. Disabled at the ends: there is
            nothing to swap with there. */}
        <button
          type="submit"
          name="direction"
          value="up"
          className={`${styles.button} ${styles.secondary}`}
          disabled={first || order.pending}
        >
          Subir
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          className={`${styles.button} ${styles.secondary}`}
          disabled={last || order.pending}
        >
          Bajar
        </button>
        <FormMessage state={order.state} />
      </form>

      <form className={figures.controls} onSubmit={removal.onSubmit} noValidate>
        <input type="hidden" name="imageId" value={image.id} />
        <button
          type="submit"
          className={`${styles.button} ${styles.danger}`}
          disabled={removal.pending}
        >
          {removal.pending ? "Eliminando…" : "Eliminar imagen"}
        </button>
        <FormMessage state={removal.state} />
      </form>
    </li>
  );
}
