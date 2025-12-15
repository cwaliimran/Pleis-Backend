// services/unifiedTransactionsService.js
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const unifiedRepo = require("../repositories/unifiedTransactionsRepository");
const { formatTransactionItem } = require("../repositories/../formatter/formatTransactionItems"); // adjust path

/**
 * Create a unified transaction (repository updates appropriate wallet)
 */
const createTransaction = async (data, session) => {
    // Validate essential fields here (defensive)
    const {
        user,
        companyOrganizer,
        organization,
        type,
        domainType,
        entityId,
        companyPoints,
        globalPoints,
        allowNegative,
        description
    } = data;
    if (!user) throw new Error("User is required");
    if (!domainType) throw new Error("domainType required");
    // if (!points || points.base === undefined || points.total === undefined) throw new Error("Invalid points payload");
    if (companyPoints === null && globalPoints === null) {
        throw new Error("At least one of companyPoints or globalPoints must be provided");
    }

    const result = await unifiedRepo.createTransaction(data, session);

    // Always return a clean status object
    if (!result || result.success === false) {
        return {
            success: false,
            message: result?.message || "transaction_failed"
        };
    }

    return {
        success: true,
        data: result.transactions
    };

};

/**
 * List transactions with filters and pagination
 */
const getTransactions = async ({ page = 1, limit = 10, user, walletType, domainType, type, organization, companyOrganizer, entityId, date }) => {
    const skip = limit === 0 ? 0 : (page - 1) * limit;
    const query = {};
    if (user) query.user = new mongoose.Types.ObjectId(user);
    if (walletType) query.walletType = walletType;
    if (domainType) query.domainType = domainType;
    if (type) query.type = type;
    if (organization) query.organization = new mongoose.Types.ObjectId(organization);
    if (companyOrganizer) query.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
    if (entityId) query.entityId = entityId;
    if (date) {
        const start = new Date(date);
        const end = new Date(new Date(date).setDate(start.getDate() + 1));
        query.createdAt = { $gte: start, $lt: end };
    }

    const [items, total] = await Promise.all([
        unifiedRepo.getTransactionsWithFilters(query, skip, limit),
        unifiedRepo.countTransactions(query)
    ]);

    let formattedItems = items.map(i => formatTransactionItem(i));


    const meta = generateMeta(page, limit, total);
    return { items: formattedItems, meta };
};

const getTransactionDetails = async (id) => {
    const trx = await unifiedRepo.findTransactionById(id);
    if (!trx) return null;
    return formatTransactionItem(trx);
};

const updateTransaction = async (id, data) => {
    const trx = await unifiedRepo.findTransactionById(id);
    if (!trx) return null;

    // Allowed fields to update manually (administrative)
    const allowed = ['type', 'domainType', 'points', 'closingBalance', 'description'];
    const updateData = {};
    allowed.forEach(k => {
        if (data[k] !== undefined) updateData[k] = data[k];
    });

    if (Object.keys(updateData).length === 0) return formatTransactionItem(trx);

    await unifiedRepo.updateTransactionData(trx, updateData);
    return formatTransactionItem(trx);
};

const deleteTransaction = async (id) => {
    const updated = await unifiedRepo.findByIdAndUpdate(id, { deleted: true });
    if (!updated) return null;
    return true;
};

module.exports = {
    createTransaction,
    getTransactions,
    getTransactionDetails,
    updateTransaction,
    deleteTransaction
};
