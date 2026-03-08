const prisma = require("../utils/prisma");

// 1. Quiz erstellen (POST)
exports.createQuiz = async (req, res) => {
  try {
    const { topicId, questions } = req.body;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    // Unser Schema speichert Fragen als JSON-Array: [{frage: "Was ist KI?", antworten: ["A", "B"], korrekt: 0}]
    const quiz = await prisma.quiz.create({
      data: { topicId, questions }
    });

    res.status(201).json({ message: "Quiz erstellt", quiz });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Erstellen des Quizzes" });
  }
};

// 2. Quizzes zu einem Thema abrufen (GET)
exports.getQuizzesByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const quizzes = await prisma.quiz.findMany({ where: { topicId } });
    
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen" });
  }
};

// 3. Quiz aktualisieren (PUT)
exports.updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { questions } = req.body;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    const updatedQuiz = await prisma.quiz.update({
      where: { id },
      data: { questions }
    });

    res.json({ message: "Quiz aktualisiert", quiz: updatedQuiz });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Aktualisieren" });
  }
};

// 4. Quiz löschen (DELETE)
exports.deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    await prisma.quiz.delete({ where: { id } });

    res.json({ message: "Quiz gelöscht" });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Löschen" });
  }
};
