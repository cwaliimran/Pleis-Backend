/**
 * HR SEPA Instant pain.001.001.09 builder (Payout §5–§7).
 *
 * Best-effort valid structure matching sepainst.hr.pain.001.001.09 style.
 * XSD limits (document; offline verify does not ship the bank XSD):
 *  - MsgId / PmtInfId / InstrId / EndToEndId max 35
 *  - Nm max 70; TwnNm max 35; StrtNm max 70; BldgNb/PstCd max 16
 *  - Amounts 0.01–999999999.99 EUR, 2 decimals
 *  - Structured address only (AdrLine forbidden)
 *  - One PmtInf; LclInstrm/Cd=INST at group level; ChrgBr=SLEV at group
 * Full XSD validation against sepainst.hr.pain.001.001.09 is bank-side /
 * Phase C tooling — this builder emits well-formed XML for manual upload.
 */

const {
  normalizeIban,
  isValidIbanChecksum,
  isValidOib,
  sanitizePainText,
  isCroatianIban,
} = require("./ibanOibValidation");

const NS = "urn:iso:std:iso:20022:tech:xsd:sctinsthr:pain.001.001.09";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function centsToAmount(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2);
}

function buildPostalAdr(addr = {}) {
  const strt = sanitizePainText(addr.street || addr.StrtNm || "", 70);
  const bldg = sanitizePainText(addr.buildingNo || addr.BldgNb || "", 16);
  const pst = sanitizePainText(addr.postcode || addr.PstCd || "", 16);
  const twn = sanitizePainText(addr.town || addr.TwnNm || "", 35);
  const ctry = String(addr.country || addr.Ctry || "HR")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!twn || !ctry) {
    const err = new Error("structured_address_incomplete");
    err.code = "STRUCTURED_ADDRESS_INCOMPLETE";
    throw err;
  }
  let xml = "<PstlAdr>";
  if (strt) xml += `<StrtNm>${escapeXml(strt)}</StrtNm>`;
  if (bldg) xml += `<BldgNb>${escapeXml(bldg)}</BldgNb>`;
  if (pst) xml += `<PstCd>${escapeXml(pst)}</PstCd>`;
  xml += `<TwnNm>${escapeXml(twn)}</TwnNm>`;
  xml += `<Ctry>${escapeXml(ctry)}</Ctry>`;
  xml += "</PstlAdr>";
  return xml;
}

function buildPartyId(oib) {
  const id = sanitizePainText(String(oib || ""), 35, { allowNational: false });
  if (!id) return "";
  return `<Id><OrgId><Othr><Id>${escapeXml(id)}</Id></Othr></OrgId></Id>`;
}

function remittanceHr({ statementDate, statementId, description }) {
  const addtl = sanitizePainText(
    description || `Pleis isplata ${statementDate} ${statementId || ""}`,
    140,
  );
  return `<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry><Issr>HR ref</Issr></Tp><Ref>HR99</Ref></CdtrRefInf><AddtlRmtInf>${escapeXml(addtl)}</AddtlRmtInf></Strd></RmtInf>`;
}

function remittanceCrossBorder(description) {
  const u = sanitizePainText(description || "Pleis payout", 140, {
    allowNational: false,
  });
  return `<RmtInf><Ustrd>${escapeXml(u)}</Ustrd></RmtInf>`;
}

function buildPain001Xml(input) {
  const pleis = input.pleis;
  const organizerLines = input.organizerLines || [];
  const commission = input.commissionLine;
  const lines = [...organizerLines];
  if (commission && Math.round(Number(commission.amountCents) || 0) > 0) {
    lines.push({
      ...commission,
      isCommission: true,
      name: pleis.operatingAccountName || pleis.name,
      oib: pleis.operatingAccountOib || pleis.oib,
      iban: pleis.operatingIban,
      address: {
        street: pleis.addressStreet,
        buildingNo: pleis.addressBuildingNo,
        postcode: pleis.addressPostcode,
        town: pleis.addressTown,
        country: pleis.addressCountry || "HR",
      },
    });
  }

  if (!lines.length) {
    const err = new Error("pain001_no_lines");
    err.code = "PAIN001_NO_LINES";
    throw err;
  }

  const ibansSeen = new Set();
  let ctrlSumCents = 0;
  for (const line of lines) {
    const amt = Math.round(Number(line.amountCents) || 0);
    if (amt < 1 || amt > 99999999999) {
      const err = new Error("pain001_amount_out_of_range");
      err.code = "PAIN001_AMOUNT_INVALID";
      throw err;
    }
    ctrlSumCents += amt;
    const iban = normalizeIban(line.iban);
    if (!isValidIbanChecksum(iban)) {
      const err = new Error(`pain001_invalid_iban:${iban}`);
      err.code = "PAIN001_INVALID_IBAN";
      throw err;
    }
    if (ibansSeen.has(iban)) {
      const err = new Error(`pain001_duplicate_creditor_iban:${iban}`);
      err.code = "PAIN001_DUPLICATE_IBAN";
      throw err;
    }
    ibansSeen.add(iban);
    if (line.oib && !isValidOib(line.oib)) {
      const err = new Error(`pain001_invalid_oib:${line.oib}`);
      err.code = "PAIN001_INVALID_OIB";
      throw err;
    }
  }

  const lockedIban = normalizeIban(pleis.lockedIban);
  if (!isValidIbanChecksum(lockedIban)) {
    const err = new Error("pain001_invalid_debtor_iban");
    err.code = "PAIN001_INVALID_DEBTOR_IBAN";
    throw err;
  }
  if (normalizeIban(pleis.operatingIban) === lockedIban) {
    const err = new Error("pain001_locked_equals_operating");
    err.code = "PLEIS_PAYOUT_CONFIG_INVALID";
    throw err;
  }

  const nb = String(lines.length);
  const ctrlSum = centsToAmount(ctrlSumCents);
  const stmtDate = input.statementDate || input.reqdExctnDt || "";
  const dbtrName = sanitizePainText(pleis.lockedAccountName || pleis.name, 70);
  const initName = sanitizePainText(pleis.name, 70);

  let dbtrAgt;
  if (pleis.lockedBic) {
    dbtrAgt = `<DbtrAgt><FinInstnId><BICFI>${escapeXml(sanitizePainText(pleis.lockedBic, 11, { allowNational: false }))}</BICFI></FinInstnId></DbtrAgt>`;
  } else {
    dbtrAgt =
      "<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>";
  }

  let txXml = "";
  for (const line of lines) {
    const iban = normalizeIban(line.iban);
    const nm = sanitizePainText(line.name, 70);
    const endToEnd = isCroatianIban(iban)
      ? "HR99"
      : sanitizePainText(line.endToEndId || "NOTPROVIDED", 35, {
          allowNational: false,
        });
    const rmt = isCroatianIban(iban)
      ? remittanceHr({
          statementDate: stmtDate,
          statementId: input.pmtInfId,
          description: line.isCommission
            ? `Pleis provizija ${stmtDate}`
            : `Pleis isplata ${stmtDate} ${input.pmtInfId || ""}`,
        })
      : remittanceCrossBorder(
          line.isCommission
            ? `Pleis commission ${stmtDate}`
            : `Pleis payout ${stmtDate}`,
        );

    txXml += "<CdtTrfTxInf>";
    txXml += `<PmtId><InstrId>${escapeXml(sanitizePainText(line.instrId, 35, { allowNational: false }))}</InstrId><EndToEndId>${escapeXml(endToEnd)}</EndToEndId></PmtId>`;
    txXml += `<Amt><InstdAmt Ccy="EUR">${centsToAmount(line.amountCents)}</InstdAmt></Amt>`;
    txXml += `<Cdtr><Nm>${escapeXml(nm)}</Nm>`;
    txXml += buildPostalAdr(line.address || {});
    txXml += buildPartyId(line.oib);
    txXml += "</Cdtr>";
    txXml += `<CdtrAcct><Id><IBAN>${escapeXml(iban)}</IBAN></Id></CdtrAcct>`;
    if (!line.isCommission) txXml += "<Purp><Cd>SUPP</Cd></Purp>";
    txXml += rmt;
    txXml += "</CdtTrfTxInf>";
  }

  const creDtTm = input.creDtTm || new Date().toISOString().replace("Z", "");
  const cre = creDtTm.includes("T")
    ? creDtTm.slice(0, 23)
    : `${creDtTm}T00:00:00.000`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Document xmlns="${NS}">` +
    `<CstmrCdtTrfInitn>` +
    `<GrpHdr>` +
    `<MsgId>${escapeXml(sanitizePainText(input.msgId, 35, { allowNational: false }))}</MsgId>` +
    `<CreDtTm>${escapeXml(cre)}</CreDtTm>` +
    `<NbOfTxs>${escapeXml(nb)}</NbOfTxs>` +
    `<CtrlSum>${ctrlSum}</CtrlSum>` +
    `<InitgPty><Nm>${escapeXml(initName)}</Nm>${buildPartyId(pleis.oib)}</InitgPty>` +
    `</GrpHdr>` +
    `<PmtInf>` +
    `<PmtInfId>${escapeXml(sanitizePainText(input.pmtInfId, 35, { allowNational: false }))}</PmtInfId>` +
    `<PmtMtd>TRF</PmtMtd>` +
    `<BtchBookg>false</BtchBookg>` +
    `<NbOfTxs>${escapeXml(nb)}</NbOfTxs>` +
    `<CtrlSum>${ctrlSum}</CtrlSum>` +
    `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>INST</Cd></LclInstrm></PmtTpInf>` +
    `<ReqdExctnDt><Dt>${escapeXml(input.reqdExctnDt)}</Dt></ReqdExctnDt>` +
    `<Dbtr><Nm>${escapeXml(dbtrName)}</Nm>` +
    buildPostalAdr({
      street: pleis.addressStreet,
      buildingNo: pleis.addressBuildingNo,
      postcode: pleis.addressPostcode,
      town: pleis.addressTown,
      country: pleis.addressCountry || "HR",
    }) +
    buildPartyId(pleis.oib) +
    `</Dbtr>` +
    `<DbtrAcct><Id><IBAN>${escapeXml(lockedIban)}</IBAN></Id></DbtrAcct>` +
    dbtrAgt +
    `<ChrgBr>SLEV</ChrgBr>` +
    txXml +
    `</PmtInf>` +
    `</CstmrCdtTrfInitn>` +
    `</Document>`;

  return {
    xml,
    nbOfTxs: lines.length,
    ctrlSumCents,
    ctrlSum,
    fileName:
      input.fileName ||
      `INST.${(input.reqdExctnDt || "").replace(/-/g, "")}.${String(
        input.fileSequence || 1,
      ).padStart(4, "0")}.xml`,
    lines,
  };
}

function softValidatePain001(xml, expectations = {}) {
  const issues = [];
  if (!xml.includes(`xmlns="${NS}"`)) issues.push("missing_namespace");
  if (!xml.includes("<LclInstrm><Cd>INST</Cd></LclInstrm>")) {
    issues.push("missing_inst");
  }
  if (expectations.lockedIban) {
    const iban = normalizeIban(expectations.lockedIban);
    if (!xml.includes(`<IBAN>${iban}</IBAN>`)) issues.push("missing_debtor_iban");
  }
  if (expectations.operatingIban) {
    const iban = normalizeIban(expectations.operatingIban);
    if (!xml.includes(`<IBAN>${iban}</IBAN>`)) issues.push("missing_operating_iban");
  }
  const txCount = (xml.match(/<CdtTrfTxInf>/g) || []).length;
  if (expectations.nbOfTxs != null && txCount !== expectations.nbOfTxs) {
    issues.push(`nb_mismatch:${txCount}!=${expectations.nbOfTxs}`);
  }
  return { ok: issues.length === 0, issues, txCount };
}

module.exports = {
  NS,
  escapeXml,
  centsToAmount,
  buildPain001Xml,
  softValidatePain001,
  // pain001.js compatibility aliases
  sanitizeSepaText: sanitizePainText,
  assertPain001Structure: (xml, expected) => {
    const soft = softValidatePain001(xml, {
      lockedIban: expected.lockedIban,
      operatingIban: expected.operatingIban,
      nbOfTxs: expected.nbOfTxs,
    });
    if (!soft.ok) throw new Error(`pain001_structure:${soft.issues.join(",")}`);
    if (
      expected.ctrlSum &&
      !xml.includes(`<CtrlSum>${expected.ctrlSum}</CtrlSum>`)
    ) {
      throw new Error("pain001_ctrlSum_mismatch");
    }
    return true;
  },
};
