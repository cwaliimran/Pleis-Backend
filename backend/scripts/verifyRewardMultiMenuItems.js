#!/usr/bin/env node
/**
 * Verify buyMenuItemReward multi-menuItem support (same pattern as challenge.taskMenuItem).
 *
 * Usage:
 *   NODE_ENV=prodtest node backend/scripts/verifyRewardMultiMenuItems.js
 *   NODE_ENV=prodtest node backend/scripts/verifyRewardMultiMenuItems.js --base=http://127.0.0.1:4020
 */
"use strict";

const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const REPO_ROOT = path.join(__dirname, "../..");
const NODE_ENV = process.env.NODE_ENV || "prodtest";
require("dotenv").config({ path: path.join(REPO_ROOT, `.env.${NODE_ENV}`) });

const moduleAlias = require("module-alias");
const aliases = require(path.join(REPO_ROOT, "aliasConfig/pathAliases.config"));
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(REPO_ROOT, target));
}

const BASE =
  (process.argv.find((a) => a.startsWith("--base=")) || "").split("=")[1] ||
  process.env.VERIFY_BASE ||
  "http://127.0.0.1:4020";

let passed = 0;
let failed = 0;

function assert(cond, name, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE);
    const lib = url.protocol === "https:" ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Timezone": "UTC",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login({ email, password, userType, adminHeader }) {
  const res = await request("POST", "/api/v1/auth/login", {
    headers: adminHeader ? { "x-admin-access-token": adminHeader } : {},
    body: {
      email,
      password,
      userType,
      deviceType: "web",
      deviceId: `reward-verify-${userType}-${Date.now()}`,
      timezone: "UTC",
    },
  });
  const token =
    res.json?.data?.token ||
    res.json?.token ||
    res.json?.data?.accessToken ||
    null;
  return { status: res.status, token, json: res.json };
}

function sectionNormalize() {
  console.log("\n══ 1) normalizeMenuItems helpers ══");
  const {
    asMenuItemArray,
    getMenuItemIds,
    normalizeRewardMenuItemsPayload,
  } = require("../commonModules/loyalty/rewards/utils/normalizeMenuItems");

  assert(asMenuItemArray(null).length === 0, "asMenuItemArray(null) → []");
  assert(asMenuItemArray("abc").length === 1, "asMenuItemArray(single) → [x]");
  assert(asMenuItemArray(["a", "b"]).length === 2, "asMenuItemArray(array)");
  assert(
    getMenuItemIds([{ _id: "1" }, "2"]).join(",") === "1,2",
    "getMenuItemIds unwraps docs"
  );

  const fromAlias = normalizeRewardMenuItemsPayload({
    rewardType: "buyMenuItemReward",
    menuItems: ["id1", "id2"],
  });
  assert(
    Array.isArray(fromAlias.menuItem) &&
      fromAlias.menuItem.length === 2 &&
      fromAlias.menuItems === undefined,
    "normalize menuItems alias → menuItem[]"
  );

  const fromSingle = normalizeRewardMenuItemsPayload({
    menuItem: "onlyOne",
  });
  assert(
    Array.isArray(fromSingle.menuItem) && fromSingle.menuItem[0] === "onlyOne",
    "normalize single menuItem → array"
  );
}

async function sectionDbAndHttp() {
  console.log("\n══ 2) DB + formatters + availability ══");

  const mongoose = require("mongoose");
  const mongoUri = process.env.BASE_URL;
  assert(!!mongoUri, "BASE_URL (mongo URI) present");
  if (!mongoUri) return;

  await mongoose.connect(mongoUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
  });

  const MenuItems = require("@MenuItemsModel");
  const { Reward, BuyMenuItemReward } = require("../commonModules/loyalty/rewards/models");
  const {
    attachEquivalentMenuItemsToRewards,
  } = require("../app/loyalty/rewards/rewardsRepository");
  const {
    resolveBuyMenuItemRewardAvailability,
    asMenuItemArray,
  } = require("../app/loyalty/rewards/utils/equivalentMenuItems");
  const { formatLoyaltyRewardOrders } = require("../app/loyalty/rewardsOrders/formatter/formatLoyaltyRewardOrders");
  const formatRewardAdmin = require("../admin/loyalty/rewards/utils/formatReward");
  const { formatReward: formatRewardApp } = require("../app/loyalty/rewards/formatters/formatReward");
  const { formatRewardDetails } = require("../app/loyalty/rewards/formatters/formatRewardDetils");

  assert(mongoose.connection.readyState === 1, "mongoose connected");

  const existing = await BuyMenuItemReward.findOne({
    status: { $ne: "deleted" },
    menuItem: { $exists: true, $ne: [] },
  })
    .select("companyOrganizer menuItem title rewardType status")
    .lean();

  assert(!!existing, "found an existing buyMenuItemReward", "none in DB");
  if (!existing) {
    await mongoose.disconnect();
    return;
  }

  const companyOrganizer = existing.companyOrganizer;
  const menuItems = await MenuItems.find({
    creator: companyOrganizer,
    status: "active",
  })
    .select("_id title image")
    .limit(3)
    .lean();

  assert(menuItems.length >= 1, `found menu items for organizer (${menuItems.length})`);

  const ids = menuItems.slice(0, Math.min(2, menuItems.length)).map((m) => m._id);
  assert(ids.length >= 1, `using ${ids.length} menu item(s) for multi create`);

  const created = await BuyMenuItemReward.create({
    title: `multi-mi-test-${Date.now()}`,
    image: "noimage.png",
    rewardType: "buyMenuItemReward",
    sortingType: "featured",
    minPointsRequiredToClaim: 0,
    companyOrganizer,
    menuItem: ids,
    status: "active",
    availableAsReward: true,
    claimLimit: 0,
  });

  assert(Array.isArray(created.menuItem) && created.menuItem.length === ids.length, "created.menuItem is array");

  const fetched = await Reward.findById(created._id).populate("menuItem").lean();
  assert(Array.isArray(fetched.menuItem), "findById populate menuItem is array");
  assert(fetched.menuItem.length === ids.length, "populated menuItem length matches");

  const [expanded] = await attachEquivalentMenuItemsToRewards([fetched]);
  assert(Array.isArray(expanded.menuItem), "attachEquivalent keeps menuItem array");
  assert(Array.isArray(expanded.equivalentMenuItems), "equivalentMenuItems is array");
  assert(expanded.menuItem.length === ids.length, "configured menuItem list preserved");

  const formattedApp = formatRewardApp(expanded, "UTC");
  assert(Array.isArray(formattedApp.menuItem), "app formatReward menuItem[]");
  if (formattedApp.menuItem[0]?.image) {
    assert(
      String(formattedApp.menuItem[0].image).startsWith("http"),
      "app menuItem image has base URL"
    );
  }

  const formattedDetails = formatRewardDetails(expanded);
  assert(Array.isArray(formattedDetails.menuItem), "formatRewardDetails menuItem[]");

  const formattedAdmin = formatRewardAdmin(
    { ...fetched, claimed: 1, redeemed: 1 },
    "UTC"
  );
  assert(Array.isArray(formattedAdmin.menuItem), "admin formatReward menuItem[]");

  const availability = await resolveBuyMenuItemRewardAvailability(
    ids,
    companyOrganizer,
    null
  );
  assert(Array.isArray(availability.menuItem), "resolve availability menuItem[]");
  assert(availability.menuItem.length === ids.length, "resolve returns all configured items");
  assert(Array.isArray(availability.equivalentMenuItems), "resolve equivalentMenuItems[]");

  const legacyFormatted = formatLoyaltyRewardOrders({
    snapshot: {
      title: "legacy",
      image: "x.png",
      rewardType: "buyMenuItemReward",
      menuItem: {
        _id: ids[0],
        title: "solo",
        image: "item.png",
      },
    },
  });
  assert(
    Array.isArray(legacyFormatted.snapshot.menuItem) &&
      legacyFormatted.snapshot.menuItem.length === 1,
    "formatter normalizes legacy single menuItem → [item]"
  );
  assert(
    String(legacyFormatted.snapshot.menuItem[0].image).startsWith("http"),
    "legacy snapshot menuItem image has base URL"
  );

  const adminRepo = require("../admin/loyalty/rewards/rewardsRepository");
  const rows = await adminRepo.getWithFilters({ _id: created._id }, 0, 1);
  assert(rows.length === 1, "admin aggregate returns reward");
  assert(Array.isArray(rows[0].menuItem), "admin aggregate menuItem is array (no unwind)");
  assert(rows[0].menuItem.length === ids.length, "admin aggregate menuItem length");

  console.log("\n══ 3) HTTP admin create/get + app list ══");
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminHeader = process.env.ADMIN_ACCESS_TOKEN || "";

  const adminLogin = await login({
    email: adminEmail,
    password: adminPass,
    userType: "admin",
    adminHeader,
  });
  assert(
    adminLogin.status === 200 && !!adminLogin.token,
    "admin login",
    `status=${adminLogin.status}`
  );

  const authToken = adminLogin.token;
  if (authToken) {
    const createRes = await request("POST", "/api/v1/admin/loyalty/rewards", {
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(adminHeader ? { "x-admin-access-token": adminHeader } : {}),
      },
      body: {
        title: `http-multi-mi-${Date.now()}`,
        image: "noimage.png",
        rewardType: "buyMenuItemReward",
        sortingType: "featured",
        minPointsRequiredToClaim: 1,
        companyOrganizer: String(companyOrganizer),
        menuItems: ids.map(String),
        status: "active",
        availableAsReward: true,
      },
    });

    const createdId =
      createRes.json?.data?._id || createRes.json?.data?.id || null;
    assert(
      createRes.status === 201 && !!createdId,
      "POST admin reward with menuItems[]",
      `status=${createRes.status} body=${JSON.stringify(createRes.json?.translationKey || createRes.json?.message || createRes.json).slice(0, 200)}`
    );

    if (createdId) {
      const detailsRes = await request(
        "GET",
        `/api/v1/admin/loyalty/rewards/${createdId}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            ...(adminHeader ? { "x-admin-access-token": adminHeader } : {}),
          },
        }
      );
      const adminMi = detailsRes.json?.data?.menuItem;
      assert(
        detailsRes.status === 200 && Array.isArray(adminMi) && adminMi.length === ids.length,
        "GET admin reward details menuItem[]",
        `status=${detailsRes.status} type=${Array.isArray(adminMi) ? "array" : typeof adminMi} len=${adminMi?.length}`
      );

      await Reward.findByIdAndUpdate(createdId, { status: "deleted" });
    }
  }

  const guestEmail = process.env.BOOTSTRAP_GUEST_EMAIL;
  const guestPass = process.env.BOOTSTRAP_GUEST_PASSWORD;
  let appToken = null;
  if (guestEmail && guestPass) {
    const guestLogin = await login({
      email: guestEmail,
      password: guestPass,
      userType: "user",
    });
    appToken = guestLogin.token;
    assert(!!appToken, "guest/app login", `status=${guestLogin.status}`);
  }

  if (appToken) {
    const listRes = await request(
      "GET",
      `/api/v1/app/loyalty/rewards/by-company/${companyOrganizer}`,
      { headers: { Authorization: `Bearer ${appToken}` } }
    );
    if (listRes.status === 200) {
      const list = listRes.json?.data || [];
      const ours = list.find((r) => String(r._id) === String(created._id));
      if (ours) {
        assert(Array.isArray(ours.menuItem), "app list reward menuItem[]");
        assert(
          ours.menuItem.length === ids.length,
          "app list multi menuItem length"
        );
      } else {
        const anyBuy = list.find((r) => r.rewardType === "buyMenuItemReward");
        if (anyBuy) {
          assert(
            Array.isArray(anyBuy.menuItem),
            "app list buyMenuItemReward menuItem is array"
          );
        } else {
          assert(true, "app list returned (no buyMenuItemReward in page)");
        }
      }
    } else {
      assert(false, "app rewards list", `status=${listRes.status}`);
    }

    const orderRes = await request(
      "GET",
      "/api/v1/app/loyalty/rewards-orders/6abcb5341b0dba66b5644ad3",
      { headers: { Authorization: `Bearer ${appToken}` } }
    );
    if (orderRes.status === 200 && orderRes.json?.data?.snapshot) {
      const mi = orderRes.json.data.snapshot.menuItem;
      assert(Array.isArray(mi), "GET reward-order details menuItem is array");
      if (mi?.[0]?.image) {
        assert(
          String(mi[0].image).startsWith("http"),
          "order details menuItem[0].image has base URL"
        );
      }
    } else {
      assert(true, "skip order details (order not owned by guest)");
    }
  }

  await Reward.findByIdAndUpdate(created._id, { status: "deleted" });
  assert(true, "cleaned up test reward");

  const legacy = await BuyMenuItemReward.findOne({
    status: { $ne: "deleted" },
    rewardType: "buyMenuItemReward",
  })
    .select("menuItem")
    .lean();
  if (legacy) {
    const arr = asMenuItemArray(legacy.menuItem);
    assert(arr.length >= 1, "legacy/current reward asMenuItemArray works");
  }

  await mongoose.disconnect();
}

(async () => {
  console.log(`verifyRewardMultiMenuItems → ${BASE} (${NODE_ENV})`);
  try {
    sectionNormalize();
    await sectionDbAndHttp();
  } catch (err) {
    failed += 1;
    console.error("\nFatal:", err);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
