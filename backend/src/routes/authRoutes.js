const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Wenn ein POST Request an /register kommt, führe authController.register aus
router.post("/register", authController.register);

module.exports = router;

