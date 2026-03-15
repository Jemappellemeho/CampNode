const express = require("express");
const router = express.Router();

const wikiController = require("../controllers/wikiController");

router.get("/search", wikiController.search);
router.get("/article/:id", wikiController.article);

module.exports = router;