/**
 * Generic spreadsheet parser for imports (Requirement Set #122).
 *
 * Accepts whatever the organizer sends — .csv / .tsv / .txt (any delimiter, with or without
 * BOM) or .xlsx (Excel 2007+) — and returns every sheet as headers + rows, untouched, so the
 * admin can preview the file and map its columns to our fields.
 *
 * Uses Node built-ins only (zlib for the .xlsx ZIP container) — no third-party parser.
 * Legacy binary .xls is not supported: save it as .xlsx or .csv first.
 */
const zlib = require("zlib");

const MAX_ROWS = 10000;

class ImportFileError extends Error {
  constructor(key) {
    super(key);
    this.statusCode = 400;
  }
}

/* ------------------------------------------------------------------ CSV */

const detectDelimiter = (text) => {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    // count delimiters outside quotes on the first lines
    let inQ = false;
    let count = 0;
    for (const ch of sample) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) count += 1;
    }
    if (count > bestScore) {
      best = d;
      bestScore = count;
    }
  }
  return best;
};

/** RFC 4180 CSV: quoted fields, escaped quotes (""), newlines inside quotes. */
const parseCsv = (input) => {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { delimiter, rows };
};

/* ------------------------------------------------------------------ ZIP (for .xlsx) */

const readZipEntries = (buf) => {
  // End of central directory record (scan back from the end)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportFileError("import_file_unreadable");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries[name] = { method, compSize, localOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = (name) => {
    const e = entries[name];
    if (!e) return null;
    const lnameLen = buf.readUInt16LE(e.localOffset + 26);
    const lextraLen = buf.readUInt16LE(e.localOffset + 28);
    const start = e.localOffset + 30 + lnameLen + lextraLen;
    const data = buf.subarray(start, start + e.compSize);
    if (e.method === 0) return data.toString("utf8");
    if (e.method === 8) return zlib.inflateRawSync(data).toString("utf8");
    throw new ImportFileError("import_file_unsupported_compression");
  };
  return { names: Object.keys(entries), read };
};

/* ------------------------------------------------------------------ XLSX */

const xmlUnescape = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const textOf = (xml) => {
  const parts = [];
  const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m;
  while ((m = re.exec(xml))) parts.push(xmlUnescape(m[1]));
  return parts.join("");
};

const colIndex = (ref) => {
  const letters = (ref.match(/^[A-Z]+/) || ["A"])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Excel serial date → YYYY-MM-DD (only applied to cells styled as dates is not tracked; kept raw). */
const parseXlsx = (buf) => {
  const zip = readZipEntries(buf);
  const shared = [];
  const sst = zip.read("xl/sharedStrings.xml");
  if (sst) {
    const re = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g;
    let m;
    while ((m = re.exec(sst))) shared.push(textOf(m[1]));
  }
  const wb = zip.read("xl/workbook.xml") || "";
  const rels = zip.read("xl/_rels/workbook.xml.rels") || "";
  const relMap = {};
  rels.replace(/<Relationship\b([^>]*)\/?>/g, (_, attrs) => {
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) relMap[id] = target;
    return "";
  });
  const sheets = [];
  wb.replace(/<(?:\w+:)?sheet\b([^>]*)\/?>/g, (_, attrs) => {
    const name = xmlUnescape((attrs.match(/\bname="([^"]*)"/) || [])[1] || "Sheet");
    const rid = (attrs.match(/\br:id="([^"]+)"/) || attrs.match(/\bid="([^"]+)"/) || [])[1];
    let target = relMap[rid] || "";
    target = target.replace(/^\//, "");
    if (!target.startsWith("xl/")) target = `xl/${target}`;
    sheets.push({ name, path: target });
    return "";
  });
  return sheets.map(({ name, path }) => {
    const xml = zip.read(path) || "";
    const rows = [];
    const rowRe = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const cells = [];
      const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
      let cm;
      while ((cm = cellRe.exec(rm[1] || ""))) {
        const attrs = cm[1];
        const inner = cm[2] || "";
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const v = (inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
        let value = "";
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = textOf(inner);
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) value = xmlUnescape(v);
        const idx = ref ? colIndex(ref) : cells.length;
        cells[idx] = value;
      }
      rows.push(Array.from(cells, (c) => (c === undefined ? "" : c)));
    }
    return { name, rows };
  });
};

/* ------------------------------------------------------------------ public */

/** Header row = first of the top rows that is at least half as wide as the widest one
 *  (organizer files often start with a title row or a blank line). */
const detectHeaderRow = (rows) => {
  const top = rows.slice(0, 20);
  const width = (r) => r.filter((c) => String(c ?? "").trim() !== "").length;
  const max = Math.max(0, ...top.map(width));
  const idx = top.findIndex((r) => width(r) >= Math.max(2, Math.ceil(max / 2)));
  return idx < 0 ? 0 : idx;
};

/**
 * Convert Excel fractional-day time values to HH:mm.
 * Excel stores time as a fraction of 24 hours.
 */
const normalizeExcelTime = (value) => {
  const normalized = String(value ?? "").trim();

  if (!normalized) return "";

  // Already in HH:mm format.
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    return normalized;
  }

  // Excel numeric time fraction.
  if (/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(normalized)) {
    const fraction = Number(normalized);

    if (fraction >= 0 && fraction < 1) {
      const totalMinutes = Math.round(fraction * 24 * 60);
      const minutes = totalMinutes % (24 * 60);

      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
  }

  return normalized;
};

/** Build { headers, rows } using the given header row (0-based index into rawRows). */
const buildTable = (rawRows, headerRow = 0) => {
  const headerCells = rawRows[headerRow] || [];
  const dataRows = rawRows.slice(headerRow + 1);
  const width = Math.max(headerCells.length, ...dataRows.map((r) => r.length), 0);
  const seen = {};
  const headers = [];

  for (let i = 0; i < width; i += 1) {
    let base = String(headerCells[i] ?? "").trim() || `Column ${i + 1}`;

    if (seen[base]) base = `${base} (${(seen[base] += 1)})`;
    else seen[base] = 1;

    headers.push(base);
  }

  // Identify columns containing time values.
  const timeColumns = new Set(
    headers
      .map((header, index) => ({
        header: header.toLowerCase().trim(),
        index,
      }))
      .filter(({ header }) =>
        /\b(start time|end time|available from|available until)\b/.test(header)
      )
      .map(({ index }) => index)
  );

  const rows = dataRows.map((r) => {
    const o = {};

    headers.forEach((h, i) => {
      const value = String(r[i] ?? "").trim();

      o[h] = timeColumns.has(i)
        ? normalizeExcelTime(value)
        : value;
    });

    return o;
  });

  return { headers, rows };
};

const tableFromRows = (name, input) => {
  const rawRows = input
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .slice(0, MAX_ROWS + 20)
    .map((r) => r.map((c) => String(c ?? "").trim()));
  if (!rawRows.length) return { name, rawRows: [], headerRow: 0, headers: [], rows: [], rowCount: 0 };
  const headerRow = detectHeaderRow(rawRows);
  const { headers, rows } = buildTable(rawRows, headerRow);
  return {
    name,
    rawRows,
    headerRow,
    headers,
    rows: rows.slice(0, MAX_ROWS),
    rowCount: rows.length,
    truncated: input.length > MAX_ROWS + 20,
  };
};

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {{ format: string, delimiter?: string, sheets: Array<{name, headers, rows, rowCount, truncated}> }}
 */
const parseImportFile = (buffer, filename = "") => {
  if (!buffer || !buffer.length) throw new ImportFileError("import_file_empty");
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const isZip = buffer.readUInt32LE(0) === 0x04034b50;
  if (ext === "xls" && !isZip) throw new ImportFileError("import_xls_not_supported_save_as_xlsx");
  if (isZip) {
    const sheets = parseXlsx(buffer).map((s) => tableFromRows(s.name, s.rows));
    return { format: "xlsx", sheets };
  }
  const { delimiter, rows } = parseCsv(buffer.toString("utf8"));
  return { format: "csv", delimiter, sheets: [tableFromRows(filename || "CSV", rows)] };
};

/** Serialize rows to CSV (RFC 4180, comma, CRLF, UTF-8 BOM so Excel opens accents correctly). */
const toCsv = (headers, rows) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
};

module.exports = { parseImportFile, toCsv, parseCsv, buildTable, ImportFileError, MAX_ROWS };
