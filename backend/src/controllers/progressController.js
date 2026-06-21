const prisma = require("../utils/prisma");
const { resolveTopicCourseId, getCourseAccess } = require("../utils/courseAccess");

// 1. Set or update progress (Create / Update)
exports.upsertProgress = async (req, res) => {
  try {
    const { topicId, completed } = req.body;
    const userId = req.user.userId; // Retrieved from the JWT token

    // B7: a user may only record progress on topics of a course they own or are enrolled in.
    const courseId = await resolveTopicCourseId(topicId);
    if (courseId) {
      const access = await getCourseAccess(userId, courseId);
      if (!access.allowed) {
        return res.status(403).json({ error: "You are not enrolled in this course" });
      }
    }

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

    // Topic was removed between client state and save attempt.
    if (error?.code === "P2003") {
      return res.status(200).json({
        message: "Progress skipped because the topic no longer exists",
        skipped: true,
      });
    }

    // Connection pool starvation: return a retryable response for transient overload.
    if (error?.code === "P2024") {
      return res.status(503).json({
        error: "Database is busy. Please retry in a moment.",
        code: "DB_POOL_TIMEOUT",
      });
    }

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
        topic: {
          select: {
            id: true,
            name: true,
            courseId: true,
            parentTopic: { select: { courseId: true } }
          }
        }
      }
    });

    res.json(progressList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch progress" });
  }
};
