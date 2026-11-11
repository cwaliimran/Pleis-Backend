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
const { buildXlsx } = require("../../../../commonModules/importer/xlsxWriter");
const { FIELDS, FIELD_BY_KEY, SAMPLE_ROWS, DAYS } = require("./menuItemImportFields");

const SKIP = "__skip__";
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v)) && /^[a-f0-9]{24}$/i.test(String(v));
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/* ------------------------------------------------------------------ lookups */

const servingLabel = (s) => [s.type, s.unit && `(${s.unit})`].filter(Boolean).join(" ") || s.code;

/** Our records a file value can be mapped to, scoped to the company. */
const getLookups = async (companyOrganizer) => {
  const owner = new mongoose.Types.ObjectId(String(companyOrganizer));
  const live = { status: { $ne: "deleted" } };
  const [menus, subCategories, presetTypes, brands, servings, dayparts, dietTags, allergens, venues] = await Promise.all([
    Menus.find({ creator: owner, ...live }).select("title organization").lean(),
    MenuSubcategory.find({ companyOrganizer: owner, ...live }).select("title").lean(),
    PresetType.find({ ...live }).select("name code").lean(),
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
    presetType: opt(presetTypes, (r) => r.name, ["code"]),
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

const parseTime = (raw) => {
  const m = moment(String(raw).trim(), ["HH:mm", "H:mm", "hh:mm A", "h:mm A", "HH:mm:ss"], true);
  return m.isValid() ? { value: m.format("hh:mm A") } : { error: `“${raw}” is not a time (HH:mm)` };
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

const readSheet = (buffer, filename, options = {}) => {
  const parsed = parseImportFile(buffer, filename);
  const sheet = parsed.sheets.find((s) => s.name === options.sheet) || parsed.sheets[0];
  if (!sheet) throw new ImportFileError("import_file_has_no_sheets");
  const headerRow = Number.isInteger(options.headerRow) ? options.headerRow : sheet.headerRow;
  const { headers, rows } = buildTable(sheet.rawRows, headerRow);
  return { parsed, sheet, headerRow, headers, rows };
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
        else if (r.unresolved && autoCreate && CREATABLE.has(f.ref)) {
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
  if (!data.menu && !unresolved.some((u) => u.field === "menu")) {
    errors.push("Menu is required — fill the menu column or choose a menu for all rows");
  }
  // #97 / #146: an age-restricted item can never be offered to go — enforced on import too.
  if (data.ageRestricted === true && data.isTogo === true) errors.push("18+ items cannot be available to go");
  if (data.ageRestricted === true) data.isTogo = false;
  if (data.id && !isObjectId(data.id)) errors.push(`Pleis item ID “${data.id}” is not valid`);
  return { data, errors, unresolved, creates };
};

/** Validate every row; decide create / update. */
const evaluate = async ({ buffer, filename, options, companyOrganizer }) => {
  const lookups = await getLookups(companyOrganizer);
  const { sheet, headerRow, headers, rows } = readSheet(buffer, filename, options);
  const ctx = { ...options, lookups };
  const built = rows.map((r) => buildRow(r, ctx));

  // Matching: id → existing item of this company; else menu + name.
  const menuIds = new Set(lookups.menu.map((m) => m.id));
  const ids = built.map((b) => b.data.id).filter((v) => v && isObjectId(v));
  const titles = built.filter((b) => b.data.title && b.data.menu).map((b) => b.data.title);
  const existing = await MenuItems.find({
    status: { $ne: "deleted" },
    menu: { $in: [...menuIds].map((id) => new mongoose.Types.ObjectId(id)) },
    $or: [{ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }, { title: { $in: titles } }],
  })
    .collation({ locale: "en", strength: 2 })
    .select("_id title menu")
    .lean();
  const byId = new Map(existing.map((e) => [String(e._id), e]));
  const byMenuTitle = new Map(existing.map((e) => [`${e.menu}|${norm(e.title)}`, e]));

  const seenKeys = new Map();
  const results = built.map((b, i) => {
    const rowNumber = headerRow + 2 + i; // 1-based spreadsheet row
    const errors = [...b.errors];
    let action = "create";
    let matchId = null;
    if (b.data.menu && !isPlaceholder(b.data.menu) && !menuIds.has(b.data.menu)) errors.push("Menu does not belong to this company");
    if (b.data.id && isObjectId(b.data.id)) {
      const hit = byId.get(b.data.id);
      if (hit) {
        action = "update";
        matchId = b.data.id;
      } else errors.push(`Pleis item ID ${b.data.id} not found in this company's menus`);
    } else if (b.data.title && b.data.menu) {
      const hit = byMenuTitle.get(`${b.data.menu}|${norm(b.data.title)}`);
      if (hit) {
        action = "update";
        matchId = String(hit._id);
      }
    }
    const dupKey = matchId || `${b.data.menu}|${norm(b.data.title)}`;
    if (seenKeys.has(dupKey)) errors.push(`Duplicate of row ${seenKeys.get(dupKey)} (same item)`);
    else seenKeys.set(dupKey, rowNumber);
    const notes = b.creates.map((c) => `new ${CREATE_LABEL[c.ref]} “${c.value}”`);
    return { row: rowNumber, action: errors.length ? "error" : action, matchId, title: b.data.title || "", data: b.data, errors, notes };
  });

  // Records the import will create (distinct, case-insensitive), shown in the review step.
  const toCreate = {};
  built.forEach((b) =>
    b.creates.forEach(({ ref, value }) => {
      toCreate[ref] = toCreate[ref] || {};
      const k = norm(value);
      if (!toCreate[ref][k]) toCreate[ref][k] = value;
    })
  );
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
    total: results.length,
    create: results.filter((r) => r.action === "create").length,
    update: results.filter((r) => r.action === "update").length,
    error: results.filter((r) => r.action === "error").length,
  };
  return { sheet: sheet.name, headerRow, headers, summary, results, unresolved, toCreate: toCreateList, venues: lookups.organization, defaultVenue: lookups.defaultOrganization };
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

const HEADERS = FIELDS.map((f) => f.key);

/**
 * Import template in OUR format. With a company it uses that company's real menu and
 * subcategory names in the example rows and adds a "Valid values" sheet with every name the
 * import accepts — so an organizer's menu can be pasted into our columns and imported as is.
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
  const rows = SAMPLE_ROWS.map((r) => ({
    ...r,
    menu: resolve("menu", r.menu),
    subCategory: resolve("subCategory", r.subCategory),
    daypart: resolveList("daypart", r.daypart),
    dietTags: resolveList("dietTag", r.dietTags),
    allergens: resolveList("allergen", r.allergens),
  }));
  if (format === "csv") return { body: toCsv(HEADERS, rows), type: "text/csv; charset=utf-8", ext: "csv" };

  const items = [HEADERS, ...rows.map((r) => HEADERS.map((h) => r[h] ?? ""))];
  const lists = [
    ["Menu", (lookups?.menu || []).map((o) => o.label)],
    ["Subcategory", (lookups?.subCategory || []).map((o) => o.label)],
    ["Tax class (%)", ["25", "13", "5", "0"]],
    ["Status", ["active", "inactive"]],
    ["Yes / No columns", ["yes", "no"]],
    ["Quantity type", ["single", "combo"]],
    ["Available days", DAYS],
    ["Preset type", (lookups?.presetType || []).map((o) => o.label)],
    ["Brand", (lookups?.brand || []).map((o) => o.label)],
    ["Serving", (lookups?.serving || []).map((o) => o.label)],
    ["Daypart", (lookups?.daypart || []).map((o) => o.label)],
    ["Diet tag", (lookups?.dietTag || []).map((o) => o.label)],
    ["Allergen", (lookups?.allergen || []).map((o) => o.label)],
  ];
  const depth = Math.max(...lists.map(([, v]) => v.length), 1);
  const valid = [lists.map(([h]) => h)];
  for (let i = 0; i < depth; i += 1) valid.push(lists.map(([, v]) => v[i] || ""));
  const guide = [
    ["Column", "Field", "Required", "What to enter"],
    ...FIELDS.map((f) => [
      f.key,
      f.label,
      f.required ? "yes" : "",
      f.help || (f.options ? `One of: ${f.options.join(", ")}` : f.kind === "boolean" ? "yes / no" : ""),
    ]),
  ];
  const body = buildXlsx([
    { name: "Items", rows: items, widths: HEADERS.map((h) => (["title", "description"].includes(h) ? 30 : 16)) },
    { name: "Valid values", rows: valid, widths: lists.map(() => 24) },
    { name: "Instructions", rows: guide, widths: [26, 28, 10, 80] },
  ]);
  return { body, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
};

const templateCsv = () => toCsv(HEADERS, SAMPLE_ROWS);

const exportCsv = async ({ companyOrganizer, menu, timezone }) => {
  const lookups = await getLookups(companyOrganizer);
  const label = (ref) => Object.fromEntries(lookups[ref].map((o) => [o.id, o.label]));
  const L = {
    menu: label("menu"), subCategory: label("subCategory"), presetType: label("presetType"), brand: label("brand"),
    serving: label("serving"), daypart: label("daypart"), dietTag: label("dietTag"), allergen: label("allergen"),
  };
  const menuIds = menu && isObjectId(menu) ? [menu] : Object.keys(L.menu);
  const items = await MenuItems.find({ menu: { $in: menuIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $ne: "deleted" } })
    .sort({ menu: 1, title: 1 })
    .lean();
  const yn = (b) => (b ? "yes" : "no");
  const t = (d) => (d ? moment(d).tz(timezone || "Europe/Zagreb").format("HH:mm") : "");
  const rows = items.map((i) => ({
    id: String(i._id),
    title: i.title,
    description: i.description || "",
    menu: L.menu[String(i.menu)] || "",
    subCategory: L.subCategory[String(i.subCategory)] || "",
    basePrice: Number(i.basePrice || 0).toFixed(2),
    taxPercent: i.taxPercent ?? "",
    status: i.status,
    isAvailableInStock: yn(i.isAvailableInStock),
    ageRestricted: yn(i.ageRestricted),
    isTogo: yn(i.isTogo),
    isRecommended: yn(i.isRecommended),
    upSellItem: yn(i.upSellItem === true || i.upSellItem === "true"),
    isRequiresOrderConfirmation: yn(i.isRequiresOrderConfirmation),
    presetType: L.presetType[String(i.presetType)] || "",
    brand: L.brand[String(i.brand)] || "",
    amountQuantity: i.amountQuantity || "",
    quantityType: i.quantityType || "single",
    servingSize: L.serving[String(i.servingSize)] || "",
    availableDays: (i.availableDays || []).join(", "),
    daypart: (i.daypart || []).map((d) => L.daypart[String(d)]).filter(Boolean).join(", "),
    dietTags: (i.dietTags || []).map((d) => L.dietTag[String(d)]).filter(Boolean).join(", "),
    allergens: (i.allergens || []).map((d) => L.allergen[String(d)]).filter(Boolean).join(", "),
    cuisine: i.cuisine || "",
    startTime: t(i.startTime),
    endTime: t(i.endTime),
  }));
  return toCsv(HEADERS, rows);
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
  exportCsv,
  fieldDefinitions,
  FIELD_BY_KEY,
};
