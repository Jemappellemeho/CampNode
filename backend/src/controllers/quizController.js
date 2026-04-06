const prisma = require("../utils/prisma");

// 1. Create a new Quiz (POST)
exports.createQuiz = async (req, res) => {
  try {
    const { topicId, questions } = req.body;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Access denied" });

    // The schema expects questions as a JSON array: [{question: "What is AI?", answers: ["A", "B"], correct: 0}]
    const quiz = await prisma.quiz.create({
      data: { topicId, questions }
    });

    res.status(201).json({ message: "Quiz created", quiz });
  } catch (error) {
    res.status(500).json({ error: "Failed to create quiz" });
  }
};

// 2. Fetch all Quizzes for a specific topic (GET)
exports.getQuizzesByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const quizzes = await prisma.quiz.findMany({ where: { topicId } });
    
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

// 3. Update an existing Quiz (PUT)
exports.updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { questions } = req.body;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Access denied" });

    const updatedQuiz = await prisma.quiz.update({
      where: { id },
      data: { questions }
    });

    res.json({ message: "Quiz updated", quiz: updatedQuiz });
  } catch (error) {
    res.status(500).json({ error: "Failed to update quiz" });
  }
};

// 4. Delete a Quiz (DELETE)
exports.deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Access denied" });

    await prisma.quiz.delete({ where: { id } });

    res.json({ message: "Quiz deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete quiz" });
  }
};
