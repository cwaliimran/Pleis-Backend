/**
 * Minimal .xlsx writer (Node built-ins only): text, number and time cells, a bold frozen
 * header row, column widths and data validation (dropdowns / number / time). Enough for
 * import templates and exports that open in Excel, Numbers and Google Sheets.
 */
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Build a ZIP (deflate) from [{ name, data: string|Buffer }]. */
const zip = (files) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // strip characters XML 1.0 does not allow
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colName = (i) => {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Cell styles (index into cellXfs below). */
const STYLE = { text: 0, header: 1, number: 2, time: 3, bold: 4 };

/**
 * A cell is a string (text), a number, or { v, type: "number" | "time" } — a time is the
 * Excel fraction of a day (07:00 → 0.291666…), shown as hh:mm.
 */
const cellXml = (v, ref, rowStyle) => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "object" && !Array.isArray(v)) {
    if (v.v === null || v.v === undefined || v.v === "") return "";
    const s = v.type === "time" ? STYLE.time : STYLE.number;
    return `<c r="${ref}" s="${s}"><v>${Number(v.v)}</v></c>`;
  }
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${rowStyle ? ` s="${rowStyle}"` : ""}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${rowStyle ? ` s="${rowStyle}"` : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
};

/**
 * validations: [{ sqref: "B3:B2000", type: "list"|"decimal"|"time", formula1, formula2?, operator?, error? }]
 * A list formula1 is a range such as 'Valid values'!$A$2:$A$686.
 */
const validationsXml = (validations = []) => {
  if (!validations.length) return "";
  const items = validations
    .map((d) => {
      const attrs = [
        `type="${d.type}"`,
        d.operator ? `operator="${d.operator}"` : "",
        'allowBlank="1"',
        'showErrorMessage="1"',
        d.errorStyle ? `errorStyle="${d.errorStyle}"` : "",
        d.error ? `errorTitle="Invalid value" error="${esc(d.error)}"` : "",
        `sqref="${d.sqref}"`,
      ]
        .filter(Boolean)
        .join(" ");
      const f2 = d.formula2 !== undefined ? `<formula2>${esc(d.formula2)}</formula2>` : "";
      return `<dataValidation ${attrs}><formula1>${esc(d.formula1)}</formula1>${f2}</dataValidation>`;
    })
    .join("");
  return `<dataValidations count="${validations.length}">${items}</dataValidations>`;
};

/**
 * headerRow: 0-based row shown bold and frozen with everything above it (default 0).
 * boldRows: extra 0-based rows shown bold (e.g. the "menus" row above the header).
 */
const sheetXml = ({ rows, widths = [], headerRow = 0, boldRows = [], validations = [] }) => {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const body = rows
    .map((r, ri) => {
      const rowStyle = ri === headerRow ? STYLE.header : boldRows.includes(ri) ? STYLE.bold : 0;
      const cells = r.map((v, ci) => cellXml(v, `${colName(ci)}${ri + 1}`, rowStyle)).join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const split = headerRow + 1;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${split}" topLeftCell="A${split + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `${cols}<sheetData>${body}</sheetData>${validationsXml(validations)}</worksheet>`
  );
};

/**
 * @param {Array<{ name: string, rows: string[][], widths?: number[] }>} sheets  first row = header
 * @returns {Buffer} .xlsx file
 */
const buildXlsx = (sheets) => {
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("") +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    },
    {
      name: "xl/workbook.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map((s, i) => `<sheet name="${esc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
    {
      name: "xl/styles.xml",
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="hh:mm"/></numFmts>' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
        '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        "</styleSheet>",
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
};

module.exports = { buildXlsx, colName };
