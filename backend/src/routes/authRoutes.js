const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Route: POST /api/auth/register
// Handle user registration
router.post("/register", authController.register);

// Route: POST /api/auth/login
// Handle user login and JWT generation
router.post("/login", authController.login);

module.exports = router;

