/**
 * DB Bootstrap – versioned, safe, internal-only admin creation
 */

const mongoose = require("mongoose");
const { User } = require("@UserModel");
const AdminSettings = require("../../admin/settings/models/AdminSettings");
const { registerUserUtility } = require("../../controllers/authUtil");

const BOOTSTRAP_VERSION = 1;

/* ----------------------------------
   Bootstrap Marker
---------------------------------- */
const bootstrapSchema = new mongoose.Schema(
    { version: { type: Number, default: 1 } },
    { timestamps: true }
);

const Bootstrap =
    mongoose.models.SystemBootstrap ||
    mongoose.model("SystemBootstrap", bootstrapSchema);

/* ----------------------------------
   HELPERS
---------------------------------- */

async function createUserViaUtility(payload) {
    const fakeReq = {
        body: payload,
        header: (key) =>
            key === "x-admin-access-token"
                ? process.env.ADMIN_ACCESS_TOKEN
                : null,
    };

    const fakeRes = { status: () => fakeRes, json: () => { } };

    return registerUserUtility(fakeReq, fakeRes, {
        autoVerify: true,
        allowAdminCreation: true, // 🔒 INTERNAL ONLY
    });
}

/* ----------------------------------
   MAIN BOOTSTRAP
---------------------------------- */
async function runDBBootstrap() {
    try {
        // 🔒 VERSIONED ATOMIC LOCK
        const bootstrap = await Bootstrap.findOneAndUpdate(
            { version: { $lt: BOOTSTRAP_VERSION } },
            { $set: { version: BOOTSTRAP_VERSION } },
            { upsert: true, new: true }
        );

        if (!bootstrap) {
            console.log("ℹ️ Bootstrap already up-to-date");
            return;
        }

        /* -----------------------------
           Admin Settings
        ------------------------------ */
        const settingsExists = await AdminSettings.findOne();
        if (!settingsExists) {
            await AdminSettings.create({
                terms_and_conditions: "Your terms and conditions text here.",
                customer_terms_and_conditions: "Your customer terms and conditions text here.",
                about_us: "Information about us here.",
                privacy_policy: "Your privacy policy text here.",
            });
            console.log("✅ Admin settings created");
        }

        /* -----------------------------
           Guest User
        ------------------------------ */
        if (
            process.env.BOOTSTRAP_GUEST_EMAIL &&
            process.env.BOOTSTRAP_GUEST_PASSWORD
        ) {
            const guestExists = await User.findOne({
                email: process.env.BOOTSTRAP_GUEST_EMAIL.toLowerCase(),
                "accountState.userType": "guest",
            });

            if (!guestExists) {
                const res = await createUserViaUtility({
                    firstName: "Guest",
                    lastName: "User",
                    email: process.env.BOOTSTRAP_GUEST_EMAIL,
                    password: process.env.BOOTSTRAP_GUEST_PASSWORD,
                    userType: "guest",
                });

                res?.success
                console.log("✅ Guest user created")
            }
        }

        /* -----------------------------
           Admin User (CREATE or PROMOTE)
        ------------------------------ */
        if (
            process.env.BOOTSTRAP_ADMIN_EMAIL &&
            process.env.BOOTSTRAP_ADMIN_PASSWORD
        ) {
            const res = await createUserViaUtility({
                firstName: "Pleis",
                lastName: "Admin",
                email: process.env.BOOTSTRAP_ADMIN_EMAIL,
                password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
                userType: "admin",
                timezone: "Asia/Karachi",
                deviceType: "web",
                deviceId: "123",
            });

            if (res?.success)
                console.log("✅ Admin user created/promoted")
        }

    } catch (err) {
        console.error("❌ DB bootstrap failed", err);
        throw err;
    }
}

module.exports = runDBBootstrap;
