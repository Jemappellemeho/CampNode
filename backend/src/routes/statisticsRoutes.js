const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const prisma = require("../utils/prisma");
const { verifyToken } = require("../middleware/authMiddleware");

const getUserId = (req) => req.user.userId || req.user.id;

async function ensureQuizResultTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "QuizResult" (
      "id" TEXT NOT NULL,
      "quizId" TEXT NOT NULL,
      "topicId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "score" NUMERIC(10,2) NOT NULL,
      "totalQuestions" INTEGER NOT NULL,
      "questionStats" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
    )
  `;

  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "QuizResult_userId_quizId_key"
    ON "QuizResult" ("userId", "quizId")
  `;
}

function normalizeQuestionStats(questionStats) {
  return Array.isArray(questionStats)
    ? questionStats
        .filter((item) => item && typeof item.type === "string")
        .map((item) => ({
          type: item.type,
          correct: Boolean(item.correct),
          pointsEarned: Number.isFinite(Number(item.pointsEarned)) ? Number(item.pointsEarned) : 0,
        }))
    : [];
}

function emptyStats() {
  return {
    attempts: 0,
    students: 0,
    averageScore: 0,
    averagePercent: 0,
    questionTypes: {},
  };
}

function addResult(target, result, studentSet) {
  target.attempts += 1;
  target.averageScore += Number(result.score || 0);
  target.averagePercent += result.totalQuestions > 0
    ? (Number(result.score || 0) / Number(result.totalQuestions)) * 100
    : 0;
  studentSet.add(result.userId);

  const stats = Array.isArray(result.questionStats) ? result.questionStats : [];
  stats.forEach((item) => {
    const type = item.type || "unknown";
    if (!target.questionTypes[type]) {
      target.questionTypes[type] = { total: 0, correct: 0 };
    }
    target.questionTypes[type].total += 1;
    if (item.correct) target.questionTypes[type].correct += 1;
  });
}

function finishStats(target, studentSet) {
  target.students = studentSet.size;
  if (target.attempts > 0) {
    target.averageScore = Math.round((target.averageScore / target.attempts) * 10) / 10;
    target.averagePercent = Math.round(target.averagePercent / target.attempts);
  }
}

router.post("/quiz-result", verifyToken, async (req, res) => {
  try {
    const { quizId, topicId, score, totalQuestions, questionStats } = req.body;
    const userId = getUserId(req);

    if (!quizId || !topicId || !Number.isFinite(Number(score)) || !Number.isFinite(Number(totalQuestions))) {
      return res.status(400).json({ error: "Invalid quiz result payload" });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, topicId: true },
    });

    if (!quiz || quiz.topicId !== topicId) {
      return res.status(400).json({ error: "Quiz does not match topic" });
    }

    await ensureQuizResultTable();

    const normalizedStats = normalizeQuestionStats(questionStats);
    await prisma.$executeRaw`
      INSERT INTO "QuizResult" (
        "id", "quizId", "topicId", "userId", "score", "totalQuestions", "questionStats", "createdAt", "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${quizId},
        ${topicId},
        ${userId},
        ${Number(score)},
        ${Number(totalQuestions)},
        ${JSON.stringify(normalizedStats)}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("userId", "quizId")
      DO UPDATE SET
        "score" = EXCLUDED."score",
        "totalQuestions" = EXCLUDED."totalQuestions",
        "questionStats" = EXCLUDED."questionStats",
        "updatedAt" = NOW()
    `;

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Save quiz result failed:", error);
    res.status(500).json({ error: "Could not save quiz result" });
  }
});

router.get("/course/:courseId", verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = getUserId(req);

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        instructorId: true,
        topics: {
          where: { parentTopicId: null },
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            quizzes: { select: { id: true } },
            subtopics: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                name: true,
                order: true,
                quizzes: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!course || course.instructorId !== userId) {
      return res.status(403).json({ error: "Only the professor can view course statistics" });
    }

    await ensureQuizResultTable();

    const rows = await prisma.$queryRaw`
      SELECT
        qr."quizId",
        qr."topicId",
        qr."userId",
        qr."score",
        qr."totalQuestions",
        qr."questionStats",
        t."parentTopicId"
      FROM "QuizResult" qr
      INNER JOIN "Topic" t ON t."id" = qr."topicId"
      LEFT JOIN "Topic" parent ON parent."id" = t."parentTopicId"
      WHERE COALESCE(t."courseId", parent."courseId") = ${courseId}
    `;

    const resultsByTopic = rows.reduce((acc, row) => {
      const stats = typeof row.questionStats === "string" ? JSON.parse(row.questionStats) : row.questionStats;
      const next = {
        ...row,
        questionStats: normalizeQuestionStats(stats),
      };
      if (!acc[next.topicId]) acc[next.topicId] = [];
      acc[next.topicId].push(next);
      return acc;
    }, {});

    const topics = course.topics.map((topic) => {
      const ownStats = emptyStats();
      const ownStudents = new Set();
      (resultsByTopic[topic.id] || []).forEach((result) => addResult(ownStats, result, ownStudents));
      finishStats(ownStats, ownStudents);

      const subtopics = topic.subtopics.map((subtopic) => {
        const subStats = emptyStats();
        const subStudents = new Set();
        (resultsByTopic[subtopic.id] || []).forEach((result) => addResult(subStats, result, subStudents));
        finishStats(subStats, subStudents);
        return {
          id: subtopic.id,
          name: subtopic.name,
          quizCount: subtopic.quizzes.length,
          stats: subStats,
        };
      });

      const combinedStats = emptyStats();
      const combinedStudents = new Set();
      (resultsByTopic[topic.id] || []).forEach((result) => addResult(combinedStats, result, combinedStudents));
      subtopics.forEach((subtopic) => {
        (resultsByTopic[subtopic.id] || []).forEach((result) => addResult(combinedStats, result, combinedStudents));
      });
      finishStats(combinedStats, combinedStudents);

      return {
        id: topic.id,
        name: topic.name,
        quizCount: topic.quizzes.length,
        ownStats,
        combinedStats,
        subtopics,
      };
    });

    const overallStats = emptyStats();
    const overallStudents = new Set();
    Object.values(resultsByTopic).flat().forEach((result) => addResult(overallStats, result, overallStudents));
    finishStats(overallStats, overallStudents);

    res.json({ overallStats, topics });
  } catch (error) {
    console.error("Fetch statistics failed:", error);
    res.status(500).json({ error: "Could not load statistics" });
  }
});

module.exports = router;
