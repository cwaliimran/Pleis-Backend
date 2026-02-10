const formatTransactionForCSV = (item) => {
  return {
    TransactionID: item.publicId,
    Date: item.createdAt,
    WalletType: item.walletType,
    Type: item.type,
    Domain: item.domainType,

    UserName: `${item.user?.firstName || ""} ${item.user?.lastName || ""}`,
    UserEmail: item.user?.email || "",

    Organization: item.organization?.basicInfo?.name || "",
    PointsBase: item.points?.base || 0,
    PointsTotal: item.points?.total || 0,
    ClosingBalance: item.closingBalance,

    Description: item.description,
    BatchId: item.batchId,
  };
};
const titleCase = (str = "") => {
  return str
    .replace(/([A-Z])/g, " $1")   // split camelCase
    .replace(/[_-]/g, " ")        // handle snake_case / kebab-case
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, s => s.toUpperCase());
};

const formatEnum = (value = "") => {
  return value ? titleCase(value) : "";
};
const formatDate = (date) =>
  date
    ? new Date(date).toISOString().replace("T", " ").slice(0, 19)
    : "";

module.exports = {
  titleCase,
  formatEnum,
  formatTransactionForCSV,
  formatDate
};
