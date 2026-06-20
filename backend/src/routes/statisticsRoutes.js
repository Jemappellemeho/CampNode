const express = require("express");
const router = express.Router();
const prisma = require("../utils/prisma");
const { verifyToken } = require("../middleware/authMiddleware");

const getUserId = (req) => req.user.userId || req.user.id;

// Local-day key (YYYY-MM-DD) used to bucket activity for focus time, streaks and daily engagement.
function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Short weekday label (Mon..Sun) for the daily-engagement chart.
function weekdayLabel(date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date).getDay()];
}

// B5: QuizResult is now a real Prisma model, so the raw CREATE TABLE / index bootstrap is gone.

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
    scores: [],
    questionTypes: {},
  };
}

function addResult(target, result, studentSet) {
  target.attempts += 1;
  target.averageScore += Number(result.score || 0);
  const pct = result.totalQuestions > 0 ? (Number(result.score || 0) / Number(result.totalQuestions)) * 100 : 0;
  target.averagePercent += pct;
  target.scores.push(pct);
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

    const normalizedStats = normalizeQuestionStats(questionStats);
    await prisma.quizResult.upsert({
      where: { userId_quizId: { userId, quizId } },
      update: {
        topicId,
        score: Number(score),
        totalQuestions: Number(totalQuestions),
        questionStats: normalizedStats,
      },
      create: {
        quizId,
        topicId,
        userId,
        score: Number(score),
        totalQuestions: Number(totalQuestions),
        questionStats: normalizedStats,
      },
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Save quiz result failed:", error);
    res.status(500).json({ error: "Could not save quiz result" });
  }
});

// One tracked chunk is capped at 1h so an idle/abusive client can't inflate the numbers.
const MAX_TRACK_SECONDS = 3600;

// POST /api/statistics/track — record real learning activity.
// Body: { courseId?, topicId?, seconds }. seconds=0 is a valid "online" ping (counts for
// daily engagement + streak, but adds no focus time). Used for time-on-task, daily engagement,
// student focus time and streak.
router.post("/track", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { courseId, topicId } = req.body;
    const seconds = Math.max(0, Math.min(Math.round(Number(req.body.seconds) || 0), MAX_TRACK_SECONDS));

    await prisma.activityLog.create({
      data: {
        userId,
        courseId: typeof courseId === "string" && courseId ? courseId : null,
        topicId: typeof topicId === "string" && topicId ? topicId : null,
        seconds,
      },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Track activity failed:", error);
    // Tracking must never break the learning flow — fail soft.
    res.status(200).json({ ok: false });
  }
});

// GET /api/statistics/me — the logged-in student's own focus time today + day streak.
router.get("/me", verifyToken, async (req, res) => {
  try {
    const userId = getUserId(req);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const logs = await prisma.activityLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { seconds: true, createdAt: true },
    });

    // Group seconds by local day key.
    const secondsByDay = {};
    for (const log of logs) {
      const key = dayKey(log.createdAt);
      secondsByDay[key] = (secondsByDay[key] || 0) + (log.seconds || 0);
    }

    const todayKey = dayKey(new Date());
    const todayMinutes = Math.round((secondsByDay[todayKey] || 0) / 60);

    // Streak = consecutive days with ANY activity (even a 0s ping), counting back from today/yesterday.
    const allDays = new Set(logs.map((l) => dayKey(l.createdAt)));
    let streak = 0;
    const cursor = new Date();
    if (!allDays.has(dayKey(cursor))) {
      // No activity today yet → start counting from yesterday so an existing streak isn't lost mid-day.
      cursor.setDate(cursor.getDate() - 1);
    }
    while (allDays.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    res.json({ todayMinutes, streak });
  } catch (error) {
    console.error("Fetch my stats failed:", error);
    res.status(500).json({ error: "Could not load your stats" });
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
            videoMinutes: true,
            articleMinutes: true,
            podcastMinutes: true,
            quizMinutes: true,
            quizzes: { select: { id: true } },
            subtopics: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                name: true,
                order: true,
                videoMinutes: true,
                articleMinutes: true,
                podcastMinutes: true,
                quizMinutes: true,
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

    // All quiz results for topics of this course, including subtopics (courseId lives on the parent).
    const rows = await prisma.quizResult.findMany({
      where: {
        topic: {
          OR: [{ courseId }, { parentTopic: { courseId } }],
        },
      },
      select: {
        quizId: true,
        topicId: true,
        userId: true,
        score: true,
        totalQuestions: true,
        questionStats: true,
      },
    });

    const resultsByTopic = rows.reduce((acc, row) => {
      const next = {
        ...row,
        questionStats: normalizeQuestionStats(row.questionStats),
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

    // ── Real learning-activity analytics (replaces the old Math.random() charts) ──
    const expectedMinutes = (t) =>
      (t.videoMinutes || 0) + (t.articleMinutes || 0) + (t.podcastMinutes || 0) + (t.quizMinutes || 0);

    // Map each root topic to the set of topic ids it covers (itself + its subtopics).
    const allTopicIds = [];
    const topicGroups = course.topics.map((topic) => {
      const ids = [topic.id, ...topic.subtopics.map((s) => s.id)];
      allTopicIds.push(...ids);
      return {
        id: topic.id,
        name: topic.name,
        ids,
        expected: expectedMinutes(topic) + topic.subtopics.reduce((sum, s) => sum + expectedMinutes(s), 0),
      };
    });

    // Pull this course's activity for the last 30 days (covers both charts).
    const activitySince = new Date();
    activitySince.setDate(activitySince.getDate() - 30);
    const activity = await prisma.activityLog.findMany({
      where: {
        createdAt: { gte: activitySince },
        OR: [{ courseId }, { topicId: { in: allTopicIds.length ? allTopicIds : ["__none__"] } }],
      },
      select: { userId: true, topicId: true, seconds: true, createdAt: true },
    });

    // Time-on-task per root topic: expected (resource estimate) vs actual (avg minutes per student).
    const timeOnTask = topicGroups.map((group) => {
      const idSet = new Set(group.ids);
      const rows = activity.filter((a) => a.topicId && idSet.has(a.topicId));
      const totalSeconds = rows.reduce((sum, a) => sum + (a.seconds || 0), 0);
      const students = new Set(rows.map((a) => a.userId));
      const actual = students.size > 0 ? Math.round(totalSeconds / 60 / students.size) : 0;
      return { id: group.id, name: group.name, expected: group.expected, actual };
    });

    // Daily engagement: distinct active students per day for the last 7 days.
    const dailyEngagement = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const usersThatDay = new Set(activity.filter((a) => dayKey(a.createdAt) === key).map((a) => a.userId));
      dailyEngagement.push({ day: weekdayLabel(d), date: key, activeStudents: usersThatDay.size });
    }

    res.json({ overallStats, topics, timeOnTask, dailyEngagement });
  } catch (error) {
    console.error("Fetch statistics failed:", error);
    res.status(500).json({ error: "Could not load statistics" });
  }
});

module.exports = router;
