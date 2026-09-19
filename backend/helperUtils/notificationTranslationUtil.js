const fs = require("fs");
const path = require("path");
const { userCache } = require("../config/nodeCache");

const DEFAULT_LANGUAGE = "en";
const NOTIFICATIONS_LOCALES_DIR = path.join(
  __dirname,
  "../assets/locales/notifications"
);

/** @type {Record<string, Record<string, string>>} */
const catalogs = {};

const getUserModel = () => {
  // Lazy require avoids circular dependency with UserModel ↔ notifications
  // eslint-disable-next-line global-require
  return require("../models/UserModel").User;
};

const loadCatalog = (language) => {
  const normalized = normalizeLanguage(language);
  if (catalogs[normalized]) {
    return catalogs[normalized];
  }

  const filePath = path.join(NOTIFICATIONS_LOCALES_DIR, `${normalized}.json`);
  try {
    if (fs.existsSync(filePath)) {
      catalogs[normalized] = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return catalogs[normalized];
    }
  } catch (err) {
    console.error(
      `[notify-i18n] Failed to load locale "${normalized}":`,
      err?.message || err
    );
  }

  catalogs[normalized] = {};
  return catalogs[normalized];
};

const normalizeLanguage = (language) => {
  if (!language || typeof language !== "string") {
    return DEFAULT_LANGUAGE;
  }
  // Accept "es-ES" / "en_US" → "es" / "en"
  return language.trim().toLowerCase().split(/[-_]/)[0] || DEFAULT_LANGUAGE;
};

/**
 * Resolve language for a notification:
 * 1) explicit override
 * 2) req.user.language / req.locale (authMiddleware)
 * 3) default "en"
 */
const resolveNotificationLanguage = ({ req, language } = {}) => {
  return normalizeLanguage(
    language || req?.user?.language || req?.locale || DEFAULT_LANGUAGE
  );
};

const applyValues = (template, values = {}) => {
  if (!template || typeof template !== "string") {
    return template;
  }
  if (!values || typeof values !== "object") {
    return template;
  }

  return Object.keys(values).reduce((message, key) => {
    const placeholder = `{${key}}`;
    return message.split(placeholder).join(String(values[key]));
  }, template);
};

/**
 * Translate a notification string by key (same idea as sendResponse translationKey).
 * Catalogs live in backend/assets/locales/notifications/{lang}.json
 */
const translateNotification = (
  translationKey,
  { language, values = {}, req } = {}
) => {
  if (!translationKey) {
    return "";
  }

  const lang = resolveNotificationLanguage({ req, language });
  const catalog = loadCatalog(lang);
  let message = catalog[translationKey];

  if (!message) {
    const fallback = loadCatalog(DEFAULT_LANGUAGE);
    message = fallback[translationKey] || translationKey;
  }

  return applyValues(message, values);
};

/**
 * Stable key for dynamic admin/content strings (challenge titles, etc.)
 * "Earn 50 points to win 51 points" → "earn_50_points_to_win_51_points"
 */
const slugifyNotificationKey = (text) => {
  if (!text || typeof text !== "string") {
    return "";
  }
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

/**
 * Build a regex from a catalog key that contains {placeholders}.
 * "Earn {taskValue} points to win {rewardValue} points"
 * matches "Earn 50 points to win 51 points"
 */
const templateKeyToMatcher = (templateKey) => {
  const names = [];
  const parts = String(templateKey).split(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/);
  let source = "^";

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      source += parts[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else {
      names.push(parts[i]);
      // Prefer digits for typical challenge numbers; fall back to non-greedy text
      source += "(.+?)";
    }
  }
  source += "$";

  return { regex: new RegExp(source, "i"), names };
};

/**
 * Match dynamic text against template keys in a catalog (keys containing `{...}`).
 * Returns { key, values } or null.
 */
const matchCatalogTemplate = (text, catalog = {}) => {
  const raw = String(text).trim();
  let best = null;

  for (const key of Object.keys(catalog)) {
    if (!key.includes("{") || !key.includes("}")) continue;

    const { regex, names } = templateKeyToMatcher(key);
    const match = raw.match(regex);
    if (!match) continue;

    const values = {};
    names.forEach((name, index) => {
      values[name] = match[index + 1];
    });

    // Prefer the most specific template (longest key / most placeholders)
    const score = key.length + names.length * 10;
    if (!best || score > best.score) {
      best = { key, values, score };
    }
  }

  return best ? { key: best.key, values: best.values } : null;
};

/**
 * Translate dynamic content (e.g. challenge.title) via locale files — no schema change.
 * Lookup order:
 * 1) exact string / slug
 * 2) template key with {placeholders} (e.g. "Earn {a} points to win {b} points")
 * 3) original text
 */
const translateDynamicNotificationText = (
  text,
  { language, values = {}, req } = {}
) => {
  if (text === undefined || text === null || text === "") {
    return text;
  }

  const raw = String(text);
  const lang = resolveNotificationLanguage({ req, language });
  const catalog = loadCatalog(lang);
  const fallback = loadCatalog(DEFAULT_LANGUAGE);
  const slug = slugifyNotificationKey(raw);
  const shared = values || {};

  // 1) Exact / slug
  let message = catalog[raw] || (slug ? catalog[slug] : null);
  if (!message && lang !== DEFAULT_LANGUAGE) {
    message = fallback[raw] || (slug ? fallback[slug] : null);
    if (message === raw) {
      message = null;
    }
  }
  if (message) {
    return applyValues(message, shared);
  }

  // 2) Template match — patterns live as English keys with {placeholders}
  const matched =
    matchCatalogTemplate(raw, catalog) ||
    matchCatalogTemplate(raw, fallback);

  if (matched) {
    const template =
      catalog[matched.key] || fallback[matched.key] || matched.key;
    return applyValues(template, { ...matched.values, ...shared });
  }

  // 3) Passthrough
  return applyValues(raw, shared);
};

/**
 * Safely read language from userCache without throwing.
 */
const getCachedUserLanguage = (userId) => {
  try {
    const id = userId?.toString?.() || userId;
    if (!id) return null;

    const cached =
      userCache.get(id) ||
      userCache.get(String(id));

    if (cached && typeof cached === "object" && cached.language) {
      return normalizeLanguage(cached.language);
    }
  } catch (_) {
    /* cache miss / unavailable */
  }
  return null;
};

/**
 * Resolve preferred languages for recipients.
 * Priority:
 * 1) explicit `language` → all recipients
 * 2) req.user.language / req.locale → only when recipient is the requester
 *    (admin/cron acting for others must not force the actor's locale)
 * 3) userCache (safe read)
 * 4) DB fetch only for users still missing
 *
 * Returns a map of userId string → normalized language code.
 */
const getUsersNotificationLanguages = async (
  userIds = [],
  { req = null, language = null } = {}
) => {
  const ids = [
    ...new Set((userIds || []).map((id) => id?.toString()).filter(Boolean)),
  ];
  const languageByUser = {};

  if (ids.length === 0) {
    return languageByUser;
  }

  // Explicit override applies to every recipient
  if (language) {
    const lang = normalizeLanguage(language);
    for (const id of ids) {
      languageByUser[id] = lang;
    }
    return languageByUser;
  }

  const requesterId = req?.user?._id?.toString?.() || req?.user?.id?.toString?.();
  const requesterLanguage = req?.user?.language || req?.locale || null;
  const missingIds = [];

  for (const id of ids) {
    if (requesterId && requesterLanguage && id === requesterId) {
      languageByUser[id] = normalizeLanguage(requesterLanguage);
      continue;
    }

    const cachedLanguage = getCachedUserLanguage(id);
    if (cachedLanguage) {
      languageByUser[id] = cachedLanguage;
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length === 0) {
    return languageByUser;
  }

  const users = await getUserModel()
    .find({ _id: { $in: missingIds } })
    .select("language")
    .lean();

  for (const user of users) {
    languageByUser[user._id.toString()] = normalizeLanguage(
      user.language || DEFAULT_LANGUAGE
    );
  }

  // Fill any still-missing ids with default
  for (const id of missingIds) {
    if (!languageByUser[id]) {
      languageByUser[id] = DEFAULT_LANGUAGE;
    }
  }

  return languageByUser;
};

/**
 * Resolve title/body for one recipient.
 * - titleKey / bodyKey → static system strings
 * - title / body → dynamic content, translated via locale catalog when an entry exists
 */
const resolveNotificationCopy = ({
  title,
  body,
  titleKey,
  bodyKey,
  titleValues = {},
  bodyValues = {},
  values = {},
  language,
  req,
}) => {
  const lang = resolveNotificationLanguage({ req, language });
  const shared = values || {};

  const resolvedTitle = titleKey
    ? translateNotification(titleKey, {
        language: lang,
        values: { ...shared, ...titleValues },
      })
    : translateDynamicNotificationText(title, {
        language: lang,
        values: { ...shared, ...titleValues },
        req,
      });

  const resolvedBody = bodyKey
    ? translateNotification(bodyKey, {
        language: lang,
        values: { ...shared, ...bodyValues },
      })
    : translateDynamicNotificationText(body, {
        language: lang,
        values: { ...shared, ...bodyValues },
        req,
      });

  return {
    language: lang,
    title: resolvedTitle,
    body: resolvedBody,
  };
};

module.exports = {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  resolveNotificationLanguage,
  translateNotification,
  translateDynamicNotificationText,
  slugifyNotificationKey,
  getCachedUserLanguage,
  getUsersNotificationLanguages,
  resolveNotificationCopy,
};
