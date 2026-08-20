import {
  getSetImage,
  getProfileLogo,
  isSetImagePath,
  isProfileLogoPath,
} from "@repo/storage";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Infer the MIME type of a stored image from its file extension. */
export function mimeTypeForImage(relativePath: string): string {
  const ext = relativePath.split(".").pop()?.toLowerCase() || "png";
  return MIME_TYPES[ext] ?? "image/png";
}

/**
 * Resolve a stored image path (set image or profile logo) to a base64 data URL
 * so Puppeteer can render it without a live static server.
 *
 * Returns null when the value is not a stored image path or the file is
 * missing / unreadable; callers soft-fail and keep the raw path instead.
 */
export async function imagePathToDataUrl(
  value: string,
): Promise<string | null> {
  let buffer: Buffer | null = null;
  if (isSetImagePath(value)) {
    buffer = await getSetImage(value);
  } else if (isProfileLogoPath(value)) {
    buffer = await getProfileLogo(value);
  } else {
    return null;
  }
  if (!buffer) return null;
  const mime = mimeTypeForImage(value);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}