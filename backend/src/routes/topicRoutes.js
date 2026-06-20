const express = require("express");
const router = express.Router();
const topicController = require("../controllers/topicController");
const { verifyToken } = require("../middleware/authMiddleware");
const wikiController = require("../controllers/wikiController");
const multer = require("multer");

// Use memoryStorage so we process PDFs directly in RAM
// without needing to save them to disk first.
const upload = multer({ storage: multer.memoryStorage() });

// Route: POST /api/topics
// Create a new topic. Expects "pdf" field for file uploads.
router.post("/", verifyToken, upload.single("pdf"), topicController.createTopic);

// Route: GET /api/topics/course/:courseId
// Fetch all topics that belong to a specific course
router.get("/course/:courseId", verifyToken, topicController.getTopicsByCourse);

// NEW ROUTE FOR THE "Q" BUTTON
// Route: GET /api/topics/quizzes/topic/:topicId
// Fetch or auto-generate a quiz for a specific topic (answers stripped for students)
router.get("/quizzes/topic/:topicId", verifyToken, topicController.getQuizByTopic);

// Route: POST /api/topics/quizzes/:quizId/grade
// Server-side grading of a single answer (B4). Keeps correct answers off the client.
router.post("/quizzes/:quizId/grade", verifyToken, topicController.gradeQuizQuestion);

// Route: PUT /api/topics/:id
// Update a topic, optionally attaching a new PDF file
router.put("/:id", verifyToken, upload.single("pdf"), topicController.updateTopic);

// Route: DELETE /api/topics/:id
// Delete a specific topic
router.delete("/:id", verifyToken, topicController.deleteTopic);

// Route: GET /api/topics/:id/content
// Fetch the Wikipedia article for a topic (Accepts optional ?lang=en or ?lang=de)
router.get("/:id/content", verifyToken, topicController.getTopicContent);

// Route: POST /api/topics/:id/enrich
// AI-Enrichment (Generate summary + quiz questions from topic content)
router.post("/:id/enrich", verifyToken, topicController.enrichTopic);

// Route: PUT /api/topics/quizzes/:quizId
// Update quiz questions
router.put("/quizzes/:quizId", verifyToken, topicController.updateQuiz);

// Route: DELETE /api/topics/quizzes/:quizId
// Delete a quiz
router.delete("/quizzes/:quizId", verifyToken, topicController.deleteQuiz);

module.exports = router;