const { applyBillkoCallback } = require("../../fiscalDocuments/documentService");

const billkoCallbackController = async (req, res) => {
  try {
    await applyBillkoCallback(req.body || {});
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Billko callback error:", error);
    return res.status(200).json({ received: true, processed: false });
  }
};

module.exports = { billkoCallbackController };
