const { getUserDetailsForQRService } = require("../../admin/usersManagement/usersService");
const { getUserCompanyWallet } = require("../../app/loyalty/clubMembers/clubMembersService");
const { sendResponse, validateParams } = require("@utils/responseUtil");

const scanQrController = async (req, res) => {
  try {
    const { qrData } = req.body;
    const { user, companyOrganizer, type = "loyaltyCard" } = qrData;

    if (
      !validateParams(req, res, {
        rawData: ["qrData.user", "qrData.type"],
        enumFields: {
          "qrData.type": ["loyaltyCard", "eventTicket"],
        },
      })
    ) return;


    let [wallet, userDetails] = await Promise.all([
      getUserCompanyWallet(user, companyOrganizer),
      getUserDetailsForQRService(user)
    ]);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "qr_code_scanned_successfully",
      data: {
        wallet,
        userDetails
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
}

module.exports = { scanQrController };
