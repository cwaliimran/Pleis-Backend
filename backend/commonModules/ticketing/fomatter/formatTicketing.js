const { convertUtcToTimezone } = require("@utils/responseUtil");
const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

function formatTicketing(timezone, item) {
    if (!item) return null;

    const obj = typeof item.toObject === "function" ? item.toObject() : item;

    // Format timingSlots (dateTimeSlots)
    if (obj.timingSlots && obj.timingSlots.dateTimeSlots && Array.isArray(obj.timingSlots.dateTimeSlots)) {
        obj.timingSlots.dateTimeSlots = obj.timingSlots.dateTimeSlots.map((dateBlock) => {
            const formattedDate = dateBlock.date
                ? convertUtcToTimezone(dateBlock.date, timezone, "YYYY-MM-DD")
                : "";

            const formattedTimeSlots = (dateBlock.timeSlots || []).map((slot) => ({
                ...slot,
                startTime: slot.startTime
                    ? convertUtcToTimezone(slot.startTime, timezone, "hh:mm A")
                    : "",
                endTime: slot.endTime
                    ? convertUtcToTimezone(slot.endTime, timezone, "hh:mm A")
                    : "",
            }));

            return {
                ...dateBlock,
                date: formattedDate,
                timeSlots: formattedTimeSlots,
            };
        });
    }

    // Format timeSensitivePricing dates
    if (obj.timeSensitivePricing) {
        const { earlyBird, lastMinute } = obj.timeSensitivePricing;

        if (earlyBird?.endDate) {
            earlyBird.endDate = convertUtcToTimezone(
                earlyBird.endDate,
                timezone,
                "YYYY-MM-DD"
            );
        }
        if (lastMinute?.startDate) {
            lastMinute.startDate = convertUtcToTimezone(
                lastMinute.startDate,
                timezone,
                "YYYY-MM-DD"
            );
        }

        obj.timeSensitivePricing = { earlyBird, lastMinute };
    }


    //format event
    if (obj.event && obj.event.basicInfo) {
        obj.event.basicInfo.media = getFullImageUrl(obj.event.basicInfo?.media.name);
    }

    if (obj.scheduledPublishAt) {
        obj.scheduledPublishAt = convertUtcToTimezone(
            obj.scheduledPublishAt,
            timezone,
            "YYYY-MM-DD hh:mm A"
        );
    } else {
        delete obj.scheduledPublishAt;
    }

    return obj;
}

module.exports = { formatTicketing };
