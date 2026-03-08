const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const { verifyToken } = require("../middleware/authMiddleware");

// Route 1: Neues Quiz erstellen (POST /api/quizzes)
router.post("/", verifyToken, quizController.createQuiz);

// Route 2: Alle Quizzes zu einem bestimmten Thema abrufen (GET /api/quizzes/topic/:topicId)
router.get("/topic/:topicId", verifyToken, quizController.getQuizzesByTopic);

// Route 3: Ein Quiz bearbeiten (PUT /api/quizzes/:id)
router.put("/:id", verifyToken, quizController.updateQuiz);

// Route 4: Ein Quiz löschen (DELETE /api/quizzes/:id)
router.delete("/:id", verifyToken, quizController.deleteQuiz);

module.exports = router;
