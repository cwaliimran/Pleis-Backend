const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

const formatImages = (data) => {
    if (data) {
        if (data.organization && data.organization.basicInfo) {
            const { media } = data.organization.basicInfo;
            if (media) {
                if (media.logo) media.logo = getFullImageUrl(media.logo);
                if (media.cover) media.cover = getFullImageUrl(media.cover);
            }
        }

        if (data.companyOrganizer && typeof data.companyOrganizer === "object" && !data.companyOrganizer._bsontype) {
            data.companyOrganizer.profileIcon = getFullImageUrl(data.companyOrganizer.profileIcon, "user");
        }

        if (data.user && typeof data.user === "object" && !data.user._bsontype) {
            data.user.profileIcon = getFullImageUrl(data.user.profileIcon, "user");
        }

        if (data.orderData && data.orderData.items) {
            for (let i = 0; i < data.orderData.items.length; i++) {
                const item = data.orderData.items[i];
                if (item.menuItemSnapShot) {
                    if (item.menuItemSnapShot.image) {
                        item.menuItemSnapShot.image = getFullImageUrl(item.menuItemSnapShot.image);
                    }
                    if (item.menuItemSnapShot.category && item.menuItemSnapShot.category.image) {
                        item.menuItemSnapShot.category.image = getFullImageUrl(item.menuItemSnapShot.category.image);
                    }
                }
            }
        }

        if (data.orderData && data.orderData.combos) {
            for (let i = 0; i < data.orderData.combos.length; i++) {
                const combo = data.orderData.combos[i];
                if (combo.comboSnapShot?.image) {
                    combo.comboSnapShot.image = getFullImageUrl(combo.comboSnapShot.image);
                }
                if (Array.isArray(combo.items)) {
                    for (const item of combo.items) {
                        if (item.menuItemSnapShot?.image) {
                            item.menuItemSnapShot.image = getFullImageUrl(
                                item.menuItemSnapShot.image,
                            );
                        }
                    }
                }
            }
        }

        if (data.orderData && data.orderData.ticket && data.orderData.ticket.ticketId) {
            const ticket = data.orderData.ticket.ticketId;
            if (ticket.snapshot && ticket.snapshot.image) {
                ticket.snapshot.image = getFullImageUrl(ticket.snapshot.image);
            }
        }
    }
    return data;
};
module.exports = {
    formatImages,
};
