/**
 * Client-only: resize/compress images before avatar upload (square-friendly max side, JPEG).
 */

const DEFAULT_MAX_SIDE = 512;
const JPEG_QUALITY = 0.82;

export async function compressImageForProfileAvatar(
  file: File,
  maxSide: number = DEFAULT_MAX_SIDE
): Promise<{ blob: Blob; filename: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height, 1));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return { blob: file, filename: file.name };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size > file.size) {
      return { blob: file, filename: file.name };
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return { blob, filename: `${base}.jpg` };
  } catch {
    return { blob: file, filename: file.name };
  }
}
