const prisma = require("../utils/prisma");

// 1. Set or update progress (Create / Update)
exports.upsertProgress = async (req, res) => {
  try {
    const { topicId, completed } = req.body;
    const userId = req.user.userId; // Retrieved from the JWT token

    // Upsert operation: "Update if it exists, otherwise create it"
    const progress = await prisma.progress.upsert({
      where: {
        // Prisma requires a unique identifier for this (see schema.prisma: @@unique([userId, topicId]))
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

    res.status(200).json({ message: "Progress saved", progress });
  } catch (error) {
    console.error("Error saving progress:", error);
    res.status(500).json({ error: "Failed to save progress" });
  }
};

// 2. Fetch a student's progress
exports.getUserProgress = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Optional: Filter by course if the frontend specifies a courseId
    
    const progressList = await prisma.progress.findMany({
      where: { userId },
      include: {
        topic: { select: { id: true, name: true, courseId: true } }
      }
    });

    res.json(progressList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch progress" });
  }
};
