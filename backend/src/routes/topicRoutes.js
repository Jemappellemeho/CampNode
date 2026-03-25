const express = require("express");
const router = express.Router();
const topicController = require("../controllers/topicController");
const { verifyToken } = require("../middleware/authMiddleware");
const wikiController = require("../controllers/wikiController");
const multer = require("multer");


// Wir nutzen memoryStorage, damit wir die PDF direkt im RAM verarbeiten 
// und nicht erst auf der Festplatte speichern müssen.
const upload = multer({ storage: multer.memoryStorage() });



// Route 1: Neues Thema erstellen (POST /api/topics)
// Wir fügen upload.single("file") hinzu, um ein mögliches PDF zu empfangen
router.post("/", verifyToken, upload.single("file"), topicController.createTopic);

// Route 2: Alle Themen eines bestimmten Kurses abrufen (GET /api/topics/course/:courseId)
router.get("/course/:courseId", verifyToken, topicController.getTopicsByCourse);

// Route 3: Ein Thema bearbeiten (PUT /api/topics/:id)
router.put("/:id", verifyToken, topicController.updateTopic);

// Route 4: Ein Thema löschen (DELETE /api/topics/:id)
router.delete("/:id", verifyToken, topicController.deleteTopic);

// Route 5: Fetch the Wikipedia article for a topic (GET /api/topics/:id/content)
// Accepts optional ?lang=en or ?lang=de query parameter
router.get("/:id/content", verifyToken, topicController.getTopicContent);

// Route 6: AI-Enrichment (Zusammenfassung + Quiz generieren)
router.post("/:id/enrich", verifyToken, topicController.enrichTopic);

// Route 7: Quiz Management (Update & Delete)
router.put("/quizzes/:quizId", verifyToken, topicController.updateQuiz);
router.delete("/quizzes/:quizId", verifyToken, topicController.deleteQuiz);

module.exports = router;
