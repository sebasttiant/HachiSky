// Client-safe limits and messages of the billing image pipeline (image.ts,
// which imports sharp and must stay server-only). The upload form shows
// these; the server enforces them.

export type ImagePurpose = "signature" | "issuer_logo";

export const IMAGE_LIMITS = {
  // Raw upload. Enforced by the upload route handlers (image-upload.ts) from
  // Content-Length and while streaming, and again by the pipeline; the
  // global Server Function body limit is left at its default.
  maxInputBytes: 1024 * 1024,
  // Passed to sharp as limitInputPixels: refuses decompression bombs.
  maxInputPixels: 4_000_000,
  // Stored PNG after re-encoding.
  maxOutputBytes: 512 * 1024,
  dimensions: {
    // A signature is a wide strip.
    signature: { maxWidth: 2000, maxHeight: 1000 },
    // A logo may be square; 2000 x 2000 is exactly the pixel limit.
    issuer_logo: { maxWidth: 2000, maxHeight: 2000 },
  },
} as const;

export type ImageRejection =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "format_mismatch"
  | "unreadable"
  | "too_many_pixels"
  | "dimensions"
  | "animated"
  | "output_too_large";

const KB = 1024;
export const IMAGE_REJECTION_MESSAGES: Record<ImageRejection, string> = {
  empty: "Elige una imagen PNG o JPG.",
  too_large: "La imagen pesa más de 1 MB. Usa una imagen más liviana.",
  unsupported_type: "Solo se aceptan imágenes PNG o JPG.",
  format_mismatch:
    "El contenido del archivo no coincide con su formato. Usa una imagen PNG o JPG.",
  unreadable:
    "No se pudo leer la imagen: puede estar dañada o incompleta. Prueba con otra.",
  too_many_pixels:
    "La imagen tiene demasiados píxeles. Usa una imagen más pequeña.",
  dimensions: "La imagen es demasiado grande para este uso. Redúcela.",
  animated: "No se aceptan imágenes animadas ni de varias páginas.",
  output_too_large: `La imagen procesada supera ${IMAGE_LIMITS.maxOutputBytes / KB} KB. Usa una imagen más simple o más pequeña.`,
};

export function describeLimits(purpose: ImagePurpose): string {
  const { maxWidth, maxHeight } = IMAGE_LIMITS.dimensions[purpose];
  return `PNG o JPG, máximo ${IMAGE_LIMITS.maxInputBytes / (KB * KB)} MB y ${maxWidth} × ${maxHeight} píxeles. Se guarda una copia PNG sin metadatos.`;
}
