const TIP_TYPES = ["fixed", "percentage"];

const validateInAppOrderingSettingsV2 = (inAppOrderingSettings = {}) => {
  const { tips, sessionTimerLength } = inAppOrderingSettings;

  if (sessionTimerLength !== undefined) {
    if (typeof sessionTimerLength !== "number" || sessionTimerLength < 0) {
      return "invalid_session_timer_length";
    }
  }

  if (tips === undefined) return null;

  if (tips.tipPresets !== undefined) {
    if (!Array.isArray(tips.tipPresets)) {
      return "tip_presets_must_be_an_array";
    }

    for (const preset of tips.tipPresets) {
      if (!TIP_TYPES.includes(preset?.tipType)) {
        return "invalid_tip_type";
      }
      if (typeof preset?.value !== "number" || preset.value < 0) {
        return "invalid_tip_value";
      }
    }
  }

  return null;
};

const mergeTips = (incomingTips = {}, existingTips = {}) => ({
  enableCustomerTipping:
    incomingTips.enableCustomerTipping ??
    existingTips.enableCustomerTipping ??
    false,
  tipPresets: Array.isArray(incomingTips.tipPresets)
    ? incomingTips.tipPresets
    : existingTips.tipPresets ?? [],
  allowCustomTips:
    incomingTips.allowCustomTips ?? existingTips.allowCustomTips ?? false,
});

const applyInAppOrderingSettingsV2 = (organization, inAppOrderingSettings = {}) => {
  const { tips, sessionTimerLength } = inAppOrderingSettings;
  const existing =
    organization.inAppOrderingSettings?.toObject?.() ||
    organization.inAppOrderingSettings ||
    {};

  const next = { ...existing };

  if (tips !== undefined) {
    next.tips = mergeTips(tips, existing.tips || {});
  }

  if (sessionTimerLength !== undefined) {
    next.sessionTimerLength = sessionTimerLength;
  }

  organization.inAppOrderingSettings = next;
  organization.markModified("inAppOrderingSettings");
  return organization;
};

module.exports = {
  validateInAppOrderingSettingsV2,
  applyInAppOrderingSettingsV2,
};
