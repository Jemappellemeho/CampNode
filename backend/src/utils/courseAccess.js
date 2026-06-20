// Shared authorization helpers for course-scoped access.
// Used to enforce "enrolled student OR course owner" on content/quiz/progress endpoints (B7),
// and to gate the full course detail view (B2).
const prisma = require("./prisma");

// Resolve the owning courseId for a topic. Subtopics inherit the courseId from their parent.
async function resolveTopicCourseId(topicId) {
  if (!topicId) return null;
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { courseId: true, parentTopic: { select: { courseId: true } } },
  });
  if (!topic) return null;
  return topic.courseId || topic.parentTopic?.courseId || null;
}

// Determine how a user relates to a course: owner (instructor) or enrolled student.
async function getCourseAccess(userId, courseId) {
  if (!userId || !courseId) {
    return { exists: false, isOwner: false, isEnrolled: false, allowed: false };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      instructorId: true,
      students: { where: { id: userId }, select: { id: true } },
    },
  });

  if (!course) {
    return { exists: false, isOwner: false, isEnrolled: false, allowed: false };
  }

  const isOwner = course.instructorId === userId;
  const isEnrolled = course.students.length > 0;
  return { exists: true, isOwner, isEnrolled, allowed: isOwner || isEnrolled };
}

// Express guard: returns true when access is granted, otherwise sends the response and returns false.
// Caller pattern:  if (!(await assertEnrolledOrOwner(req, res, courseId))) return;
async function assertEnrolledOrOwner(req, res, courseId) {
  const userId = req.user?.userId || req.user?.id;
  const access = await getCourseAccess(userId, courseId);

  if (!access.exists) {
    res.status(404).json({ error: "Course not found" });
    return false;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not enrolled in this course" });
    return false;
  }
  return true;
}

module.exports = { resolveTopicCourseId, getCourseAccess, assertEnrolledOrOwner };
