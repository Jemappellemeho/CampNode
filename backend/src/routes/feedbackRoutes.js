const express = require("express");
const router = express.Router();
// Use the shared Prisma singleton (B6) to avoid exhausting the connection pool.
const prisma = require("../utils/prisma");
const { verifyToken } = require("../middleware/authMiddleware");

const getUserId = (req) => req.user.userId || req.user.id;

// B5: studentNote is now a real schema column, so we use normal Prisma calls instead of raw SQL.
const saveFeedbackToProgressNote = async ({ userId, topicId, content }) => {
  await prisma.progress.upsert({
    where: { userId_topicId: { userId, topicId } },
    update: { studentNote: content },
    create: { userId, topicId, completed: false, studentNote: content },
  });
};

const loadProgressNoteFeedback = async (courseId) => {
  // Match notes on topics of this course, including subtopics (courseId lives on the parent).
  const rows = await prisma.progress.findMany({
    where: {
      studentNote: { not: null },
      topic: {
        OR: [{ courseId }, { parentTopic: { courseId } }],
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { id: true, email: true } },
      topic: { select: { id: true, name: true, parentTopicId: true } },
    },
  });

  return rows
    .filter((row) => row.studentNote && row.studentNote.trim() !== "")
    .map((row) => ({
      id: `progress-note-${row.id}`,
      content: row.studentNote,
      createdAt: row.updatedAt,
      user: row.user,
      topic: row.topic,
      source: "progressNote",
    }));
};

router.post("/", verifyToken, async (req, res) => {
  try {
    const { courseId, topicId, content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Feedback is required" });
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: {
        id: true,
        courseId: true,
        parentTopic: { select: { courseId: true } },
      },
    });

    const topicCourseId = topic?.courseId || topic?.parentTopic?.courseId;

    if (!topic || topicCourseId !== courseId) {
      return res.status(400).json({ error: "Topic does not belong to this course" });
    }

    const userId = getUserId(req);

    try {
      const feedback = await prisma.feedback.create({
        data: {
          content: content.trim(),
          courseId,
          topicId,
          userId,
        },
        include: {
          user: { select: { id: true, email: true } },
          topic: { select: { id: true, name: true } },
        },
      });

      return res.status(201).json(feedback);
    } catch (feedbackError) {
      console.warn("Feedback table unavailable, saving to Progress.studentNote instead:", feedbackError.message);
      await saveFeedbackToProgressNote({ userId, topicId, content: content.trim() });

      const saved = await prisma.progress.findUnique({
        where: { userId_topicId: { userId, topicId } },
        include: {
          user: { select: { id: true, email: true } },
          topic: { select: { id: true, name: true } },
        },
      });

      return res.status(201).json({
        id: `progress-note-${saved.id}`,
        content: content.trim(),
        createdAt: saved.updatedAt,
        user: saved.user,
        topic: saved.topic,
        source: "progressNote",
      });
    }
  } catch (error) {
    console.error("Create feedback failed:", error);
    res.status(500).json({ error: "Could not save feedback" });
  }
});

router.get("/course/:courseId", verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = getUserId(req);

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });

    if (!course || course.instructorId !== userId) {
      return res.status(403).json({ error: "Only the professor can view course feedback" });
    }

    let feedback = [];

    try {
      feedback = await prisma.feedback.findMany({
        where: { courseId },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, email: true } },
          topic: { select: { id: true, name: true, parentTopicId: true } },
        },
      });
    } catch (feedbackError) {
      console.warn("Feedback table unavailable, reading Progress.studentNote instead:", feedbackError.message);
    }

    try {
      const progressNoteFeedback = await loadProgressNoteFeedback(courseId);
      feedback = [...feedback, ...progressNoteFeedback].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (progressNoteError) {
      console.warn("Could not read Progress.studentNote feedback:", progressNoteError.message);
    }

    res.json(feedback);
  } catch (error) {
    console.error("Fetch feedback failed:", error);
    res.status(500).json({ error: "Could not load feedback" });
  }
});

module.exports = router;
