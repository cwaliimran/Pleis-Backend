const Promotion = require("./BasePromotion");
const BuyMenuItemPromotion = require("./buyMenuItemPromotion");
const HappyHourPromotion = require("./happyHourPromotion");
const ProductSalePromotion = require("./productSalePromotion");
const ClaimPromotion = require("./claimPromotion");
const PromotionsOrders = require("./PromotionsOrders");
const extraPointsForItemPromotion = require("./extraPointsForItem");

module.exports = {
  Promotion,
  BuyMenuItemPromotion,
  HappyHourPromotion,
  ProductSalePromotion,
  ClaimPromotion,
  PromotionsOrders,
  extraPointsForItemPromotion
};
