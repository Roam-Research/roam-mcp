import { z } from "zod";
import { readFile } from "fs/promises";
import { basename, extname } from "path";
import type { CallToolResult, RoamActionClient } from "../types.js";
import { imageResult, textResult } from "../types.js";

// Schemas
export const FileGetSchema = z.object({
  url: z.string().describe("Firebase storage URL of the file"),
});

export const FileUploadSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe("Local file path (preferred) - server reads the file directly"),
  url: z.string().optional().describe("Remote URL to fetch the file from"),
  base64: z
    .string()
    .optional()
    .describe("Base64-encoded file data (fallback for sandboxed clients)"),
  mimetype: z
    .string()
    .optional()
    .describe("MIME type (e.g., image/png, image/jpeg) - auto-detected if not provided"),
  filename: z
    .string()
    .optional()
    .describe("Original filename for reference - derived from path/url if not provided"),
});

export const FileDeleteSchema = z.object({
  url: z.string().describe("Firebase storage URL of the file to delete"),
});

// Types derived from schemas
export type FileGetParams = z.infer<typeof FileGetSchema>;
export type FileUploadParams = z.infer<typeof FileUploadSchema>;
export type FileDeleteParams = z.infer<typeof FileDeleteSchema>;

// Response types from Roam API
interface FileGetResponse {
  base64: string;
  mimetype?: string;
  filename?: string;
}

// Response is a URL string (possibly wrapped in markdown: "![](url)")
type FileUploadResponse = string;

// Detect MIME type from base64 image data by checking magic bytes
function detectMimeTypeFromBase64(base64: string): string | null {
  // JPEG: FF D8 FF -> /9j/
  if (base64.startsWith("/9j/")) return "image/jpeg";
  // PNG: 89 50 4E 47 -> iVBOR
  if (base64.startsWith("iVBOR")) return "image/png";
  // GIF: 47 49 46 38 -> R0lG
  if (base64.startsWith("R0lG")) return "image/gif";
  // WebP: 52 49 46 46 ... 57 45 42 50 -> UklGR
  if (base64.startsWith("UklGR")) return "image/webp";
  // BMP: 42 4D -> Qk
  if (base64.startsWith("Qk")) return "image/bmp";
  // PDF: 25 50 44 46 -> JVBE
  if (base64.startsWith("JVBE")) return "application/pdf";
  // TIFF (little-endian): 49 49 2A 00 -> SUkq
  if (base64.startsWith("SUkq")) return "image/tiff";
  // TIFF (big-endian): 4D 4D 00 2A -> TU0A
  if (base64.startsWith("TU0A")) return "image/tiff";
  // ICO: 00 00 01 00 -> AAAB
  if (base64.startsWith("AAAB")) return "image/x-icon";
  // AVIF/HEIC: check for ftyp box (base64 varies, check common patterns)
  // These are harder to detect reliably from base64 prefix alone
  return null;
}

// Detect MIME type from file extension
function detectMimeTypeFromExtension(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Common image formats
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    // Modern formats
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".avif": "image/avif",
    // Documents
    ".pdf": "application/pdf",
    // Text / web / data (no reliable magic bytes — extension is the only signal)
    ".html": "text/html",
    ".htm": "text/html",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".json": "application/json",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".css": "text/css",
    ".js": "text/javascript",
    ".rtf": "application/rtf",
    // Audio / video
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    // Office / archives
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
  };
  return mimeTypes[ext] || null;
}

// Read file from local path and return base64 + mimetype
async function readLocalFile(
  filePath: string,
): Promise<{ base64: string; mimetype: string; filename: string }> {
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");
  const filename = basename(filePath);

  // Try extension first, then magic bytes; fall back to a generic binary type
  // rather than failing — Roam accepts any mimetype, so an undetected type (e.g.
  // an .html article backup) should still upload, not error out.
  const mimetype =
    detectMimeTypeFromExtension(filePath) ||
    detectMimeTypeFromBase64(base64) ||
    "application/octet-stream";

  return { base64, mimetype, filename };
}

// Fetch file from URL and return base64 + mimetype
async function fetchRemoteFile(
  url: string,
): Promise<{ base64: string; mimetype: string; filename: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  // Extract filename from URL path
  const urlPath = new URL(url).pathname;
  const filename = basename(urlPath) || "image";

  // Try Content-Type header first, then extension, then magic bytes; fall back to
  // a generic binary type rather than failing (Roam accepts any mimetype).
  let mimetype = response.headers.get("content-type")?.split(";")[0];
  if (!mimetype || mimetype === "application/octet-stream") {
    mimetype =
      detectMimeTypeFromExtension(urlPath) ||
      detectMimeTypeFromBase64(base64) ||
      "application/octet-stream";
  }

  return { base64, mimetype, filename };
}

export async function getFile(
  client: RoamActionClient,
  params: FileGetParams,
): Promise<CallToolResult> {
  const response = await client.call<FileGetResponse>("file.get", [
    { url: params.url, format: "base64" },
  ]);

  if (!response.result) {
    throw new Error("No file data returned");
  }

  const { base64, mimetype } = response.result;
  const mimeType = mimetype || detectMimeTypeFromBase64(base64);

  if (mimeType?.startsWith("image/")) {
    return imageResult(base64, mimeType);
  }

  // Non-image file - return as text (base64 encoded)
  return textResult(response.result);
}

export async function uploadFile(
  client: RoamActionClient,
  params: FileUploadParams,
): Promise<CallToolResult> {
  // Validate exactly one source is provided
  const sources = [params.filePath, params.url, params.base64].filter(Boolean);
  if (sources.length === 0) {
    throw new Error("One of filePath, url, or base64 must be provided");
  }
  if (sources.length > 1) {
    throw new Error("Only one of filePath, url, or base64 should be provided");
  }

  let base64: string;
  let mimetype: string;
  let filename: string | undefined;

  if (params.filePath) {
    // Read from local file system
    const fileData = await readLocalFile(params.filePath);
    base64 = fileData.base64;
    mimetype = params.mimetype || fileData.mimetype;
    filename = params.filename || fileData.filename;
  } else if (params.url) {
    // Fetch from remote URL
    const fileData = await fetchRemoteFile(params.url);
    base64 = fileData.base64;
    mimetype = params.mimetype || fileData.mimetype;
    filename = params.filename || fileData.filename;
  } else {
    // Use provided base64 directly (params.base64 must be set due to validation above).
    // Magic bytes are more reliable than the caller's filename extension, so try
    // them first, then the extension (covers text types like .html), then generic.
    base64 = params.base64!;
    mimetype =
      params.mimetype ||
      detectMimeTypeFromBase64(base64) ||
      (params.filename ? detectMimeTypeFromExtension(params.filename) : null) ||
      "application/octet-stream";
    filename = params.filename;
  }

  const response = await client.call<FileUploadResponse>("file.upload", [
    { base64, mimetype, filename },
  ]);

  if (!response.result) {
    throw new Error("No URL returned from upload");
  }

  let url = response.result;

  // Strip markdown image wrapper if present (API currently returns "![](url)")
  if (url.startsWith("![](") && url.endsWith(")")) {
    url = url.slice(4, -1);
  }

  return textResult({ url });
}

export async function deleteFile(
  client: RoamActionClient,
  params: FileDeleteParams,
): Promise<CallToolResult> {
  await client.call<undefined>("file.delete", [{ url: params.url }]);
  // Unlike block/page deletes, file.delete currently returns no deletion report; preserve
  // this legacy synthesized response. If its server contract later reports `deleted`, update
  // this operation deliberately rather than silently discarding that report here.
  return textResult({ deleted: true });
}
