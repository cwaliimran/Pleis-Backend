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


/** URL of the cards router as the client reached it (…/api/v1/app/payments/cards). */
const cardsBaseUrl = (req) => `${req.protocol}://${req.get("host")}${req.baseUrl}`;

/** Profile > Payment methods > Add card: start a Monri add_payment_method run. */
const startAddCard = async (req, res) => {
    try {
        const { startAddCard: start } = require("../services/userCardAddService");
        const data = await start({ userId: req.user._id, pageBaseUrl: cardsBaseUrl(req) });
        // attemptId: the app posts Monri's result via WebView postMessage when
        // the page cannot fetch our http complete URL (local emulator).
        return res.json({ page_url: data.page_url, attemptId: data.attemptId });
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

/** The hosted Add card page (opened in the app's WebView; reached by its page token). */
const addCardPage = async (req, res) => {
    try {
        const { renderAddCardPage } = require("../services/userCardAddService");
        const { status, html, csp } = await renderAddCardPage({
            attemptId: req.params.attemptId,
            pageToken: req.query.t,
            pageBaseUrl: cardsBaseUrl(req),
        });
        res.set("Cache-Control", "no-store");
        if (csp) res.set("Content-Security-Policy", csp);
        return res.status(status).type("html").send(html);
    } catch (error) {
        console.error("[add-card] page:", error.message);
        return res.status(500).type("html").send("<p>The page could not be loaded.</p>");
    }
};

/** Monri's result from the Add card page. Answers { status, code }. */
const completeAddCard = async (req, res) => {
    try {
        const { completeAddCard: complete } = require("../services/userCardAddService");
        const result = await complete({
            attemptId: req.params.attemptId,
            pageToken: req.body?.t,
            result: req.body?.result,
        });
        return res.json(result);
    } catch (error) {
        return res.status(error.statusCode || 500).json({ status: "failed", code: error.message });
    }
};

/** Last page of the Add card WebView; the app closes on this URL. */
const addCardResult = (req, res) => {
    const { resultHtml } = require("../services/userCardAddService");
    return res.type("html").send(resultHtml(req.query.status));
};


module.exports = {
    saveUserCard,
    getUserCards,
    deleteUserCard,
    setDefaultCard,
    chargeSavedCard,
    startAddCard,
    addCardPage,
    completeAddCard,
    addCardResult
};
