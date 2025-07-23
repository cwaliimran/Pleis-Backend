const express = require("express");
const {
  createSupplier,
  getSuppliers,
  updateSupplier,
  deleteSupplier,
  getPublicSuppliers,
} = require("./suppliersController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

//public routes
router.get("/public", getPublicSuppliers);

router.use(auth);

// Create a rate limiter for Suppliers
const apiRateLimiter = createRateLimiter("Suppliers");

// Create a new supplier
router.post("/", admin, createSupplier);

// Get all suppliers with pagination
router.get("/", apiRateLimiter, getSuppliers);

// Update an existing supplier
router.put("/:id", admin, updateSupplier);

// Delete a supplier
router.delete("/:id", admin, deleteSupplier);

module.exports = router;
