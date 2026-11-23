// Default blob file when a response has no real image.
// Add a key here when a type needs its own placeholder (organization, event, …).
const DEFAULT_IMAGES = {
  default: "noimage.png",
  user: "usernoimage.png",
};

const GENERIC_PLACEHOLDER = DEFAULT_IMAGES.default;

function resolveImageOptions(options) {
  const envBase = process.env.AZURE_STORAGE_BASE_URL || "";
  if (!options) return { baseUrl: envBase, kind: "default" };

  if (typeof options === "string") {
    if (DEFAULT_IMAGES[options]) return { baseUrl: envBase, kind: options };
    // A path or URL is still a base URL. An unknown kind keeps the shared placeholder.
    if (options.includes("/") || options.startsWith("http")) {
      return { baseUrl: options, kind: "default" };
    }
    return { baseUrl: envBase, kind: "default" };
  }

  if (typeof options === "object") {
    const kind = DEFAULT_IMAGES[options.kind] ? options.kind : "default";
    return { baseUrl: options.baseUrl || envBase, kind };
  }

  return { baseUrl: envBase, kind: "default" };
}

function fileNameOf(imagePath) {
  if (!imagePath) return "";
  return String(imagePath).split("?")[0].split("/").pop();
}

// Empty, or the shared noimage.png (relative or a full blob URL).
function isGenericPlaceholder(imagePath) {
  return !imagePath || fileNameOf(imagePath) === GENERIC_PLACEHOLDER;
}

function joinBase(baseUrl, fileName) {
  if (!baseUrl) return fileName;
  return baseUrl + fileName;
}

/**
 * Full blob URL for an image.
 * `options` is a kind ("user"), a base URL string, or { kind, baseUrl }.
 * A missing user photo, or one still set to noimage.png, uses usernoimage.png.
 */
function getFullImageUrl(imagePath, options) {
  const { baseUrl, kind } = resolveImageOptions(options);
  const fallback = DEFAULT_IMAGES[kind] || GENERIC_PLACEHOLDER;

  if (isGenericPlaceholder(imagePath)) {
    if (
      typeof imagePath === "string" &&
      imagePath.startsWith("http") &&
      fallback !== GENERIC_PLACEHOLDER
    ) {
      return imagePath.replace(/noimage\.png(\?.*)?$/i, `${fallback}$1`);
    }
    return joinBase(baseUrl, fallback);
  }

  if (String(imagePath).startsWith("http")) return imagePath;
  return joinBase(baseUrl, imagePath);
}

module.exports = { getFullImageUrl, DEFAULT_IMAGES };
