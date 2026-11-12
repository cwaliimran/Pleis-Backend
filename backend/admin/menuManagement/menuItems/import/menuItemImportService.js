/**
 * Menu item CSV / Excel import + export (Requirement Set #122).
 *
 * Flow (stateless — the admin re-sends the file with each step):
 *   1. parse     → sheets, header row, columns, rows (preview) + suggested column mapping
 *   2. validate  → apply column mapping + value mapping (organizer names → our records),
 *                  per-row result (create / update / error) and the values still unmapped
 *   3. commit    → writes valid rows (or nothing if stopOnError and any row fails)
 *
 * Decisions left to the dev team by the Requirement Set (#122 "TO BE SUPPLIED"):
 *   matching key: `id` column (our item id) → update that item; otherwise menu + name
 *                 (case-insensitive) → update; otherwise create.
 *   invalid rows: the admin chooses — import valid rows only (default) or stop on any error.
 */
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const MenuSubcategory = require("@MenuSubcategoryModel");
const PresetType = require("@PresetTypeModel");
const MenuItemSubCategoryType = require("@MenuItemSubCategoryTypeModel");
const Brand = require("@BrandModel");
const Serving = require("@ServingModel");
const Daypart = require("@DaypartModel");
const DietTags = require("@DietTagsModel");
const Allergen = require("@AllergenModel");
const Organizations = require("@OrganizationModel");
const { generateUniqueAllergenCode } = require("../../../presetMenu/allergen/allergenRepository");
const { generateUniqueDietTagsCode } = require("../../../presetMenu/dietTags/dietTagsRepository");
const { generateUniqueDaypartCode } = require("../../../presetMenu/daypart/daypartRepository");
const { convertTimezoneToUtc } = require("@utils/responseUtil");
const { parseImportFile, buildTable, toCsv, ImportFileError } = require("../../../../commonModules/importer/fileParser");
const { buildXlsx, colName } = require("../../../../commonModules/importer/xlsxWriter");
const { FIELDS, FIELD_BY_KEY, TEMPLATE_FIELDS, SAMPLE_ROWS, DAYS, MENUS_ROW_LABELS } = require("./menuItemImportFields");

const SKIP = "__skip__";
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v)) && /^[a-f0-9]{24}$/i.test(String(v));
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/* ------------------------------------------------------------------ lookups */

const servingLabel = (s) => [s.type, s.unit && `(${s.unit})`].filter(Boolean).join(" ") || s.code;

/**
 * Preset catalogue in catalogue order: category → subcategory → type (in the order they were
 * entered), each type's own record first, then its items by code. Every record has its own
 * code (3 letters + running number, e.g. COF0429), shown as "COF0429 · Coffee, espresso › Espresso";
 * a type's own record as "COF0424 · Coffee, espresso".
 */
const presetCatalogue = (presetTypes, types) => {
  const typeName = new Map(types.map((t) => [String(t._id), t.name]));
  const cmp = (a, b) => String(a || "").localeCompare(String(b || ""));
  return presetTypes
    .map((p) => {
      const tName = typeName.get(String(p.type)) || "";
      const isTypeRecord = !tName || norm(tName) === norm(p.name);
      const path = isTypeRecord ? p.name : `${tName} › ${p.name}`;
      return { ...p, tName, isTypeRecord, path, num: Number(String(p.code).replace(/\D/g, "")) || 0 };
    })
    .sort(
      (a, b) =>
        cmp(a.category, b.category) ||
        cmp(a.subCategory, b.subCategory) ||
        cmp(a.type, b.type) ||
        Number(b.isTypeRecord) - Number(a.isTypeRecord) ||
        a.num - b.num
    )
    .map((p) => ({
      id: String(p._id),
      label: `${p.code} · ${p.path}`,
      keys: [norm(`${p.code} · ${p.path}`), norm(p.code)],
      code: p.code,
      path: normPath(p.path),
      name: norm(p.name),
    }));
};
const normPath = (v) => norm(v).split(/\s*[›>]\s*/).join(" › ");

/** Our records a file value can be mapped to, scoped to the company. */
const getLookups = async (companyOrganizer) => {
  const owner = new mongoose.Types.ObjectId(String(companyOrganizer));
  const live = { status: { $ne: "deleted" } };
  const [menus, subCategories, presetTypes, presetTypeTypes, brands, servings, dayparts, dietTags, allergens, venues] = await Promise.all([
    Menus.find({ creator: owner, ...live }).select("title organization").lean(),
    MenuSubcategory.find({ companyOrganizer: owner, ...live }).select("title").lean(),
    PresetType.find({ ...live }).select("name code type category subCategory").lean(),
    MenuItemSubCategoryType.find({}).select("name").lean(),
    Brand.find({ ...live }).select("name").lean(),
    Serving.find({ ...live }).select("code type unit level2").lean(),
    Daypart.find({ ...live }).select("name code").lean(),
    DietTags.find({ ...live }).select("name code").lean(),
    Allergen.find({ ...live }).select("name code").lean(),
    Organizations.find({ creator: owner, ...live }).select("basicInfo.name").lean(),
  ]);
  // "milk (mlijeko)" is also found as "milk" and "mlijeko", so an organizer file in either
  // language matches the existing record instead of creating a near-duplicate.
  const variants = (v) => {
    const n = norm(v);
    const out = [n];
    const m = n.match(/^(.*?)\s*\((.*)\)\s*$/);
    if (m) out.push(m[1].trim(), ...m[2].split(/[,/]/).map((x) => x.trim()));
    return out.filter(Boolean);
  };
  const opt = (rows, label, keys = []) =>
    rows.map((r) => ({
      id: String(r._id),
      label: label(r),
      keys: [...new Set([label(r), ...keys.map((k) => r[k])].filter(Boolean).flatMap(variants))],
    }));
  return {
    menu: opt(menus, (r) => r.title),
    subCategory: opt(subCategories, (r) => r.title),
    presetType: presetCatalogue(presetTypes, presetTypeTypes),
    brand: opt(brands, (r) => r.name),
    serving: opt(servings, servingLabel, ["code", "type"]),
    daypart: opt(dayparts, (r) => r.name, ["code"]),
    dietTag: opt(dietTags, (r) => r.name, ["code"]),
    allergen: opt(allergens, (r) => r.name, ["code"]),
    organization: opt(venues, (r) => r.basicInfo?.name || "Venue"),
    // venue of the company's existing menus — default home for menus the import creates
    defaultOrganization: menus[0]?.organization ? String(menus[0].organization) : venues[0] ? String(venues[0]._id) : null,
  };
};

/**
 * Names that do not exist yet are CREATED on import (the organizer's file is adapted to our
 * columns, so a new name means a new record). Preset types are not: each needs an image and a
 * category hierarchy, so an unknown preset type stays an error.
 */
const CREATABLE = new Set(["menu", "subCategory", "brand", "serving", "daypart", "dietTag", "allergen"]);
const NEW_PREFIX = "new:";
const placeholder = (ref, name) => `${NEW_PREFIX}${ref}:${norm(name)}`;
const isPlaceholder = (v) => typeof v === "string" && v.startsWith(NEW_PREFIX);

/* ------------------------------------------------------------------ value parsing */

const TRUE = new Set(["1", "true", "yes", "y", "da", "x", "✓", "✔", "on", "active", "aktivno"]);
const FALSE = new Set(["0", "false", "no", "n", "ne", "off", "", "-", "inactive", "neaktivno"]);

const parseBoolean = (raw) => {
  const v = norm(raw);
  if (TRUE.has(v)) return { value: true };
  if (FALSE.has(v)) return { value: false };
  return { error: `“${raw}” is not yes/no` };
};

const parseNumber = (raw) => {
  let s = String(raw ?? "").replace(/[€\s]|eur/gi, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,50
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? { value: n } : { error: `“${raw}” is not a number` };
};

const parseTax = (raw) => {
  const p = parseNumber(String(raw).replace("%", ""));
  if (p.error) return { error: `“${raw}” is not a tax class` };
  let n = p.value;
  if (n > 0 && n < 1) n = Math.round(n * 100); // 0.25 → 25
  return ["25", "13", "5", "0"].includes(String(n)) ? { value: n } : { error: `Tax ${raw} is not one of 25, 13, 5, 0` };
};

/**
 * A time cell arrives as an Excel time value (fraction of a day: 07:00 → 0.2916…, or a date
 * serial with a time part) or as text ("07:00", "7:00", "07.00", "7:00 PM").
 */
const parseTime = (raw) => {
  const s = String(raw).trim();
  if (/^\d+\.\d+(e-?\d+)?$/i.test(s) || /^0$/.test(s)) {
    const n = Number(s);
    if (n < 1 || n >= 1000) {
      const minutes = Math.round((n - Math.floor(n)) * 1440) % 1440;
      return { value: moment.utc(0).add(minutes, "minutes").format("hh:mm A") };
    }
  }
  const m = moment(s, ["HH:mm", "H:mm", "HH:mm:ss", "H:mm:ss", "HH.mm", "H.mm", "hh:mm A", "h:mm A", "h:mm a", "hh:mm:ss A"], true);
  return m.isValid() ? { value: m.format("hh:mm A") } : { error: `“${raw}” is not a time (HH:mm)` };
};

/** "COF0429 · Coffee, espresso › Espresso" | "COF0429" | "Coffee, espresso › Espresso" | "Espresso" */
const resolvePreset = (raw, options) => {
  const s = String(raw).trim().replace(/\s+/g, " ");
  const m = s.match(/^([A-Za-z]{3}\d{3,})\b\s*(?:[·•|:–-]\s*)?(.*)$/);
  if (m) {
    // Our code identifies the record; the name after it is ignored (names repeat across types).
    const byCode = options.find((o) => o.code.toLowerCase() === m[1].toLowerCase());
    if (byCode) return { value: byCode.id };
  }
  // No code of ours (e.g. catalogue v9 "COF001 · …"): match on "Type › Item" (unique), or on a
  // name alone only when exactly one record has it.
  const rest = normPath(m ? m[2] : s);
  if (!rest) return { unresolved: s };
  const byPath = options.filter((o) => o.path === rest);
  if (byPath.length === 1) return { value: byPath[0].id };
  if (!rest.includes("›")) {
    const byName = options.filter((o) => o.name === rest);
    if (byName.length === 1) return { value: byName[0].id };
    if (byName.length > 1) return { ambiguous: s, candidates: byName.map((o) => o.label) };
  }
  return { unresolved: s };
};

const splitList = (raw) =>
  String(raw ?? "")
    .split(/[,;|/\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const DAY_ALIASES = {
  mon: "monday", pon: "monday", ponedjeljak: "monday",
  tue: "tuesday", uto: "tuesday", utorak: "tuesday",
  wed: "wednesday", sri: "wednesday", srijeda: "wednesday",
  thu: "thursday", čet: "thursday", cet: "thursday", četvrtak: "thursday", cetvrtak: "thursday",
  fri: "friday", pet: "friday", petak: "friday",
  sat: "saturday", sub: "saturday", subota: "saturday",
  sun: "sunday", ned: "sunday", nedjelja: "sunday",
};

/** Resolve one file value of a reference field to our record id. */
const resolveRef = (field, raw, lookups, valueMap = {}) => {
  const key = String(raw).trim();
  if (Object.prototype.hasOwnProperty.call(valueMap, key)) {
    const mapped = valueMap[key];
    if (mapped === SKIP) return { skip: true };
    if (lookups[field.ref].some((o) => o.id === mapped)) return { value: mapped };
  }
  if (isObjectId(key) && lookups[field.ref].some((o) => o.id === key)) return { value: key };
  if (field.ref === "presetType") return resolvePreset(key, lookups.presetType);
  const hit = lookups[field.ref].find((o) => o.keys.includes(norm(key)));
  return hit ? { value: hit.id } : { unresolved: key };
};

/** " — use one of: A, B, C … (see the Valid values sheet)" */
const validHint = (options = []) => {
  if (!options.length) return " — none exist in this company yet; create them in Pleis first";
  const names = options.slice(0, 6).map((o) => o.label).join(", ");
  return ` — use one of: ${names}${options.length > 6 ? ", …" : ""} (see the “Valid values” sheet of the template)`;
};

/* ------------------------------------------------------------------ mapping → payload */

/**
 * Column mapping suggestion: our field ← the file column whose header matches its key,
 * label or a known alias (Croatian + English).
 */
const suggestMapping = (headers) => {
  const mapping = {};
  const used = new Set();
  for (const f of FIELDS) {
    const names = [f.key, f.label, ...(f.aliases || [])].map(norm);
    const h = headers.find((x) => !used.has(x) && names.includes(norm(x)));
    if (h) {
      mapping[f.key] = h;
      used.add(h);
    }
  }
  return mapping;
};

/** Template v2: A1 = "menus", menu names from B1 to the right. null when the file has no such row. */
const menusInRow1 = (rawRows = []) => {
  const first = rawRows[0] || [];
  if (!MENUS_ROW_LABELS.includes(norm(first[0]))) return null;
  const names = first.slice(1).map((v) => String(v ?? "").trim()).filter(Boolean);
  return [...new Map(names.map((n) => [norm(n), n])).values()];
};

/** Header row of a sheet: right below the menus row when there is one. */
const headerRowOf = (sheet, requested) => {
  const hasMenusRow = !!menusInRow1(sheet.rawRows);
  if (Number.isInteger(requested) && !(hasMenusRow && requested === 0)) return requested;
  return hasMenusRow && sheet.headerRow === 0 ? 1 : sheet.headerRow;
};

/** The items sheet first (menus in row 1, or named "Items"), whatever tab order the workbook has. */
const itemsSheetFirst = (sheets) => {
  const rank = (s) => (menusInRow1(s.rawRows) ? 0 : norm(s.name) === "items" ? 1 : 2);
  return [...sheets].sort((a, b) => rank(a) - rank(b));
};

const readSheet = (buffer, filename, options = {}) => {
  const parsed = parseImportFile(buffer, filename);
  const sheet = parsed.sheets.find((s) => s.name === options.sheet) || itemsSheetFirst(parsed.sheets)[0];
  if (!sheet) throw new ImportFileError("import_file_has_no_sheets");
  const headerRow = headerRowOf(sheet, options.headerRow);
  const { headers, rows } = buildTable(sheet.rawRows, headerRow);
  return { parsed, sheet, headerRow, headers, rows, fileMenus: menusInRow1(sheet.rawRows) };
};

/** Turn one file row into a MenuItems payload + errors, using the admin's mappings. */
const buildRow = (row, ctx) => {
  const { mapping = {}, defaults = {}, valueMappings = {}, lookups } = ctx;
  const autoCreate = ctx.autoCreate !== false;
  const data = {};
  const errors = [];
  const unresolved = [];
  const creates = [];
  for (const f of FIELDS) {
    const col = mapping[f.key];
    let raw = col ? row[col] : "";
    let fromDefault = false;
    if ((raw === undefined || String(raw).trim() === "") && defaults[f.key] !== undefined && defaults[f.key] !== "") {
      raw = defaults[f.key];
      fromDefault = true;
    }
    const empty = raw === undefined || String(raw).trim() === "";
    if (empty) {
      if (f.required && f.key !== "menu") errors.push(`${f.label} is required`);
      // yes/no columns present in the file must be filled; a column not in the file uses the default
      else if (f.kind === "boolean" && col) errors.push(`${f.label} is empty — enter yes or no`);
      continue;
    }
    switch (f.kind) {
      case "text":
        data[f.key] = String(raw).trim();
        break;
      case "number": {
        const r = parseNumber(raw);
        if (r.error) errors.push(`${f.label}: ${r.error}`);
        else if (f.min !== undefined && r.value < f.min) errors.push(`${f.label} must be at least ${f.min}`);
        else data[f.key] = Math.round(r.value * 100) / 100;
        break;
      }
      case "boolean": {
        const r = parseBoolean(raw);
        if (r.error) errors.push(`${f.label}: ${r.error}`);
        else data[f.key] = r.value;
        break;
      }
      case "enum": {
        if (f.key === "taxPercent") {
          const r = parseTax(raw);
          if (r.error) errors.push(r.error);
          else data.taxPercent = r.value;
        } else {
          const v = norm(raw);
          const opt = f.options.find((o) => o === v) || (f.key === "status" && (parseBoolean(raw).value === true ? "active" : parseBoolean(raw).value === false ? "inactive" : null));
          if (opt) data[f.key] = opt;
          else errors.push(`${f.label}: “${raw}” must be one of ${f.options.join(", ")}`);
        }
        break;
      }
      case "list": {
        const days = [];
        for (const part of splitList(raw)) {
          const d = DAY_ALIASES[norm(part)] || norm(part);
          if (DAYS.includes(d)) days.push(d);
          else errors.push(`${f.label}: “${part}” is not a day`);
        }
        data[f.key] = [...new Set(days)];
        break;
      }
      case "time": {
        const r = parseTime(raw);
        if (r.error) errors.push(`${f.label}: ${r.error}`);
        else data[f.key] = r.value;
        break;
      }
      case "ref": {
        const r = fromDefault && isObjectId(raw) ? { value: String(raw) } : resolveRef(f, raw, lookups, valueMappings[f.key]);
        if (r.value) data[f.key] = r.value;
        else if (r.ambiguous) {
          errors.push(`${f.label} “${r.ambiguous}” matches ${r.candidates.length} records (${r.candidates.slice(0, 5).join("; ")}) — use the value with its code from the Valid values sheet`);
        } else if (r.unresolved && autoCreate && CREATABLE.has(f.ref)) {
          data[f.key] = placeholder(f.ref, r.unresolved);
          creates.push({ field: f.key, ref: f.ref, value: r.unresolved });
        } else if (r.unresolved) {
          unresolved.push({ field: f.key, value: r.unresolved });
          errors.push(`${f.label} “${r.unresolved}” does not exist${validHint(lookups[f.ref])}`);
        }
        break;
      }
      case "refList": {
        const ids = [];
        for (const part of splitList(raw)) {
          const r = resolveRef(f, part, lookups, valueMappings[f.key]);
          if (r.value) ids.push(r.value);
          else if (r.unresolved && autoCreate && CREATABLE.has(f.ref)) {
            ids.push(placeholder(f.ref, r.unresolved));
            creates.push({ field: f.key, ref: f.ref, value: r.unresolved });
          } else if (r.unresolved) {
            unresolved.push({ field: f.key, value: r.unresolved });
            errors.push(`${f.label} “${r.unresolved}” does not exist${validHint(lookups[f.ref])}`);
          }
        }
        data[f.key] = [...new Set(ids)];
        break;
      }
      default:
        break;
    }
  }
  // The menu check runs in evaluate(): the menu can also come from row 1 or from the item (id).
  // #97 / #146: an age-restricted item can never be offered to go — enforced on import too.
  if (data.ageRestricted === true && data.isTogo === true) errors.push("18+ items cannot be available to go");
  if (data.ageRestricted === true) data.isTogo = false;
  if (data.id && !isObjectId(data.id)) errors.push(`Pleis item ID “${data.id}” is not valid`);
  return { data, errors, unresolved, creates };
};

/** Validate every row; decide create / update. */
const evaluate = async ({ buffer, filename, options, companyOrganizer }) => {
  const lookups = await getLookups(companyOrganizer);
  const { sheet, headerRow, headers, rows, fileMenus } = readSheet(buffer, filename, options);
  const autoCreate = options.autoCreate !== false;
  const ctx = { ...options, lookups };
  const built = rows.map((r) => buildRow(r, ctx));

  // Template v2: the menus in row 1 apply to every row → one entry per row and menu.
  const rowOneMenus = [];
  const rowOneCreates = [];
  const rowOneErrors = [];
  for (const name of fileMenus || []) {
    const r = resolveRef(FIELD_BY_KEY.menu, name, lookups, (options.valueMappings || {}).menu);
    if (r.skip) continue;
    if (r.value) rowOneMenus.push(r.value);
    else if (autoCreate) {
      rowOneMenus.push(placeholder("menu", name));
      rowOneCreates.push({ field: "menu", ref: "menu", value: name });
    } else rowOneErrors.push(`Menu “${name}” in row 1 does not exist${validHint(lookups.menu)}`);
  }
  const menuName = (id) =>
    isPlaceholder(id) ? (rowOneCreates.find((c) => placeholder("menu", c.value) === id) || {}).value || id.split(":").slice(2).join(":") : (lookups.menu.find((m) => m.id === id) || {}).label || "";

  const entries = [];
  built.forEach((b, i) => {
    const rowNumber = headerRow + 2 + i; // 1-based spreadsheet row
    const byId = !!(b.data.id && isObjectId(b.data.id));
    // A row with an id updates exactly that item where it is; row 1 is not applied to it.
    if (!byId && !b.data.menu && [...new Set(rowOneMenus)].length) {
      [...new Set(rowOneMenus)].forEach((menu) => entries.push({ b, rowNumber, byId, data: { ...b.data, menu } }));
    } else entries.push({ b, rowNumber, byId, data: { ...b.data } });
  });

  // Matching: id → that item of this company; else menu + name (case-insensitive), and when the
  // menu has several items with that name, the amount tells them apart.
  const menuIds = new Set(lookups.menu.map((m) => m.id));
  const ids = entries.filter((e) => e.byId).map((e) => e.data.id);
  const titles = entries.filter((e) => e.data.title).map((e) => e.data.title);
  const existing = await MenuItems.find({
    status: { $ne: "deleted" },
    menu: { $in: [...menuIds].map((id) => new mongoose.Types.ObjectId(id)) },
    $or: [{ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }, { title: { $in: titles } }],
  })
    .collation({ locale: "en", strength: 2 })
    .select("_id title menu amountQuantity")
    .lean();
  const byId = new Map(existing.map((e) => [String(e._id), e]));
  const byMenuTitle = new Map();
  existing.forEach((e) => {
    const k = `${e.menu}|${norm(e.title)}`;
    byMenuTitle.set(k, [...(byMenuTitle.get(k) || []), e]);
  });

  const seenKeys = new Map();
  const results = entries.map(({ b, rowNumber, byId: isIdRow, data }) => {
    const errors = [...b.errors, ...rowOneErrors];
    let action = "create";
    let matchId = null;
    if (isIdRow) {
      const hit = byId.get(data.id);
      if (hit) {
        action = "update";
        matchId = data.id;
        if (!data.menu) data.menu = String(hit.menu);
      } else errors.push(`Pleis item ID ${data.id} not found in this company's menus`);
    }
    if (!data.menu) {
      if (!b.unresolved.some((u) => u.field === "menu") && !rowOneErrors.length && !(isIdRow && !matchId)) {
        errors.push("Menu is required — enter the menus in row 1 (B1 →), fill a menu column or choose a menu for all rows");
      }
    } else if (!isPlaceholder(data.menu) && !menuIds.has(data.menu)) errors.push("Menu does not belong to this company");
    else if (!isIdRow && data.title) {
      const list = byMenuTitle.get(`${data.menu}|${norm(data.title)}`) || [];
      let hit = list.length === 1 ? list[0] : null;
      if (list.length > 1) {
        const same = list.filter((e) => norm(e.amountQuantity) === norm(data.amountQuantity));
        if (same.length === 1) [hit] = same;
        else errors.push(`${list.length} items named “${data.title}” already exist in menu “${menuName(data.menu)}” — add the Pleis item ID (Export fills it) or an amount that tells them apart`);
      }
      if (hit) {
        action = "update";
        matchId = String(hit._id);
      }
    }
    const dupKey = matchId || `${data.menu}|${norm(data.title)}|${norm(data.amountQuantity)}`;
    if (seenKeys.has(dupKey)) errors.push(`Duplicate of row ${seenKeys.get(dupKey)} (same item)`);
    else seenKeys.set(dupKey, rowNumber);
    const notes = b.creates.map((c) => `new ${CREATE_LABEL[c.ref]} “${c.value}”`);
    if (isPlaceholder(data.menu)) notes.unshift(`new menu “${menuName(data.menu)}”`);
    return { row: rowNumber, menu: data.menu ? menuName(data.menu) : "", action: errors.length ? "error" : action, matchId, title: data.title || "", data, errors, notes };
  });

  // Records the import will create (distinct, case-insensitive), shown in the review step.
  const toCreate = {};
  [...built.flatMap((b) => b.creates), ...rowOneCreates].forEach(({ ref, value }) => {
    toCreate[ref] = toCreate[ref] || {};
    const k = norm(value);
    if (!toCreate[ref][k]) toCreate[ref][k] = value;
  });
  const toCreateList = Object.fromEntries(Object.entries(toCreate).map(([k, v]) => [k, Object.values(v)]));
  if (toCreateList.menu && !lookups.defaultOrganization && !options.organization) {
    results.forEach((r) => {
      if (isPlaceholder(r.data.menu)) {
        r.errors.push("A new menu needs a venue — this company has no venue yet");
        r.action = "error";
      }
    });
  }

  // Distinct file values still unmapped, per reference field — for the value-mapping step.
  const unresolved = {};
  built.forEach((b) =>
    b.unresolved.forEach(({ field, value }) => {
      unresolved[field] = unresolved[field] || {};
      unresolved[field][value] = (unresolved[field][value] || 0) + 1;
    })
  );

  const summary = {
    rows: built.length,
    total: results.length,
    create: results.filter((r) => r.action === "create").length,
    update: results.filter((r) => r.action === "update").length,
    error: results.filter((r) => r.action === "error").length,
  };
  return {
    sheet: sheet.name,
    headerRow,
    headers,
    fileMenus: fileMenus || [],
    summary,
    results,
    unresolved,
    toCreate: toCreateList,
    venues: lookups.organization,
    defaultVenue: lookups.defaultOrganization,
  };
};

const CREATE_LABEL = {
  menu: "menu", subCategory: "subcategory", brand: "brand", serving: "serving",
  daypart: "daypart", dietTag: "diet tag", allergen: "allergen",
};

const guessUnit = (name) => {
  const n = norm(name);
  if (/\b(ml|l|cl|dl|litre|liter|bottle|glass|cup|can)\b|\(l\)/.test(n)) return "l";
  if (/\b(g|kg|gram|plate|portion|porcija|tanjur)\b|\(g\)/.test(n)) return "g";
  return "pcs";
};

/** Create every missing record once; returns placeholder → new id. */
const createMissing = async (toCreate, { companyOrganizer, actorId, organization }) => {
  const created = {};
  const owner = new mongoose.Types.ObjectId(String(companyOrganizer));
  const actor = new mongoose.Types.ObjectId(String(actorId || companyOrganizer));
  for (const [ref, names] of Object.entries(toCreate)) {
    for (const name of names) {
      let doc;
      if (ref === "menu") {
        doc = await Menus.create({ title: name, organization, creator: owner, startDate: new Date(), status: "active" });
      } else if (ref === "subCategory") {
        const last = await MenuSubcategory.findOne({ companyOrganizer: owner }).sort({ order: -1 }).select("order").lean();
        doc = await MenuSubcategory.create({ companyOrganizer: owner, title: name, order: (last?.order || 0) + 1, status: "active" });
      } else if (ref === "brand") {
        doc = await Brand.create({ user: actor, name, brandOwner: name, status: "active" });
      } else if (ref === "dietTag") {
        doc = await DietTags.create({ user: actor, code: await generateUniqueDietTagsCode(), name, description: name, status: "active" });
      } else if (ref === "allergen") {
        doc = await Allergen.create({ user: actor, code: await generateUniqueAllergenCode(), name, status: "active" });
      } else if (ref === "daypart") {
        doc = await Daypart.create({ user: actor, code: await generateUniqueDaypartCode(), name, isAllDay: true, status: "active" });
      } else if (ref === "serving") {
        let n = (await Serving.countDocuments({})) + 1;
        let code = `SERV${String(n).padStart(3, "0")}`;
        // eslint-disable-next-line no-await-in-loop
        while (await Serving.exists({ code })) code = `SERV${String((n += 1)).padStart(3, "0")}`;
        doc = await Serving.create({ user: actor, code, level2: "none", type: name, unit: guessUnit(name), status: "active" });
      }
      if (doc) created[placeholder(ref, name)] = String(doc._id);
    }
  }
  return created;
};

const swapPlaceholders = (data, created) => {
  const out = { ...data };
  for (const [k, v] of Object.entries(out)) {
    if (isPlaceholder(v)) out[k] = created[v] || null;
    else if (Array.isArray(v)) out[k] = v.map((x) => (isPlaceholder(x) ? created[x] : x)).filter(Boolean);
  }
  return out;
};

const toDbPayload = (data, timezone) => {
  const out = { ...data };
  delete out.id;
  if (out.startTime) out.startTime = convertTimezoneToUtc(out.startTime, timezone, "hh:mm A");
  if (out.endTime) out.endTime = convertTimezoneToUtc(out.endTime, timezone, "hh:mm A");
  if (out.menu) out.menu = new mongoose.Types.ObjectId(out.menu);
  return out;
};

/** Write the evaluated rows. */
const commit = async ({ buffer, filename, options, companyOrganizer, timezone, stopOnError, emit, actorId }) => {
  const report = await evaluate({ buffer, filename, options, companyOrganizer });
  if (stopOnError && report.summary.error > 0) {
    return { ...report, committed: false, written: { created: 0, updated: 0, failed: 0 } };
  }
  // Only create records that at least one importable row uses.
  const needed = {};
  report.results
    .filter((r) => r.action !== "error")
    .forEach((r) =>
      Object.values(r.data)
        .flat()
        .filter(isPlaceholder)
        .forEach((ph) => {
          const [, ref, ...rest] = ph.split(":");
          const original = (report.toCreate[ref] || []).find((n) => norm(n) === rest.join(":"));
          needed[ref] = needed[ref] || new Set();
          if (original) needed[ref].add(original);
        })
    );
  const venue =
    options.organization && report.venues.some((v) => v.id === options.organization) ? options.organization : report.defaultVenue;
  const created = await createMissing(
    Object.fromEntries(Object.entries(needed).map(([k, v]) => [k, [...v]])),
    { companyOrganizer, actorId, organization: venue }
  );
  const createdCounts = {};
  Object.keys(created).forEach((ph) => {
    const ref = ph.split(":")[1];
    createdCounts[ref] = (createdCounts[ref] || 0) + 1;
  });

  const written = { created: 0, updated: 0, failed: 0, records: createdCounts };
  for (const r of report.results) {
    if (r.action === "error") continue;
    try {
      const payload = toDbPayload(swapPlaceholders(r.data, created), timezone);
      if (r.action === "update") {
        const doc = await MenuItems.findById(r.matchId);
        Object.assign(doc, payload);
        await doc.save();
        if (emit) await emit(doc, ["updated"]).catch(() => null);
        written.updated += 1;
      } else {
        const doc = await MenuItems.create({
          status: "active",
          isAvailableInStock: true,
          ...payload,
          creator: companyOrganizer,
        });
        if (emit) await emit(doc, ["created"]).catch(() => null);
        r.matchId = String(doc._id);
        written.created += 1;
      }
    } catch (e) {
      r.action = "error";
      r.errors = [...r.errors, e.message];
      written.failed += 1;
    }
  }
  report.summary.error = report.results.filter((r) => r.action === "error").length;
  return { ...report, committed: true, written };
};

/* ------------------------------------------------------------------ template + export */

// Template v2 columns, in the order of the Menu Item form (menus are in row 1, not a column).
const HEADERS = TEMPLATE_FIELDS.map((f) => f.key);
const LAST_CHECKED_ROW = 5000; // dropdowns / number / time checks reach this row
const BOOLEAN_KEYS = TEMPLATE_FIELDS.filter((f) => f.kind === "boolean").map((f) => f.key);

const hhmmToFraction = (v) => {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? (Number(m[1]) * 60 + Number(m[2])) / 1440 : null;
};

/** One item (keyed by field) → Items sheet row. Price and tax are numbers, times are Excel times. */
const toSheetRow = (r) =>
  HEADERS.map((h) => {
    const v = r[h];
    if (v === undefined || v === null || v === "") return "";
    if (h === "basePrice") return Number.isFinite(Number(v)) ? { v: Number(v), type: "number" } : v;
    if (h === "taxPercent") return Number.isFinite(Number(v)) ? Number(v) : v;
    if (h === "startTime" || h === "endTime") {
      const f = hhmmToFraction(v);
      return f === null ? v : { v: f, type: "time" };
    }
    return v;
  });

const csvLine = (cells) => cells.map((s) => (/[",\r\n;]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s))).join(",");

/**
 * Items file in template v2 layout — used by the template download and the export, so an
 * exported file can be edited and imported again as is.
 */
const writeItemsFile = ({ lookups, menus, rows, format }) => {
  if (format === "csv") {
    const body = toCsv(HEADERS, rows).replace(/^﻿/, "");
    return { body: `﻿${csvLine(["menus", ...menus])}\r\n${body}`, type: "text/csv; charset=utf-8", ext: "csv" };
  }
  const labels = (ref) => (lookups?.[ref] || []).map((o) => o.label);
  // [Valid values header, values, Items columns it feeds, "stop" = only these values | "warning" = new names allowed]
  const lists = [
    ["Preset type", labels("presetType"), ["presetType"], "stop"],
    ["Brand", labels("brand"), ["brand"], "warning"],
    ["Subcategory", labels("subCategory"), ["subCategory"], "warning"],
    ["Menu", labels("menu"), [], "warning"],
    ["Serving", labels("serving"), ["servingSize"], "warning"],
    ["Quantity type", ["single", "combo"], ["quantityType"], "stop"],
    ["Tax class (%)", [25, 13, 5, 0], ["taxPercent"], "stop"],
    ["Available days", DAYS, [], null],
    ["Daypart", labels("daypart"), [], null],
    ["Diet tag", labels("dietTag"), [], null],
    ["Allergen", labels("allergen"), [], null],
    ["Status", ["active", "inactive"], ["status"], "stop"],
    ["Yes / No columns", ["yes", "no"], BOOLEAN_KEYS, "stop"],
  ];
  const depth = Math.max(...lists.map(([, v]) => v.length), 1);
  const valid = [lists.map(([h]) => h)];
  for (let i = 0; i < depth; i += 1) valid.push(lists.map(([, v]) => (v[i] === undefined ? "" : v[i])));

  const col = (key) => colName(HEADERS.indexOf(key));
  const range = (key) => `${col(key)}3:${col(key)}${LAST_CHECKED_ROW}`;
  const validations = [];
  lists.forEach(([name, values, keys, errorStyle], i) => {
    if (!values.length || !errorStyle) return;
    const formula1 = `'Valid values'!$${colName(i)}$2:$${colName(i)}$${values.length + 1}`;
    const error = errorStyle === "stop" ? `Choose a value from the list (${name} on the Valid values sheet).` : `Not in the list — a new ${name.toLowerCase()} will be created on import.`;
    if (name === "Menu") validations.push({ sqref: "B1:Z1", type: "list", formula1, errorStyle, error });
    keys.forEach((k) => validations.push({ sqref: range(k), type: "list", formula1, errorStyle: errorStyle === "stop" ? undefined : errorStyle, error }));
  });
  validations.push({ sqref: range("basePrice"), type: "decimal", operator: "greaterThanOrEqual", formula1: "0", error: "Price must be a number, e.g. 2.50" });
  ["startTime", "endTime"].forEach((k) =>
    validations.push({ sqref: range(k), type: "time", operator: "between", formula1: "0", formula2: "0.999305556", error: "Enter a time, e.g. 07:00" })
  );

  const guide = [
    ["Column", "Field", "Required", "What to enter"],
    ...TEMPLATE_FIELDS.map((f) => [
      f.key,
      f.label,
      f.required || f.kind === "boolean" ? "yes" : "",
      f.help || (f.options ? `One of: ${f.options.join(", ")}` : ""),
    ]),
    [],
    ["How the file is read"],
    ["Row 1", "", "", "“menus” in A1, then one menu per cell from B1 to the right. Every item in the file is placed in all these menus. A menu that does not exist yet is created (shown under “Will be created” before you import)."],
    ["Row 2", "", "", "Column names — do not rename or reorder them. Items start in row 3."],
    ["Update", "", "", "A row with a Pleis item ID updates exactly that item, in its own menu. Without an ID, an item with the same name (any letter case) in the menu is updated; when the menu has several items with that name, the amount decides. Otherwise a new item is created."],
    ["Not in the file", "", "", "Items, menus and menu links that are not in the file are left unchanged — the import never deletes or deactivates anything."],
    ["Errors", "", "", "Every row is checked before anything is written; the result is shown per row. You choose: import the valid rows only, or nothing if any row has an error."],
    ["Lists", "", "", "Available days, dayparts, diet tags and allergens: comma separated, any letter case. Allergens match on the full label, the English or the Croatian part."],
  ];

  const body = buildXlsx([
    {
      name: "Items",
      rows: [["menus", ...menus], HEADERS, ...rows.map(toSheetRow)],
      headerRow: 1,
      boldRows: [0],
      widths: HEADERS.map((h) => (h === "presetType" ? 44 : ["title", "description"].includes(h) ? 30 : 16)),
      validations,
    },
    { name: "Valid values", rows: valid, widths: lists.map(([h]) => (h === "Preset type" ? 52 : 24)) },
    { name: "Instructions", rows: guide, widths: [26, 28, 10, 100] },
  ]);
  return { body, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
};

/**
 * Import template in OUR format (v2). With a company it uses that company's first menu in row 1,
 * its real names in the example rows and a "Valid values" sheet with every name the import
 * accepts — so an organizer's menu can be pasted into our columns and imported as is.
 */
const buildTemplate = async ({ companyOrganizer, format = "xlsx" }) => {
  const lookups = companyOrganizer ? await getLookups(companyOrganizer) : null;
  // Use the company's own record when the sample name matches one (also bilingual, e.g.
  // "Milk" → "milk (mlijeko)"); otherwise keep the sample name, which the import creates.
  const find = (ref, name) => lookups?.[ref]?.find((o) => o.keys.includes(norm(name)))?.label;
  const resolve = (ref, name) => (name ? find(ref, name) || name : "");
  const resolveList = (ref, list) =>
    String(list || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => resolve(ref, n))
      .join(", ");
  const presetLabel = (name) => {
    const hit = lookups && resolvePreset(name, lookups.presetType);
    return (hit?.value && lookups.presetType.find((o) => o.id === hit.value)?.label) || name;
  };
  const rows = SAMPLE_ROWS.map((r) => ({
    ...r,
    presetType: presetLabel(r.presetType),
    subCategory: resolve("subCategory", r.subCategory),
    daypart: resolveList("daypart", r.daypart),
    dietTags: resolveList("dietTag", r.dietTags),
    allergens: resolveList("allergen", r.allergens),
  }));
  const menus = lookups?.menu?.length ? [lookups.menu[0].label] : ["Main menu"];
  return writeItemsFile({ lookups, menus, rows, format });
};

const templateCsv = () => `﻿${csvLine(["menus", "Main menu"])}\r\n${toCsv(HEADERS, SAMPLE_ROWS).replace(/^﻿/, "")}`;

/** Export in the template v2 layout (xlsx by default; csv on request). */
const exportItems = async ({ companyOrganizer, menu, timezone, format = "xlsx" }) => {
  const lookups = await getLookups(companyOrganizer);
  const label = (ref) => Object.fromEntries(lookups[ref].map((o) => [o.id, o.label]));
  const L = {
    menu: label("menu"), subCategory: label("subCategory"), presetType: label("presetType"), brand: label("brand"),
    serving: label("serving"), daypart: label("daypart"), dietTag: label("dietTag"), allergen: label("allergen"),
  };
  // Only this company's menus — a menu id of another company exports nothing.
  const menuIds = menu ? (L.menu[String(menu)] ? [String(menu)] : []) : Object.keys(L.menu);
  const items = await MenuItems.find({ menu: { $in: menuIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $ne: "deleted" } })
    .sort({ menu: 1, title: 1 })
    .lean();
  const yn = (b) => (b ? "yes" : "no");
  const t = (d) => (d ? moment(d).tz(timezone || "Europe/Zagreb").format("HH:mm") : "");
  const rows = items.map((i) => ({
    id: String(i._id),
    presetType: L.presetType[String(i.presetType)] || "",
    brand: L.brand[String(i.brand)] || "",
    title: i.title,
    amountQuantity: i.amountQuantity || "",
    subCategory: L.subCategory[String(i.subCategory)] || "",
    description: i.description || "",
    servingSize: L.serving[String(i.servingSize)] || "",
    quantityType: i.quantityType || "single",
    basePrice: Math.round(Number(i.basePrice || 0) * 100) / 100,
    taxPercent: i.taxPercent ?? "",
    availableDays: (i.availableDays || []).join(", "),
    startTime: t(i.startTime),
    endTime: t(i.endTime),
    daypart: (i.daypart || []).map((d) => L.daypart[String(d)]).filter(Boolean).join(", "),
    dietTags: (i.dietTags || []).map((d) => L.dietTag[String(d)]).filter(Boolean).join(", "),
    allergens: (i.allergens || []).map((d) => L.allergen[String(d)]).filter(Boolean).join(", "),
    cuisine: i.cuisine || "",
    status: i.status,
    isRecommended: yn(i.isRecommended),
    upSellItem: yn(i.upSellItem === true || i.upSellItem === "true"),
    isTogo: yn(i.isTogo),
    isRequiresOrderConfirmation: yn(i.isRequiresOrderConfirmation),
    isAvailableInStock: yn(i.isAvailableInStock),
    ageRestricted: yn(i.ageRestricted),
  }));
  // Row 1: the exported menus. Rows keep their id, so re-importing updates each item in place.
  const used = new Set(items.map((i) => String(i.menu)));
  const menus = menuIds.filter((id) => used.has(id) || menu).map((id) => L.menu[id]);
  return writeItemsFile({ lookups, menus, rows, format });
};

const fieldDefinitions = () =>
  FIELDS.map(({ key, label, kind, ref, required, options, help, default: def }) => ({ key, label, kind, ref, required: !!required, options, help, default: def }));

module.exports = {
  SKIP,
  getLookups,
  suggestMapping,
  readSheet,
  evaluate,
  commit,
  templateCsv,
  buildTemplate,
  exportItems,
  menusInRow1,
  headerRowOf,
  itemsSheetFirst,
  fieldDefinitions,
  FIELD_BY_KEY,
};
