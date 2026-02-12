const { completeRewardOrderService } = require("../../../app/loyalty/rewardsOrders/rewardsOrdersService");
const { validateParams, sendResponse, getReadableErrorMessage } = require("../../../helperUtils/responseUtil");

const completeRewardOrder = async (req, res) => {
    const { id, status, companyOrganizer } = req.body;
    const staffId = req.user._id;

    if (
        !validateParams(req, res, {
            rawData: ["id", "companyOrganizer"],
            objectIdFields: ["id", "companyOrganizer"],
        })
    )
        return;

    try {
        const result =
            await completeRewardOrderService({
                orderId: id,
                redeemedBy: staffId,
                status,
                companyOrganizer
            });

        if (result.error) {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: result.error,
            });
        }

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "reward_redeemed_successfully",
            data: {
                order: result.order,
                warnings: result.warnings || [],
            },
        });

    } catch (error) {
        const readableError = getReadableErrorMessage(error);

        return sendResponse({
            res,
            statusCode: readableError.statusCode,
            translationKey: readableError.message,
            error,
        });
    }
};

module.exports = {
    completeRewardOrder
}