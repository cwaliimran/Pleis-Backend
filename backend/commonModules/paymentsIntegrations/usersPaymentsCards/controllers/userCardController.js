const {
    saveUserCardService,
    getUserCardsService,
    deleteUserCardService,
    setDefaultCardService
} = require("../services/userCardService");

const { sendResponse, getReadableErrorMessage } =
    require("../../../../helperUtils/responseUtil");
const { getCardById } = require("../repositories/userCardRepository");
const { default: axios } = require("axios");
const { UserBillingInformation } = require("../../../transactions/UserBillingInformation");


const saveUserCard = async (req, res) => {
    try {

        const { _id: userId } = req.user;
        const { panToken, maskedPan, brand } = req.body;

        const card = await saveUserCardService({
            userId,
            panToken,
            maskedPan,
            brand
        });

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "card_saved_successfully",
            data: card
        });

    } catch (error) {
        const readableError = getReadableErrorMessage(error);
        return sendResponse({
            res,
            statusCode: readableError.statusCode,
            translationKey: readableError.message,
            error
        });
    }
};


const getUserCards = async (req, res) => {
    try {

        const { _id: userId } = req.user;

        const cards = await getUserCardsService(userId);

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "cards_fetched_successfully",
            data: cards
        });

    } catch (error) {
        const readableError = getReadableErrorMessage(error);
        return sendResponse({
            res,
            statusCode: readableError.statusCode,
            translationKey: readableError.message,
            error
        });
    }
};


const deleteUserCard = async (req, res) => {
    try {

        const { _id: userId } = req.user;
        const { cardId } = req.params;

        await deleteUserCardService({ cardId, userId });

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "card_deleted_successfully"
        });

    } catch (error) {
        const readableError = getReadableErrorMessage(error);
        return sendResponse({
            res,
            statusCode: readableError.statusCode,
            translationKey: readableError.message,
            error
        });
    }
};


const setDefaultCard = async (req, res) => {
    try {

        const { _id: userId } = req.user;
        const { cardId } = req.params;

        const card = await setDefaultCardService({ cardId, userId });

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "default_card_updated",
            data: card
        });

    } catch (error) {
        const readableError = getReadableErrorMessage(error);
        return sendResponse({
            res,
            statusCode: readableError.statusCode,
            translationKey: readableError.message,
            error
        });
    }
};



const chargeSavedCard = async (req, res) => {
    try {
        const { cardId, amount, orderNumber, billingId } = req.body;
        const { _id: userId } = req.user;

        // 1) Validate card belongs to user
        const card = await getCardById(cardId, userId);
        if (!card) {
            return res.status(404).json({ message: "Card not found" });
        }

        // 2) Validate billing belongs to user
        const billing = await UserBillingInformation.findOne({
            _id: billingId,
        });

        if (!billing) {
            return res.status(404).json({ message: "Billing information not found" });
        }

        // 3) Get client IP (works behind proxies if trust proxy enabled)
        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.socket?.remoteAddress ||
            "127.0.0.1";

        // 4) Build Monri payload
        const payload = {
            transaction: {
                transaction_type: "purchase",
                amount: Number(amount), // minor units (e.g., 500 = €5.00)
                currency: "EUR",
                order_number: orderNumber,

                pan_token: card.panToken,
                moto: true,

                ip,

                ch_full_name: `${billing.firstName} ${billing.lastName}`,
                ch_email: billing.email,

                ch_address: billing.billingAddress.address,
                ch_city: billing.billingAddress.city,
                ch_zip: billing.billingAddress.postalCode,
                ch_country: billing.billingAddress.country,

                // If you have it, include phone
                // ch_phone: billing.phone || "+000000000"
            },
        };

        const response = await axios.post(
            "https://ipgtest.monri.com/v2/transaction",
            payload,
            {
                headers: {
                    Authorization: `key-${process.env.MONRI_AUTH_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        return res.json(response.data);
    } catch (err) {
        console.error("Monri charge error:", err.response?.data || err.message);

        return res.status(err.response?.status || 500).json({
            message: "Payment failed",
            error: err.response?.data || err.message,
        });
    }
};


module.exports = {
    saveUserCard,
    getUserCards,
    deleteUserCard,
    setDefaultCard,
    chargeSavedCard
};