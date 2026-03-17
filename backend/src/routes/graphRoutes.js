const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const graphController = require("../controllers/graphController");

// GET graph for a course
router.get("/:courseId", verifyToken, graphController.getGraph);

module.exports = router;