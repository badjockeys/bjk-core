// Shrinks big photos in the browser before upload: quicker on mobile data, and the server makes a 2048 px WebP from
// them anyway. HEIC and anything the browser can't draw is uploaded as it is.

const MAX_EDGE = 2560;
const QUALITY = 0.88;

export async function shrinkPhoto(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  const original = { blob: file as Blob, type: file.type, name: file.name };
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    typeof createImageBitmap !== "function"
  ) {
    return original;
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024) {
      bitmap.close();
      return original;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) {
      return original;
    }
    return { blob, type: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return original;
  }
}
