const express = require("express");
const router = express.Router();
const progressController = require("../controllers/progressController");
const { verifyToken } = require("../middleware/authMiddleware");

// Route 1: Fortschritt speichern oder updaten (POST /api/progress)
router.post("/", verifyToken, progressController.upsertProgress);

// Route 2: Eigenen Fortschritt abrufen (GET /api/progress)
router.get("/", verifyToken, progressController.getUserProgress);

module.exports = router;
