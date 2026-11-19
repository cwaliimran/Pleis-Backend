const Organizations = require("@OrganizationModel");

const ORDERING_SETTINGS_CHANGED = "ORDERING_SETTINGS_CHANGED";

function toId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toHexString === "function") return value.toHexString();
  if (value._id) return toId(value._id);
  const asString = String(value);
  return asString && asString !== "[object Object]" ? asString : null;
}

/**
 * A venue's in-app ordering settings changed (payment methods, automatic
 * acceptance, delivery methods, tips, session timer). Sent on the same
 * per-venue `org:<id>` rooms as MENU_ITEM_CHANGED / DELIVERY_OPTION_CHANGED,
 * so a guest who is already on the menu / checkout / payment screen picks
 * the change up without reopening the venue.
 *
 * The payload only says *that* the settings changed (plus the session timer,
 * which pickup-options does not return); clients re-read
 * GET /app/menu/items/pickup-options/:organization, the same source the
 * order is checked against. Call it after the pickup-settings cache has been
 * invalidated, so that re-read gets the new values.
 *
 * Fire-and-forget: a socket problem never fails the settings save.
 */
async function emitOrderingSettingsChanged(organizationId, updateTypes = ["updated"]) {
  try {
    const io = global.io;
    const orgId = toId(organizationId);
    if (!io || !orgId) return;

    const org = await Organizations.findById(orgId)
      .select("inAppOrderingSettings.sessionTimerLength")
      .lean();

    const payload = {
      event: ORDERING_SETTINGS_CHANGED,
      organizationId: orgId,
      data: {
        sessionTimerLength: org?.inAppOrderingSettings?.sessionTimerLength ?? null,
      },
      updateTypes,
      timestamp: Date.now(),
    };

    io.of("/user/menu").to(`org:${orgId}`).emit(ORDERING_SETTINGS_CHANGED, payload);
    io.of("/staff/menu").to(`org:${orgId}`).emit(ORDERING_SETTINGS_CHANGED, payload);
    io.of("/admin/menu").to(`org:${orgId}`).emit(ORDERING_SETTINGS_CHANGED, payload);
    io.of("/organizer/menu").to(`org:${orgId}`).emit(ORDERING_SETTINGS_CHANGED, payload);
  } catch (err) {
    console.error("[ordering-settings] socket emit failed:", err.message);
  }
}

module.exports = { emitOrderingSettingsChanged, ORDERING_SETTINGS_CHANGED };
