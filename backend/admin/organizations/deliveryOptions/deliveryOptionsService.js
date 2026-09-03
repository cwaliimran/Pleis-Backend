const deliveryOptionsRepo = require("./deliveryOptionsRepository");
const { emitDeliveryOptionEvent } = require("@socketIo/deliveryOptions/deliveryOptionSocketEmitter");

function emitDeliveryOptionChange(deliveryOption, updateTypes = ["updated"]) {
  if (!deliveryOption) return;
  emitDeliveryOptionEvent({
    io: global.io,
    eventName: "DELIVERY_OPTION_CHANGED",
    deliveryOptionId: deliveryOption._id,
    organizationId: deliveryOption.organization,
    data: deliveryOption,
    updateTypes,
  });
}

const createDeliveryOption = async (data) => {
  const created = await deliveryOptionsRepo.createDeliveryOption(data);
  emitDeliveryOptionChange(created, ["created"]);
  return created;
};

const getDeliveryOptions = async ({ organizationId, status } = {}) => {
  const deliveryOptions =
    await deliveryOptionsRepo.getDeliveryOptionsByOrganization(organizationId);

  if (status) {
    return deliveryOptions.filter((option) => option.status === status);
  }

  return deliveryOptions;
};

const getActiveDeliveryOptions = async (organizationId) => {
  return deliveryOptionsRepo.getActiveDeliveryOptionsByOrganization(organizationId);
};

const getDeliveryOptionDetails = async (id, organizationId) => {
  return deliveryOptionsRepo.findDeliveryOptionById(id, organizationId);
};

const updateDeliveryOption = async (id, organizationId, data) => {
  const deliveryOption = await deliveryOptionsRepo.findDeliveryOptionById(
    id,
    organizationId,
  );
  if (!deliveryOption) {
    return null;
  }

  const allowedFields = ["title", "deliveryMethod", "status"];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return deliveryOption;
  }

  Object.assign(deliveryOption, updateData);
  await deliveryOption.save();
  await deliveryOptionsRepo.invalidateOrganizationDeliveryOptionsCache(
    organizationId,
  );
  emitDeliveryOptionChange(deliveryOption, ["updated"]);
  return deliveryOption;
};

const deleteDeliveryOption = async (id, organizationId) => {
  const deliveryOption = await deliveryOptionsRepo.findDeliveryOptionById(
    id,
    organizationId,
  );
  if (!deliveryOption) return null;

  deliveryOption.status = "deleted";
  await deliveryOption.save();
  await deliveryOptionsRepo.invalidateOrganizationDeliveryOptionsCache(
    organizationId,
  );
  emitDeliveryOptionChange(deliveryOption, ["deleted"]);
  return true;
};

module.exports = {
  createDeliveryOption,
  getDeliveryOptions,
  getActiveDeliveryOptions,
  getDeliveryOptionDetails,
  updateDeliveryOption,
  deleteDeliveryOption,
};
