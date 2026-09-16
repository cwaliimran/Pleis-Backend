/**
 * Statement eligibility selection (Payout §2.2 / §2.3 / §3.2 / §8).
 *
 * Selectable when:
 *   - payoutStatus PENDING (or HELD promoted when service_completed at generate)
 *   - statementId null
 *   - service_completed
 *   - not disputed/refunded when those fields exist
 *
 * Ticketing HELD: generate promotes HELD→PENDING when event ended (service_completed).
 * No separate HELD→PENDING cron required for Phase B.
 */

const {
  isServiceCompletedForLedger,
  isTicketingServiceCompleted,
  isOrderingServiceCompleted,
} = require("./serviceCompleted");

function isDisputedOrRefunded(entry, context = {}) {
  if (context.disputed === true || context.refunded === true) return true;
  if (entry.disputed === true || entry.isDisputed === true) return true;
  if (entry.refunded === true || entry.isRefunded === true) return true;
  const status = String(entry.paymentStatus || "").toLowerCase();
  if (status === "refunded") return true;
  const reason = String(entry.exclusionReason || "");
  if (reason === "REFUNDED" || reason === "CHARGEBACK") return true;
  return false;
}

/** Status gate only (no service_completed / period). */
function isPayoutSelectableStatus(entry) {
  if (!entry) return false;
  if (entry.statementId) return false;
  if (entry.payoutStatus === "PENDING") return true;
  // HELD may become selectable after promote — status check alone is false
  return false;
}

/**
 * Whether generate should promote HELD → PENDING for this row.
 */
function shouldPromoteHeldToPending(entry, context = {}) {
  if (!entry || entry.payoutStatus !== "HELD") return false;
  if (entry.module !== "TICKETING") return false;
  if (entry.statementId) return false;
  if (isDisputedOrRefunded(entry, context)) return false;
  return isTicketingServiceCompleted(
    context.event || context.eventEndAt,
    context.now,
  );
}

/**
 * Capture timestamp within [periodStart, periodEnd] inclusive.
 */
function isCapturedInPeriod(entry, periodStart, periodEnd) {
  const at = entry?.capturedAt ? new Date(entry.capturedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return false;
  if (periodStart && at.getTime() < new Date(periodStart).getTime()) return false;
  if (periodEnd && at.getTime() > new Date(periodEnd).getTime()) return false;
  return true;
}

/**
 * Full eligibility for statement selection (Payout §8 step 3).
 * Accepts HELD when service completed (promote path).
 */
function isEligibleForStatement(entry, context = {}, periodStart, periodEnd) {
  if (!entry) return false;
  if (entry.statementId) return false;
  if (isDisputedOrRefunded(entry, context)) return false;
  if (entry.payoutStatus === "EXCLUDED" || entry.payoutStatus === "PAID") {
    return false;
  }
  if (periodStart != null || periodEnd != null) {
    if (!isCapturedInPeriod(entry, periodStart, periodEnd)) return false;
  }

  if (entry.payoutStatus === "HELD") {
    return shouldPromoteHeldToPending(entry, context);
  }
  if (entry.payoutStatus !== "PENDING") return false;

  if (entry.module === "TICKETING") {
    return isTicketingServiceCompleted(
      context.event || context.eventEndAt,
      context.now,
    );
  }
  if (entry.module === "ORDERING") {
    return isOrderingServiceCompleted(context.order || entry);
  }
  return isServiceCompletedForLedger(entry, context);
}

/** Alias used by some call sites. */
function isLedgerEntrySelectable(entry, context = {}) {
  return isEligibleForStatement(entry, context);
}

/**
 * Guard: only one PENDING statement at a time (§3.2).
 */
function assertNoPendingStatement(existingPending) {
  if (existingPending) {
    const err = new Error("pending_statement_exists");
    err.code = "PENDING_STATEMENT_EXISTS";
    err.statusCode = 409;
    err.pendingStatementId =
      existingPending.batchReference || existingPending._id || existingPending.id;
    throw err;
  }
}

function resolvePeriodStart({
  lastStatementPeriodEnd,
  goLiveDate,
  earliestEligibleCapturedAt,
}) {
  if (lastStatementPeriodEnd) {
    return new Date(new Date(lastStatementPeriodEnd).getTime() + 1);
  }
  if (goLiveDate) return new Date(goLiveDate);
  if (earliestEligibleCapturedAt) return new Date(earliestEligibleCapturedAt);
  return new Date(0);
}

/**
 * End of selected calendar day in Europe/Zagreb (23:59:59.999).
 */
function endOfDayZagreb(dayInput) {
  const raw = String(dayInput || "").trim();
  let y;
  let m;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [y, m, d] = raw.split("-").map(Number);
  } else {
    const dt = new Date(dayInput);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zagreb",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(dt);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    y = get("year");
    m = get("month");
    d = get("day");
  }

  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMs = zagrebOffsetMs(probe);
  const localAsUtc = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  return new Date(localAsUtc - offsetMs);
}

function zagrebOffsetMs(date) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Zagreb",
      timeZoneName: "shortOffset",
      hour: "2-digit",
      hour12: false,
    });
    const tz =
      dtf.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ||
      "GMT+2";
    const match = tz.match(/GMT([+-])(\d+)(?::?(\d+))?/i);
    if (!match) return 2 * 60 * 60 * 1000;
    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2] || 0);
    const mins = Number(match[3] || 0);
    return sign * (hours * 60 + mins) * 60 * 1000;
  } catch {
    return 2 * 60 * 60 * 1000;
  }
}

function zagrebYmd(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date).replace(/-/g, "");
}

module.exports = {
  isDisputedOrRefunded,
  isPayoutSelectableStatus,
  shouldPromoteHeldToPending,
  isCapturedInPeriod,
  isEligibleForStatement,
  isLedgerEntrySelectable,
  assertNoPendingStatement,
  resolvePeriodStart,
  endOfDayZagreb,
  zagrebOffsetMs,
  zagrebYmd,
};
