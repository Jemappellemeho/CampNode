
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authMiddleware = require('../middleware/auth'); // your existing JWT middleware

// ─── Helper: build full include for a course ─────────────────────────────────
const COURSE_INCLUDE = {
  instructor: { select: { id: true, email: true } },
  students: { select: { id: true, email: true } },
  topics: {
    where: { parentTopicId: null }, // only top-level topics (hexagons)
    orderBy: { order: 'asc' },
    include: {
      subtopics: {
        orderBy: { order: 'asc' },
        include: {
          quizzes: { select: { id: true } },
          prerequisites: { select: { id: true, name: true } },
        },
      },
      quizzes: { select: { id: true } },
      prerequisites: { select: { id: true, name: true } },
    },
  },
};

// ─── GET /api/courses/me ──────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    let courses;
    if (user.role === 'PROFESSOR') {
      courses = await prisma.course.findMany({
        where: { instructorId: userId },
        include: {
          _count: { select: { students: true, topics: true } },
        },
      });
    } else {
      courses = await prisma.course.findMany({
        where: { students: { some: { id: userId } } },
        include: {
          _count: { select: { students: true, topics: true } },
        },
      });
    }
    res.json(courses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// ─── POST /api/courses/join ───────────────────────────────────────────────────
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { joinCode } = req.body;
    const course = await prisma.course.findUnique({ where: { joinCode } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    await prisma.course.update({
      where: { id: course.id },
      data: { students: { connect: { id: req.user.id } } },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Already enrolled or invalid code' });
  }
});

// ─── POST /api/courses  (create course) ──────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, isPublic } = req.body;
    const joinCode = `${title.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const course = await prisma.course.create({
      data: {
        title,
        description,
        joinCode,
        isPublic: isPublic || false,
        instructorId: req.user.id,
      },
    });
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// ─── GET /api/courses/:id  (FULL course data for playground + manager) ────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: COURSE_INCLUDE,
    });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    // Attach progress for student
    const userId = req.user.id;
    const progress = await prisma.progress.findMany({
      where: { userId },
      select: { topicId: true, completed: true },
    });
    const progressMap = Object.fromEntries(progress.map(p => [p.topicId, p.completed]));

    // Annotate each topic and subtopic with completion status
    const annotate = (topic) => ({
      ...topic,
      completed: progressMap[topic.id] ?? false,
      subtopics: (topic.subtopics || []).map(s => ({
        ...s,
        completed: progressMap[s.id] ?? false,
      })),
    });

    res.json({
      ...course,
      topics: course.topics.map(annotate),
      progressMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// ─── POST /api/courses/:courseId/topics  (add topic or subtopic) ──────────────
router.post('/:courseId/topics', authMiddleware, async (req, res) => {
  try {
    const { name, description, parentTopicId, order, aiSuggested } = req.body;
    const topic = await prisma.topic.create({
      data: {
        name,
        description,
        courseId: req.params.courseId,
        parentTopicId: parentTopicId || null,
        order: order || 0,
        aiSuggested: aiSuggested || false,
      },
    });
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

// ─── PUT /api/courses/:courseId/topics/:topicId  (update topic) ───────────────
router.put('/:courseId/topics/:topicId', authMiddleware, async (req, res) => {
  try {
    const { name, description, order, parentTopicId, videoUrl, articleUrl, podcastUrl, aiSuggested } = req.body;
    const topic = await prisma.topic.update({
      where: { id: req.params.topicId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
        ...(parentTopicId !== undefined && { parentTopicId }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(articleUrl !== undefined && { articleUrl }),
        ...(podcastUrl !== undefined && { podcastUrl }),
        ...(aiSuggested !== undefined && { aiSuggested }),
      },
    });
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update topic' });
  }
});

// ─── DELETE /api/courses/:courseId/topics/:topicId ────────────────────────────
router.delete('/:courseId/topics/:topicId', authMiddleware, async (req, res) => {
  try {
    await prisma.topic.delete({ where: { id: req.params.topicId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

// ─── POST /api/courses/:courseId/topics/:topicId/prereqs ──────────────────────
router.post('/:courseId/topics/:topicId/prereqs', authMiddleware, async (req, res) => {
  try {
    const { prereqId } = req.body;
    await prisma.topic.update({
      where: { id: req.params.topicId },
      data: { prerequisites: { connect: { id: prereqId } } },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add prerequisite' });
  }
});

// ─── DELETE /api/courses/:courseId/topics/:topicId/prereqs/:prereqId ──────────
router.delete('/:courseId/topics/:topicId/prereqs/:prereqId', authMiddleware, async (req, res) => {
  try {
    await prisma.topic.update({
      where: { id: req.params.topicId },
      data: { prerequisites: { disconnect: { id: req.params.prereqId } } },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove prerequisite' });
  }
});

// ─── PATCH /api/courses/:courseId/progress/:topicId ───────────────────────────
router.patch('/:courseId/progress/:topicId', authMiddleware, async (req, res) => {
  try {
    const { completed } = req.body;
    const progress = await prisma.progress.upsert({
      where: { userId_topicId: { userId: req.user.id, topicId: req.params.topicId } },
      update: { completed },
      create: { userId: req.user.id, topicId: req.params.topicId, completed },
    });
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

module.exports = router;
