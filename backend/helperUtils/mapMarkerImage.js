/**
 * Map marker thumbnails: 120×120 WebP stored alongside org logos / event images.
 * Only used for organization logos and a single event image (first media.name).
 */
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");

const MARKER_SIZE = 120;
const MARKER_QUALITY = 75;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"]);

let _containerClient = null;

function getContainerClient() {
  if (_containerClient) return _containerClient;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!accountName || !accountKey || !containerName) {
    throw new Error("Azure storage env not configured for map markers");
  }
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
  _containerClient = blobServiceClient.getContainerClient(containerName);
  return _containerClient;
}

/** Strip CDN/base URL → blob filename. */
function toBlobName(imagePath) {
  if (!imagePath) return null;
  let s = String(imagePath).trim();
  if (!s) return null;
  const base = (process.env.AZURE_STORAGE_BASE_URL || "").trim();
  if (base && s.startsWith(base)) s = s.slice(base.length);
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      s = path.basename(new URL(s).pathname);
    } catch {
      s = path.basename(s.split("?")[0]);
    }
  }
  s = s.replace(/^\//, "");
  return s || null;
}

/**
 * Event media.name may be a single file or comma-separated list — use the first image.
 */
function firstImageFilename(mediaName) {
  if (mediaName == null) return null;
  if (Array.isArray(mediaName)) {
    for (const item of mediaName) {
      const f = firstImageFilename(item);
      if (f) return f;
    }
    return null;
  }
  const raw = String(mediaName).trim();
  if (!raw) return null;
  const parts = raw.split(/[,|]/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const blob = toBlobName(part);
    if (!blob) continue;
    const ext = path.extname(blob).toLowerCase();
    if (VIDEO_EXTS.has(ext)) continue;
    return blob;
  }
  return null;
}

async function downloadBlobBuffer(blobName) {
  const containerClient = getContainerClient();
  const client = containerClient.getBlockBlobClient(blobName);
  const download = await client.download(0);
  const chunks = [];
  for await (const chunk of download.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function uploadWebpMarker(buffer) {
  const containerClient = getContainerClient();
  const filename = `${uuidv4()}-marker-120.webp`;
  const client = containerClient.getBlockBlobClient(filename);
  await client.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: "image/webp" },
  });
  return filename;
}

async function deleteBlobQuiet(blobName) {
  if (!blobName) return;
  try {
    const name = toBlobName(blobName);
    if (!name) return;
    await getContainerClient().deleteBlob(name);
  } catch {
    // ignore missing / permission noise
  }
}

/**
 * Build a 120×120 WebP marker from an existing Azure image blob.
 * @returns {Promise<string|null>} marker filename or null
 */
async function createMapMarkerFromSource(sourceImagePath) {
  const source = toBlobName(sourceImagePath);
  if (!source) return null;

  const ext = path.extname(source).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return null;

  try {
    const original = await downloadBlobBuffer(source);
    const markerBuffer = await sharp(original)
      .rotate()
      .resize(MARKER_SIZE, MARKER_SIZE, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: MARKER_QUALITY })
      .toBuffer();
    return await uploadWebpMarker(markerBuffer);
  } catch (err) {
    console.error("[mapMarker] failed to create marker from", source, err.message);
    return null;
  }
}

/**
 * If `newSource` differs from `prevSource`, generate a new marker and drop the old one.
 * Returns the marker filename to persist (may be previous if unchanged).
 */
async function syncMapMarker({
  newSource,
  prevSource,
  prevMarker,
}) {
  const next = toBlobName(newSource) || "";
  const prev = toBlobName(prevSource) || "";

  if (!next) {
    if (prevMarker) await deleteBlobQuiet(prevMarker);
    return "";
  }

  if (next === prev && prevMarker) {
    return toBlobName(prevMarker) || prevMarker;
  }

  const marker = await createMapMarkerFromSource(next);
  if (prevMarker && toBlobName(prevMarker) !== marker) {
    await deleteBlobQuiet(prevMarker);
  }
  return marker || "";
}

module.exports = {
  MARKER_SIZE,
  toBlobName,
  firstImageFilename,
  createMapMarkerFromSource,
  syncMapMarker,
  deleteBlobQuiet,
};
