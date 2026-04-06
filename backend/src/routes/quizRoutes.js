const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const { verifyToken } = require("../middleware/authMiddleware");

// Route: POST /api/quizzes
// Create a new quiz
router.post("/", verifyToken, quizController.createQuiz);

// Route: GET /api/quizzes/topic/:topicId
// Fetch all quizzes related to a specific topic
router.get("/topic/:topicId", verifyToken, quizController.getQuizzesByTopic);

// Route: PUT /api/quizzes/:id
// Update an existing quiz
router.put("/:id", verifyToken, quizController.updateQuiz);

// Route: DELETE /api/quizzes/:id
// Delete a quiz
router.delete("/:id", verifyToken, quizController.deleteQuiz);

module.exports = router;
