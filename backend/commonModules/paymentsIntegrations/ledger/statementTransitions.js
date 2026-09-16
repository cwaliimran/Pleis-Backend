/**
 * Pure statement lifecycle transitions (Payout §3.4 / §3.5).
 * Used by service + offline verify.
 */

function canConfirmStatement(statement) {
  return statement && statement.status === "PENDING";
}

function canCancelStatement(statement) {
  return statement && statement.status === "PENDING";
}

function applyConfirmTransition(statement, { actorId, at = new Date() } = {}) {
  if (!canConfirmStatement(statement)) {
    const err = new Error("statement_not_pending");
    err.code = "STATEMENT_NOT_PENDING";
    err.statusCode = 409;
    throw err;
  }
  return {
    ...statement,
    status: "PAID",
    confirmedAt: at,
    confirmedBy: actorId || null,
  };
}

function applyCancelTransition(statement, { actorId, at = new Date() } = {}) {
  if (!canCancelStatement(statement)) {
    const err = new Error("statement_not_pending");
    err.code = "STATEMENT_NOT_PENDING";
    err.statusCode = 409;
    throw err;
  }
  return {
    ...statement,
    status: "CANCELLED",
    cancelledAt: at,
    cancelledBy: actorId || null,
  };
}

/**
 * Ledger row updates on confirm.
 */
function ledgerConfirmPatch(at = new Date()) {
  return {
    payoutStatus: "PAID",
    payoutPaidAt: at,
    fiscalizationStatus: "NOT_FISCALIZED",
  };
}

/**
 * Ledger row updates on cancel — clear statementId, stay PENDING.
 */
function ledgerCancelPatch() {
  return {
    statementId: null,
    payoutBatchId: null,
  };
}

module.exports = {
  canConfirmStatement,
  canCancelStatement,
  applyConfirmTransition,
  applyCancelTransition,
  ledgerConfirmPatch,
  ledgerCancelPatch,
};
