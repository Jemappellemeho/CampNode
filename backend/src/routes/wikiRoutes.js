const express = require("express");
const router = express.Router();
const wikiController = require("../controllers/wikiController");
const { verifyToken } = require("../middleware/authMiddleware");

// B8: require authentication so these endpoints are not an open Wikidata/Wikipedia proxy.
router.use(verifyToken);

// Search Wikidata entities by keyword (used in the course creation modal)
router.get("/search", wikiController.search);

// Fetch a sanitized Wikipedia article by Wikidata Q-number (e.g. "Q8777")
// :id must be a valid Wikidata entity ID, not a topic database ID
router.get("/article/:id", wikiController.article);

// Route for DBpedia subtopic suggestions
router.get("/suggestions/:id", wikiController.suggestions);


module.exports = router;