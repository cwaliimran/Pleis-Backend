# Copilot Instructions for Pleis-Backend

## Project Overview
- This is a Node.js backend (Express) for a MERN stack application, organized for modularity and scalability.
- Major folders:
  - `backend/`: Main server logic, split into `admin/` and `app/` modules, each with submodules for business domains (e.g., `bookings`, `events`, `loyalty`).
  - `commonModules/`: Shared logic reused across admin/app modules (e.g., `bookings`, `menuManagement`).
  - `controllers/`: Top-level controllers for authentication, communication, notifications, etc.
  - `config/`: Configuration files for Firebase, i18n, caching, etc.
  - `assets/`: Static data (locales, countries, languages).
  - `helperUtils/`, `middlewares/`, `models/`: Utilities, Express middleware, and Mongoose models.

## Key Patterns & Conventions
- **Module Structure:** Each business domain (e.g., `bookings`, `events`) is a folder under both `backend/app/` and `backend/admin/`, and often has a corresponding folder in `commonModules/` for shared logic.
- **Alias Management:** Use scripts in `aliasConfig/` to update or manage path aliases. See `update-aliases.js` and `pathAliases.config.js`.
- **Environment Config:** Sensitive keys and Firebase credentials are managed in `config/` and `secretAssets/`. See setup steps in the `README.md`.
- **Localization:** Locales are stored in `assets/locales/`. Update these for i18n changes.
- **API Structure:** RESTful endpoints, with role-based authentication and rate limiting. See `controllers/` and `middlewares/` for patterns.

## Developer Workflows
- **Install:** `npm i`
- **Run server:** `node backend/server.js` (or use a process manager like `nodemon`)
- **Update aliases:** Run scripts in `aliasConfig/` if you change module paths.
- **Testing:** No standard test runner is present; manual testing via Postman (`postman_collection/`).
- **Debugging:** Use logging in controllers/utilities. No custom debug tooling is present.

## Integration Points
- **Firebase:** Update `config/firebaseAdmin.js` and place credentials in `secretAssets/serviceAccountKey.json`.
- **MongoDB:** Requires a running replica set for transactions.
- **External Auth:** Social logins (Google, Facebook, Apple) are supported via controller logic.

## Examples
- To add a new business domain, create folders in `backend/app/`, `backend/admin/`, and (if shared logic) in `commonModules/`.
- To add a new locale, update `assets/locales/` and ensure i18n config is updated.

## References
- See `README.md` for setup and environment details.
- See `aliasConfig/` for path aliasing scripts.
- See `postman_collection/` for API usage examples.

---

For questions about project-specific conventions, check for comments in `commonModules/` and `backend/` subfolders, or ask a maintainer.