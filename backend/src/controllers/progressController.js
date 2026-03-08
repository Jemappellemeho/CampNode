const prisma = require("../utils/prisma");

// 1. Fortschritt setzen/aktualisieren (Create / Update)
exports.upsertProgress = async (req, res) => {
  try {
    const { topicId, completed } = req.body;
    const userId = req.user.userId; // Wieder direkt aus dem JWT

    // Ein Upsert = "Mache ein Update, falls es schon existiert, ansonsten erstelle es neu"
    const progress = await prisma.progress.upsert({
      where: {
        // Prisma braucht hierfür eine eindeutige Zusammensetzung (siehe schema.prisma: @@unique([userId, topicId]))
        userId_topicId: {
          userId: userId,
          topicId: topicId,
        },
      },
      update: {
        completed: completed,
      },
      create: {
        userId: userId,
        topicId: topicId,
        completed: completed,
      },
    });

    res.status(200).json({ message: "Fortschritt gespeichert", progress });
  } catch (error) {
    console.error("Fehler beim Speichern des Fortschritts:", error);
    res.status(500).json({ error: "Fehler beim Speichern" });
  }
};

// 2. Fortschritt eines Studenten für einen bestimmten Kurs abfragen (Read)
exports.getUserProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Optional: Filtern nach Kurs, falls der Frontend einen Kurs anfragt
    
    const progressList = await prisma.progress.findMany({
      where: { userId },
      include: {
        topic: { select: { id: true, name: true, courseId: true } }
      }
    });

    res.json(progressList);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Abrufen des Fortschritts" });
  }
};
