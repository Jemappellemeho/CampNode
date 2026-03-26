const express = require("express");
const router = express.Router();
const wikiController = require("../controllers/wikiController");

// Search Wikidata entities by keyword — used in the course creation modal
router.get("/search", wikiController.search);

// Fetch a sanitized Wikipedia article by Wikidata Q-number (e.g. "Q8777")
// :id must be a valid Wikidata entity ID, not a topic database ID
router.get("/article/:id", wikiController.article);

module.exports = router;