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
// Wir nutzen "pdf" als Key, passend zum Frontend
router.post("/", verifyToken, upload.single("pdf"), topicController.createTopic);

// Route 2: Alle Themen eines bestimmten Kurses abrufen (GET /api/topics/course/:courseId)
router.get("/course/:courseId", verifyToken, topicController.getTopicsByCourse);

// Route 3: Quiz Management (Update & Delete)
// WICHTIG: Diese Routen müssen VOR der generischen /:id-Route stehen!
// Sonst würde Express "quizzes" als topicId interpretieren und den falschen Handler aufrufen.
router.put("/quizzes/:quizId", verifyToken, topicController.updateQuiz);
router.delete("/quizzes/:quizId", verifyToken, topicController.deleteQuiz);

// Route 4: Ein Thema bearbeiten (PUT /api/topics/:id)
// Jetzt auch mit PDF-Upload Support beim Bearbeiten
router.put("/:id", verifyToken, upload.single("pdf"), topicController.updateTopic);

// Route 5: Ein Thema löschen (DELETE /api/topics/:id)
router.delete("/:id", verifyToken, topicController.deleteTopic);

// Route 6: Fetch the Wikipedia article for a topic (GET /api/topics/:id/content)
// Accepts optional ?lang=en or ?lang=de query parameter
router.get("/:id/content", verifyToken, topicController.getTopicContent);

// Route 7: AI-Enrichment (Zusammenfassung + Quiz generieren)
router.post("/:id/enrich", verifyToken, topicController.enrichTopic);

module.exports = router;
