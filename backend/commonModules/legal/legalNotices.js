/**
 * Partner T&C change notice (PLEIS Legal spec 1.5, Requirement Set #101):
 * "on every new version, show a notice in the Partner Dashboard (and send email) with a
 * summary of changes and the effective date. Partner must acknowledge it on next login."
 *
 * The dashboard notice + acknowledgement is the re-acceptance gate (GET /legal/status →
 * PartnerLegalGate). This module sends the email to every partner account.
 */
const { sendEmailViaMailgun } = require("../../helperUtils/emailUtil");
const { resolvePleisSupportEmail } = require("../../config/CONSTANTS");

const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (d) => {
  const date = d ? new Date(d) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}.`;
};

/** Partner Dashboard → Legal URL. PARTNER_DASHBOARD_URL, else the admin panel origin. */
const partnerLegalUrl = () => {
  const explicit = process.env.PARTNER_DASHBOARD_URL;
  let origin = explicit || "";
  if (!origin && process.env.PASSWORD_RESET_FRONTEND_URL) {
    try {
      origin = new URL(process.env.PASSWORD_RESET_FRONTEND_URL).origin;
    } catch {
      origin = "";
    }
  }
  return origin ? `${origin.replace(/\/+$/, "")}/organizer/legal` : "";
};

const buildPartnerTermsNoticeEmail = (doc, partner = {}) => {
  const name = [partner.firstName, partner.lastName].filter(Boolean).join(" ").trim();
  const effective = formatDate(doc.effectiveDate);
  const link = partnerLegalUrl();
  const support = resolvePleisSupportEmail();
  const subject = `${doc.title} updated — version ${doc.version}${effective ? `, effective ${effective}` : ""}`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8f6f7;font-family:Arial,Helvetica,sans-serif;color:#14181F;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;">
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 12px;font-size:20px;">${escapeHtml(doc.title)} — version ${escapeHtml(doc.version)}</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;">${name ? `Dear ${escapeHtml(name)},` : "Dear partner,"}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;">
        We have published a new version of the ${escapeHtml(doc.title)}${effective ? `, effective <strong>${escapeHtml(effective)}</strong>` : ""}.
      </p>
      ${
        doc.summary
          ? `<div style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #f59e0b;background:#fffbeb;font-size:14px;line-height:1.5;">
        <div style="font-weight:bold;margin-bottom:4px;">Summary of changes</div>
        ${escapeHtml(doc.summary).replace(/\n/g, "<br>")}
      </div>`
          : ""
      }
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
        You will be asked to review and acknowledge the new version the next time you log in to the Partner Dashboard.
      </p>
      ${
        link
          ? `<p style="margin:0 0 16px;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#14181F;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;">Open Partner Dashboard → Legal</a></p>`
          : ""
      }
      ${support ? `<p style="margin:0;font-size:12px;color:#6B7280;">Questions? Write to us at <a href="mailto:${escapeHtml(support)}">${escapeHtml(support)}</a>.</p>` : ""}
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
};

const BATCH_SIZE = 10;

/**
 * Email every partner (organizer account that is not deleted). Runs in the background so
 * publishing is not blocked; failures are logged, never thrown. `send` is injectable for tests.
 */
const sendPartnerTermsChangeNotice = async (doc, { send = sendEmailViaMailgun, query } = {}) => {
  const { User } = require("../../models/UserModel");
  const partners = await User.find(
    query || {
      "accountState.userType": "organizer",
      "accountState.status": { $ne: "deleted" },
      email: { $exists: true, $nin: [null, ""] },
    }
  )
    .select("email firstName lastName")
    .lean();

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < partners.length; i += BATCH_SIZE) {
    const batch = partners.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          const { subject, html } = buildPartnerTermsNoticeEmail(doc, p);
          const res = await send(p.email, subject, html, { replyTo: resolvePleisSupportEmail() });
          return res?.success !== false;
        } catch (e) {
          return false;
        }
      })
    );
    results.forEach((ok) => (ok ? sent++ : failed++));
  }
  console.log(`[legal] Partner T&C v${doc.version} change notice: ${sent} sent, ${failed} failed (${partners.length} partners)`);
  return { total: partners.length, sent, failed };
};

const notifyPartnersOfTermsChange = (doc) => {
  setImmediate(() => {
    sendPartnerTermsChangeNotice(doc).catch((e) =>
      console.error("[legal] Partner T&C change notice failed:", e?.message || e)
    );
  });
};

module.exports = {
  buildPartnerTermsNoticeEmail,
  sendPartnerTermsChangeNotice,
  notifyPartnersOfTermsChange,
  partnerLegalUrl,
};
