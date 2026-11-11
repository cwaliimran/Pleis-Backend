const multer = require("multer");
const { sendResponse } = require("@utils/responseUtil");
const importService = require("./menuItemImportService");
const { parseImportFile } = require("../../../../commonModules/importer/fileParser");
const { emitMenuItemChange } = require("../menuItemsService");

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(csv|tsv|txt|xlsx)$/i;

/** multipart "file" in memory (never written to disk). */
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED.test(file.originalname || "") ? cb(null, true) : cb(Object.assign(new Error("import_file_type_not_supported"), { statusCode: 400 })),
}).single("file");

const withUpload = (handler) => (req, res) =>
  uploadFile(req, res, (err) => {
    if (err) {
      const key = err.code === "LIMIT_FILE_SIZE" ? "import_file_too_large_max_10mb" : err.message;
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }
    if (!req.file) return sendResponse({ res, statusCode: 400, translationKey: "import_file_required" });
    return handler(req, res);
  });

/** Organizers / managers import into their own company; super admin passes companyOrganizer. */
const companyOf = (req) => {
  const u = req.user || {};
  if (u.userType === "admin") return req.body?.companyOrganizer || req.query?.companyOrganizer || null;
  return u.companyOrganizer || u._id;
};

const readOptions = (req) => {
  try {
    const o = req.body?.options ? JSON.parse(req.body.options) : {};
    return typeof o === "object" && o ? o : {};
  } catch {
    return {};
  }
};

const fail = (res, error) =>
  sendResponse({ res, statusCode: error.statusCode || 500, translationKey: error.message, error });

const requireCompany = (req, res) => {
  const company = companyOf(req);
  if (!company) {
    sendResponse({ res, statusCode: 400, translationKey: "select_a_company_first" });
    return null;
  }
  return company;
};

// GET /import-file/template?format=xlsx|csv&companyOrganizer= — our format; with the
// company's real menu / subcategory names and a "Valid values" sheet (xlsx)
const downloadTemplate = async (req, res) => {
  try {
    const format = req.query.format === "csv" ? "csv" : "xlsx";
    const { body, type, ext } = await importService.buildTemplate({ companyOrganizer: companyOf(req), format });
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `attachment; filename="pleis-menu-items-template.${ext}"`);
    return res.send(body);
  } catch (error) {
    return fail(res, error);
  }
};

// GET /import-file/fields?companyOrganizer= — our fields + records file values can map to
const getFields = async (req, res) => {
  const company = requireCompany(req, res);
  if (!company) return undefined;
  try {
    const lookups = await importService.getLookups(company);
    // only the record lists (defaultOrganization is a single id, not a list)
    const options = Object.fromEntries(
      Object.entries(lookups)
        .filter(([, list]) => Array.isArray(list))
        .map(([k, list]) => [k, list.map(({ id, label }) => ({ id, label }))])
    );
    return sendResponse({ res, statusCode: 200, translationKey: "import_fields_fetched", data: { fields: importService.fieldDefinitions(), lookups: options, skipValue: importService.SKIP } });
  } catch (error) {
    return fail(res, error);
  }
};

// POST /import-file/parse (file) — every sheet, header row, columns, rows + suggested mapping
const parse = withUpload(async (req, res) => {
  try {
    const parsed = parseImportFile(req.file.buffer, req.file.originalname);
    const sheets = parsed.sheets.map((s) => ({
      name: s.name,
      headerRow: s.headerRow,
      rawRows: s.rawRows,
      headers: s.headers,
      rowCount: s.rowCount,
      truncated: !!s.truncated,
      suggestedMapping: importService.suggestMapping(s.headers),
    }));
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "import_file_parsed",
      data: { fileName: req.file.originalname, format: parsed.format, delimiter: parsed.delimiter, sheets },
    });
  } catch (error) {
    return fail(res, error);
  }
});

// POST /import-file/validate (file + options) — per-row dry run, nothing written
const validate = withUpload(async (req, res) => {
  const company = requireCompany(req, res);
  if (!company) return undefined;
  try {
    const data = await importService.evaluate({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      options: readOptions(req),
      companyOrganizer: company,
    });
    return sendResponse({ res, statusCode: 200, translationKey: "import_validated", data });
  } catch (error) {
    return fail(res, error);
  }
});

// POST /import-file/commit (file + options + stopOnError)
const commit = withUpload(async (req, res) => {
  const company = requireCompany(req, res);
  if (!company) return undefined;
  const options = readOptions(req);
  try {
    const data = await importService.commit({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      options,
      companyOrganizer: company,
      timezone: req.user?.timezone || "Europe/Zagreb",
      stopOnError: options.stopOnError === true,
      emit: emitMenuItemChange,
      actorId: req.user?._id,
    });
    return sendResponse({
      res,
      statusCode: data.committed ? 200 : 422,
      translationKey: data.committed ? "menu_items_imported" : "import_stopped_rows_have_errors",
      data,
    });
  } catch (error) {
    return fail(res, error);
  }
});

// GET /export?companyOrganizer=&menu= — CSV in the same format as the template
const exportItems = async (req, res) => {
  const company = requireCompany(req, res);
  if (!company) return undefined;
  try {
    const csv = await importService.exportCsv({ companyOrganizer: company, menu: req.query.menu, timezone: req.user?.timezone });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="pleis-menu-items-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (error) {
    return fail(res, error);
  }
};

module.exports = { downloadTemplate, getFields, parse, validate, commit, exportItems };
