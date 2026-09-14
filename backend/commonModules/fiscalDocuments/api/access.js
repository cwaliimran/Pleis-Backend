function isAdminUser(user) {
  return user?.userType === "admin";
}

function canViewInvoice(user, invoice) {
  if (!invoice) return false;
  if (invoice.kind === "service_fee" && !isAdminUser(user)) return false;
  if (isAdminUser(user)) return true;
  const organizerId = user?._id || user?.id;
  if (!organizerId || !invoice.companyOrganizer) return false;
  return String(invoice.companyOrganizer) === String(organizerId);
}

function canViewConfirmation(user, confirmation) {
  if (!confirmation) return false;
  if (isAdminUser(user)) return true;
  const organizerId = user?._id || user?.id;
  if (!organizerId || !confirmation.organizerCompanyId) return false;
  return String(confirmation.organizerCompanyId) === String(organizerId);
}

function redactInvoiceForRole(user, invoice) {
  if (!invoice) return null;
  if (isAdminUser(user)) return invoice;
  if (invoice.kind === "service_fee") return null;
  return invoice;
}

module.exports = {
  isAdminUser,
  canViewInvoice,
  canViewConfirmation,
  redactInvoiceForRole,
};
