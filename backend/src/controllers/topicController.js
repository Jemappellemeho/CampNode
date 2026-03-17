const prisma = require("../utils/prisma");

// 1. Thema erstellen (Create)
exports.createTopic = async (req, res) => {
  try {
    const { name, description, courseId } = req.body;

    // Nur Professoren dürfen Themen anlegen
    if (req.user.role !== "PROFESSOR") {
      return res.status(403).json({ error: "Nur Professoren dürfen Themen erstellen" });
    }

    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId // Verknüpft das Thema direkt mit einem Kurs
      }
    });

    res.status(201).json({ message: "Thema erfolgreich erstellt", topic });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Erstellen des Themas", details: error.message });
  }
};

// 2. Alle Themen eines bestimmten Kurses abrufen (Read)
exports.getTopicsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params; // Die Kurs-ID kommt aus der URL

    const topics = await prisma.topic.findMany({
      where: { courseId }
    });

    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen der Themen" });
  }
};

// 3. Thema bearbeiten (Update)
exports.updateTopic = async (req, res) => {
  try {
    const { id } = req.params; // Das ist die Topic-ID
    const { name, description } = req.body;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    const updatedTopic = await prisma.topic.update({
      where: { id },
      data: { name, description }
    });

    res.json({ message: "Thema aktualisiert", topic: updatedTopic });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Aktualisieren des Themas" });
  }
};

// 4. Thema löschen (Delete)
exports.deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "PROFESSOR") return res.status(403).json({ error: "Zugriff verweigert" });

    await prisma.topic.delete({ where: { id } });

    res.json({ message: "Thema erfolgreich gelöscht" });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Löschen des Themas" });
  }
};
