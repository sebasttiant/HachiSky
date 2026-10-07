"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { type ActionState, IDLE } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage } from "../users/FormMessage.tsx";
import { describeLimits, type ImagePurpose } from "./image-limits.ts";
import { uploadBillingImage } from "./image-upload-client.ts";

// Upload of a signature or the issuer logo. The file goes as the raw body of
// a same-origin fetch to its upload route (requires JavaScript); `accept`
// only filters the file picker, the server validates the bytes (signature,
// structure, decoder, limits). On success the page is refreshed so the new
// version shows.
export function ImageUploadForm({
  uploadUrl,
  purpose,
  label,
  submitLabel,
}: {
  uploadUrl: string;
  purpose: ImagePurpose;
  label: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(IDLE);
  const [pending, setPending] = useState(false);
  const inputId = `${purpose}-image`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get("image");
    setPending(true);
    const next = await uploadBillingImage(
      uploadUrl,
      value instanceof File ? value : null,
    );
    setPending(false);
    setState(next);
    if (next.status === "success") {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          name="image"
          type="file"
          accept="image/png,image/jpeg"
          className={styles.input}
          required
          aria-describedby={
            state.fieldErrors?.image ? "image-error" : `${inputId}-help`
          }
          aria-invalid={state.fieldErrors?.image ? true : undefined}
        />
        <span id={`${inputId}-help`} className={styles.help}>
          {describeLimits(purpose)}
        </span>
        <FieldError state={state} name="image" />
      </div>
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending}
        >
          {pending ? "Subiendo…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
