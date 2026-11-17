const {
    getUserCardsService,
    deleteUserCardService,
    setDefaultCardService
} = require("../services/userCardService");

const { sendResponse, getReadableErrorMessage } =
    require("../../../../helperUtils/responseUtil");

/**
 * Monri v1.4 §5.1: a card is saved only by Monri, when the guest ticks the
 * save box on Monri's payment form and the payment is approved
 * (see monriController success). The app never sends card data or tokens.
 */
const saveUserCard = async (req, res) => {
    return sendResponse({
        res,
        statusCode: 410,
        translationKey: "card_saved_on_payment_only",
    });
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
        const cardId = req.params.cardId || req.params.id;

        // The token is erased with the row; the card disappears from every checkout.
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


/**
 * Monri v1.4 §5.1: "A saved guest card is charged only with the guest present
 * and confirming that payment … Pleis never charges a guest card on its own
 * initiative." A saved card is paid on Monri's form (CVV + 3DS) through
 * /payments/monri/web-pay-session?savedCardId=…; there is no server-side charge.
 */
const chargeSavedCard = async (req, res) => {
    return sendResponse({
        res,
        statusCode: 410,
        translationKey: "saved_card_paid_on_monri_form",
    });
};


module.exports = {
    saveUserCard,
    getUserCards,
    deleteUserCard,
    setDefaultCard,
    chargeSavedCard
};
