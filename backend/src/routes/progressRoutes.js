const express = require("express");
const router = express.Router();
const progressController = require("../controllers/progressController");
const { verifyToken } = require("../middleware/authMiddleware");

// Route: POST /api/progress
// Create or update progress for a topic
router.post("/", verifyToken, progressController.upsertProgress);

// Route: GET /api/progress
// Fetch progress for the currently authenticated user
router.get("/", verifyToken, progressController.getUserProgress);

module.exports = router;
