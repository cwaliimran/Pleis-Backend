# Deep links and QR codes: production setup

How to make Pleis links (table and venue QR codes, share and referral links,
"open in the app" from emails) open the user app on Android and iOS in
production, and what to change in the backend env and the app before release.

Spec: Requirement Set v13.8, #59, #82, #83, #84.

## How it works

Every public link is built by the backend from one base URL:

```
PLEIS_LINK_BASE_URL + path
  q/<token>                                   QR codes and share links
  api/v1/app/global-referral/share?id=…       global referral
  api/v1/app/loyalty-referral/share?…         loyalty referral
  api/v1/app/open?id=<confirmation>           "open in the app" in emails
```

The one place that builds them is `buildPleisLink()` in
`backend/config/CONSTANTS.js`. No other code reads the base URL.

When a guest scans a table code with the phone camera:

1. **Domain verified (normal production case):** the OS opens the app directly
   (Android App Links / iOS Universal Links). The app resolves the token at
   `GET /api/v1/app/qr-code/resolve/<token>`, checks the guest in at the venue,
   opens the menu and selects the table.
2. **Domain not verified, or another browser:** the link opens in the browser.
   - Android Chrome: the backend answers with a 302 to an app intent
     (`intent://q/<token>#Intent;scheme=com.pleis;package=com.Efuria.org;…`).
     The app opens, or the Play Store when it is not installed.
   - iPhone and in-app browsers (WhatsApp, Instagram, …): the backend sends the
     open page. It tries `com.pleis://q/<token>`, keeps an "open the app"
     button on screen, and on iPhone goes to the App Store after ~3 s when the
     app did not open.
3. **App not installed:** store. After installing, the guest scans again.
   There is no deferred deep link (#84).

No Firebase Dynamic Links or any other third-party service is used (Firebase
Dynamic Links was shut down in August 2025).

The backend serves the two verification files from the server root:

```
GET /.well-known/assetlinks.json                  Android
GET /.well-known/apple-app-site-association       iOS
```

They are built from the env values below (`backend/commonModules/qrCode/qrLinkRoutes.js`).

---

## Step 1. Choose the link domain (before printing any labels)

The domain is printed inside every QR code. Changing it later means reprinting
every table sticker. The database only stores the token, so links returned by
the API switch to a new domain automatically, but printed labels do not.

| Option | Link looks like | Work needed |
|---|---|---|
| A. Azure host (works today) | `https://pleis-bmgwc0exbmdzc8cn.germanywestcentral-01.azurewebsites.net/q/AbC234xyZ9` | None in the app: this host is already configured |
| B. Own domain (recommended) | `https://go.pleis.hr/q/AbC234xyZ9` | DNS + TLS, then the app changes in step 4 and a new app release |

For option B, in Azure App Service → Custom domains, add the domain (for
example `go.pleis.hr`), point DNS at the app (CNAME + TXT verification), and add
a certificate (App Service Managed Certificate is enough). The domain must
serve this backend at its root over HTTPS, with no redirect, so that
`https://go.pleis.hr/.well-known/assetlinks.json` returns the JSON directly.

## Step 2. Backend env (production)

Set these in `.env.prod`, or in Azure App Service → Configuration if the
deployment reads app settings there.

| Variable | Production value | Notes |
|---|---|---|
| `PLEIS_LINK_BASE_URL` | Option A: `https://pleis-bmgwc0exbmdzc8cn.germanywestcentral-01.azurewebsites.net/`<br>Option B: `https://go.pleis.hr/` | Server root, **not** `/api/v1/`. Trailing slash optional. Without it the code falls back to `API_BASE_URL` |
| `API_BASE_URL` | `https://pleis-bmgwc0exbmdzc8cn.germanywestcentral-01.azurewebsites.net/api/v1/` | Unchanged. Still used for server-to-server callbacks (Billko) |
| `PLEIS_APP_SCHEME` | `com.pleis` | Must match the app (see step 4) |
| `PLEIS_ANDROID_PACKAGE` | `com.Efuria.org` | Default in code; set only if the package changes |
| `PLEIS_ANDROID_SHA256_FINGERPRINTS` | **Replace**: SHA-256 of the app signing key, from Play Console | Comma separated, `AA:BB:…` format. Empty today, so Android cannot verify the domain. See step 3 |
| `PLEIS_IOS_APP_IDS` | `BUKST6P34T.com.Efuria.org` | `<Team ID>.<bundle id>`. Default in code; comma separated for several apps |
| `PLEIS_IOS_STORE_URL` | **Replace**: real App Store URL, e.g. `https://apps.apple.com/app/pleis/id<real id>` | Today it is the placeholder `id1234567890` |
| `PLEIS_ANDROID_STORE_URL` | **Replace**: `https://play.google.com/store/apps/details?id=com.Efuria.org` | Today it says `id=com.pleis`, which is not the app's package |
| `PLEIS_WEB` | `https://pleis.hr` | Only for the link on the "code not valid" page and the email fallback |

Other environments:

| Env | `PLEIS_LINK_BASE_URL` |
|---|---|
| Dev on Azure | `https://pleis-backend-dev-bgd6a6hxefgwbzg5.germanywestcentral-01.azurewebsites.net/` |
| Local testing | `http://<your LAN IP>:<PORT>/` (`.env.dev` / `.env.prodtest` point at the local machine) |

After changing env values, restart the app service. Check:

```bash
curl -s https://<link domain>/.well-known/assetlinks.json
curl -s https://<link domain>/.well-known/apple-app-site-association
```

`sha256_cert_fingerprints` must not be empty, and `appIDs` must show
`BUKST6P34T.com.Efuria.org`.

## Step 3. Android

### Signing fingerprint

Android verifies the domain by comparing the app's signing certificate with
`PLEIS_ANDROID_SHA256_FINGERPRINTS`.

1. Play Console → the app → **Test and release → App integrity → App signing**.
2. Copy **App signing key certificate → SHA-256 certificate fingerprint**.
   Builds installed from Google Play are signed with this key.
3. Optionally also copy the **Upload key certificate** SHA-256 (for builds
   installed outside Play, e.g. Firebase App Distribution).
4. Put them in `PLEIS_ANDROID_SHA256_FINGERPRINTS`, comma separated.

For local testing only, the React Native debug keystore
(`android/app/debug.keystore`) has the public SHA-256
`FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
`.env.dev` and `.env.prodtest` use it. Do not use it in `.env.prod`: every
React Native project ships the same debug key, so any app signed with it could
claim the Pleis links.

### Release keystore

`android/app/build.gradle` signs the `release` build with the debug keystore
(`signingConfig signingConfigs.debug`). Google Play does not accept that. Create
an upload keystore and a `release` signing config before publishing:
https://reactnative.dev/docs/signed-apk-android

### App config (already done for option A)

`android/app/src/main/AndroidManifest.xml`, the `autoVerify` intent filter:

```xml
<data android:scheme="https" />
<data android:host="pleis-bmgwc0exbmdzc8cn.germanywestcentral-01.azurewebsites.net" />
<data android:host="pleis-backend-dev-bgd6a6hxefgwbzg5.germanywestcentral-01.azurewebsites.net" />
<data android:pathPrefix="/q/" />
…
```

The `pleis` / `com.pleis` scheme filter below it is what the browser fallback
uses. Leave it in place.

## Step 4. App changes for your own domain (option B only)

In the Pleis-Mobile-Apps repo, add the domain in three places and release a new
app version:

| File | Change |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | Add `<data android:host="go.pleis.hr" />` to the `autoVerify` intent filter |
| `ios/Pleis/Pleis.entitlements` | Add `<string>applinks:go.pleis.hr</string>` to `com.apple.developer.associated-domains` |
| `src/utils/navigation/deepLinks.js` | Add `'https://go.pleis.hr/api/v1'` and `'https://go.pleis.hr'` to `DEEP_LINK_PREFIXES` (longer one first) |

Keep the Azure hosts in all three places so links shared before the switch
keep working.

The in-app table scanner on the ordering page reads `…/q/<token>` from any host
and needs no change.

## Step 5. iOS

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers →
   `com.Efuria.org` → enable **Associated Domains**. Regenerate the provisioning
   profiles (Xcode's automatic signing does this on the next archive).
2. `ios/Pleis/Pleis.entitlements` lists the domains (see step 4 for option B).
3. Already in place, no change needed:
   - `ios/Pleis/AppDelegate.swift` forwards both `open url` (app scheme) and
     `continue userActivity` (Universal Links) to `RCTLinkingManager`.
   - `ios/Pleis/Info.plist` registers the `pleis` and `com.pleis` schemes.
4. Deploy the backend **before** the app version ships. iOS downloads
   `apple-app-site-association` through Apple's CDN when the app is installed
   or updated, and the CDN can take up to a day to pick up changes. Check what
   Apple has cached:

   ```bash
   curl -s https://app-site-association.cdn-apple.com/a/v1/<link domain>
   ```

Universal Links need HTTPS and a public domain. They cannot be tested against
a local `http://` backend. To test against a dev domain without waiting for the
CDN, use `applinks:<domain>?mode=developer` in a development build and turn on
Settings → Developer → Associated Domains Development on the iPhone.

## Step 6. App release checklist

| Item | Where | Value for release |
|---|---|---|
| API host | `src/utils/network/request.js` | `HOST_API = HOST_API_PROD` (it is `HOST_API_LOCAL` during local testing) |
| App scheme | `Info.plist`, `AndroidManifest.xml` | `pleis`, `com.pleis` (match `PLEIS_APP_SCHEME`) |
| Link domains | manifest, entitlements, `deepLinks.js` | Step 4 |
| Android signing | `android/app/build.gradle` | Release keystore (step 3) |

## Step 7. Verify in production

Generate a table code in the admin panel (QR codes → table) and use its link.

**Android**

```bash
adb shell pm verify-app-links --re-verify com.Efuria.org
adb shell pm get-app-links com.Efuria.org      # the domain must say "verified"
```

Google's check of the hosted file:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<link domain>&relation=delegate_permission/common.handle_all_urls`

Then scan the printed code with the camera: the app opens on the menu with the
table selected.

**iOS**

Scan the code with the Camera app: the banner says "Open in PLEIS", and the app
opens on the menu with the table selected. Typing or pasting the link in Safari
does not trigger Universal Links. That is iOS behaviour, not a fault.

**Backend responses** (any machine):

```bash
# Android Chrome → 302 to intent://q/<token>#Intent;scheme=com.pleis;package=com.Efuria.org;…
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  -A "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" \
  https://<link domain>/q/<token>

# iPhone → 200, open page
curl -s -o /dev/null -w "%{http_code}\n" \
  -A "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" https://<link domain>/q/<token>

# Unknown or revoked code → 404 "not valid" page
curl -s -o /dev/null -w "%{http_code}\n" https://<link domain>/q/zzzzzzzzzz
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Android: the link opens Chrome first, then the app | Domain not verified | Fingerprint missing or wrong in `PLEIS_ANDROID_SHA256_FINGERPRINTS`, or `/.well-known/assetlinks.json` not reachable over HTTPS without redirect. Re-run `pm verify-app-links` |
| iPhone: the open page shows "Open in PLEIS?" instead of opening the app | Universal Link not active | Associated Domains capability or entitlement missing, AASA not on Apple's CDN yet, or the domain is not in `Pleis.entitlements` |
| App opens but stays on the home screen | Domain not in `DEEP_LINK_PREFIXES` | Step 4 |
| "This QR code is not valid" in the app | Token revoked, table deleted, or code of another environment | Generate a new code in that environment |
| Guest without the app lands on a "not found" store page | Store URLs are placeholders | `PLEIS_IOS_STORE_URL`, `PLEIS_ANDROID_STORE_URL` (step 2) |
| Links in API responses point at `/api/v1/q/…` or the wrong host | `PLEIS_LINK_BASE_URL` not set | Step 2; restart the service |
