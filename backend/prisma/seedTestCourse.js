// Seed for the drag-and-drop / prerequisite test course.
//
// Why a seed at all: the public create endpoints cannot produce this fixture.
// POST /api/topics (topicController.createTopic) ignores `order` and `parentTopicId`
// completely, and neither create endpoint can set prerequisite links. This script writes
// the rows through Prisma, so every topic gets an explicit parentTopicId, a clean
// order (0..n-1) and the prerequisite edges the test needs.
//
// Run:  npm run seed:test-course --prefix backend
//       node prisma/seedTestCourse.js --email=you@example.com   (owner for the course)
//
// Re-running replaces the course (same join code) instead of piling up duplicates.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/utils/prisma");

const COURSE_TITLE = "QA Lab: Prerequisites & Subtopic Moves";
const JOIN_CODE = "QATEST";
const FALLBACK_PROFESSOR = {
  email: "qa.professor@campnode.test",
  password: "TestCourse123!",
};

// 6 root topics, 9 subtopics each (54 subtopics) - enough to see renumbering and
// drag-and-drop across topics with a realistic list length.
const CURRICULUM = [
  {
    key: "T1",
    name: "Foundations of Programming",
    subtopics: [
      "Values and Types", "Variables and Assignment", "Conditionals", "Loops",
      "Functions", "Recursion Basics", "Error Handling", "Modules and Imports",
      "Debugging Workflow",
    ],
  },
  {
    key: "T2",
    name: "Data Structures",
    subtopics: [
      "Arrays", "Linked Lists", "Stacks", "Queues", "Hash Tables",
      "Trees", "Heaps", "Graphs", "Choosing a Structure",
    ],
  },
  {
    key: "T3",
    name: "Algorithms",
    subtopics: [
      "Complexity Notation", "Linear Search", "Binary Search", "Sorting by Comparison",
      "Divide and Conquer", "Greedy Methods", "Dynamic Programming", "Graph Traversal",
      "Shortest Paths",
    ],
  },
  {
    key: "T4",
    name: "Databases",
    subtopics: [
      "Relational Model", "Keys and Constraints", "SQL Basics", "Joins",
      "Normalization", "Indexes", "Transactions", "Isolation Levels",
      "Query Plans",
    ],
  },
  {
    key: "T5",
    name: "Machine Learning",
    subtopics: [
      "Supervised vs Unsupervised", "Feature Engineering", "Linear Regression",
      "Logistic Regression", "Decision Trees", "Overfitting and Regularization",
      "Cross Validation", "Clustering", "Model Metrics",
    ],
  },
  {
    key: "T6",
    name: "Deployment and MLOps",
    subtopics: [
      "Packaging a Model", "REST Interfaces", "Containers", "CI Pipelines",
      "Monitoring", "Data Drift", "Rollback Strategies", "Cost Control",
      "Incident Review",
    ],
  },
];

// Prerequisite edges, written as "dependent requires required".
// Positions follow the rule the app itself uses (F-06): a topic with order t sits at (t, 0),
// a subtopic with order s inside it at (t, s + 1). A prerequisite is a VIOLATION when the
// required item sits at a later position than the item that needs it - exactly what
// findViolations() / analyzeCoursePrerequisites() flag with the amber "!" badge.
const VALID_PREREQUISITES = [
  ["T2", "T1"],            // topic after topic
  ["T3", "T2"],
  ["T2.S1", "T1.S1"],      // subtopic depends on a subtopic of an earlier topic
  ["T2.S6", "T2.S2"],      // inside the same topic, pointing backwards
  ["T3.S1", "T2.S3"],
  ["T3.S9", "T3.S8"],
  ["T4.S4", "T4.S3"],
  ["T4.S6", "T2.S5"],
  ["T5.S1", "T3.S2"],
  ["T5.S6", "T5.S3"],
  ["T6.S1", "T5.S4"],
  ["T6.S5", "T6.S2"],
];

// Planted errors. Each one with expectFlag !== false must light up in the list view and
// in the professor graph; nothing else may.
const PLANTED_VIOLATIONS = [
  {
    edge: ["T1.S1", "T1.S5"],
    why: "same topic, prerequisite sits further down the list",
  },
  {
    edge: ["T2.S2", "T3.S1"],
    why: "prerequisite lives in a later topic",
  },
  {
    edge: ["T5.S3", "T6.S9"],
    why: "prerequisite is the very last subtopic of the course",
  },
  {
    edge: ["T3.S4", "T3.S6"],
    why: "mutual pair T3.S4 / T3.S6, backward half",
  },
];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// Pick the course owner: --email wins, then SEED_PROFESSOR_EMAIL, then any existing
// professor, and only as a last resort a dedicated test professor is created.
async function resolveProfessor(requestedEmail) {
  if (requestedEmail) {
    const user = await prisma.user.findUnique({ where: { email: requestedEmail } });
    if (!user) throw new Error(`No user with email ${requestedEmail}`);
    if (user.role !== "PROFESSOR") {
      throw new Error(`${requestedEmail} has role ${user.role}, needs PROFESSOR`);
    }
    return { professor: user, created: false };
  }

  const existing = await prisma.user.findFirst({
    where: { role: "PROFESSOR" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { professor: existing, created: false };

  const professor = await prisma.user.create({
    data: {
      email: FALLBACK_PROFESSOR.email,
      password: await bcrypt.hash(FALLBACK_PROFESSOR.password, 12),
      role: "PROFESSOR",
    },
  });
  return { professor, created: true };
}

// Remove an earlier run of this seed, including the rows that reference its topics.
async function removePreviousCourse() {
  const course = await prisma.course.findFirst({
    where: { OR: [{ joinCode: JOIN_CODE }, { title: COURSE_TITLE }] },
    select: { id: true },
  });
  if (!course) return false;

  const topics = await prisma.topic.findMany({
    where: { OR: [{ courseId: course.id }, { parentTopic: { courseId: course.id } }] },
    select: { id: true, parentTopicId: true },
  });
  const topicIds = topics.map((topic) => topic.id);
  const childIds = topics.filter((topic) => topic.parentTopicId).map((topic) => topic.id);
  const rootIds = topics.filter((topic) => !topic.parentTopicId).map((topic) => topic.id);

  // Prerequisite links live in an implicit join table and are removed together with the
  // topic rows, so only the explicit dependents need deleting first.
  await prisma.quizResult.deleteMany({ where: { topicId: { in: topicIds } } });
  await prisma.progress.deleteMany({ where: { topicId: { in: topicIds } } });
  await prisma.feedback.deleteMany({
    where: { OR: [{ courseId: course.id }, { topicId: { in: topicIds } }] },
  });
  await prisma.quiz.deleteMany({ where: { topicId: { in: topicIds } } });
  await prisma.topic.deleteMany({ where: { id: { in: childIds } } });
  await prisma.topic.deleteMany({ where: { id: { in: rootIds } } });
  await prisma.course.delete({ where: { id: course.id } });
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  const { professor, created } = await resolveProfessor(
    args.email || process.env.SEED_PROFESSOR_EMAIL
  );

  const replaced = await removePreviousCourse();

  const course = await prisma.course.create({
    data: {
      title: COURSE_TITLE,
      description:
        "Seeded fixture: 6 topics, 9 subtopics each, clean 0..n-1 ordering and planted " +
        "prerequisite errors. Used to test subtopic moves and the prerequisite warnings.",
      joinCode: JOIN_CODE,
      isPublic: false,
      instructorId: professor.id,
    },
  });

  // Topics first, with an explicit order. Subtopics carry courseId as well, matching what
  // POST /api/courses/:id/topics stores for them.
  const byKey = new Map();
  for (const [topicIndex, topic] of CURRICULUM.entries()) {
    const rootRow = await prisma.topic.create({
      data: {
        name: topic.name,
        description: `Seeded root topic ${topicIndex + 1}`,
        courseId: course.id,
        parentTopicId: null,
        order: topicIndex,
      },
    });
    byKey.set(topic.key, rootRow.id);

    for (const [subIndex, subName] of topic.subtopics.entries()) {
      const subRow = await prisma.topic.create({
        data: {
          name: subName,
          description: `Seeded subtopic ${subIndex + 1} of ${topic.name}`,
          courseId: course.id,
          parentTopicId: rootRow.id,
          order: subIndex,
        },
      });
      byKey.set(`${topic.key}.S${subIndex + 1}`, subRow.id);
    }
  }

  // Prerequisite links. `connect` adds to the list and never replaces it - unlike
  // PUT /api/topics/:id with prerequisiteIds, which overwrites the whole list.
  const edges = [
    ...VALID_PREREQUISITES,
    ...PLANTED_VIOLATIONS.map((violation) => violation.edge),
  ];
  for (const [dependentKey, requiredKey] of edges) {
    const dependentId = byKey.get(dependentKey);
    const requiredId = byKey.get(requiredKey);
    if (!dependentId || !requiredId) {
      throw new Error(`Unknown prerequisite key: ${dependentKey} -> ${requiredKey}`);
    }
    await prisma.topic.update({
      where: { id: dependentId },
      data: { prerequisites: { connect: { id: requiredId } } },
    });
  }

  const subtopicCount = CURRICULUM.reduce((sum, topic) => sum + topic.subtopics.length, 0);
  const expectedFlags = PLANTED_VIOLATIONS.filter((violation) => violation.expectFlag !== false);

  console.log("");
  console.log(`${replaced ? "Replaced" : "Created"} course: ${course.title}`);
  console.log(`  courseId   : ${course.id}`);
  console.log(`  joinCode   : ${course.joinCode}`);
  console.log(`  owner      : ${professor.email}${created ? " (created by this seed)" : ""}`);
  if (created) console.log(`  password   : ${FALLBACK_PROFESSOR.password}`);
  console.log(
    `  structure  : ${CURRICULUM.length} topics x ${subtopicCount / CURRICULUM.length} subtopics = ${subtopicCount} subtopics`
  );
  console.log(
    `  prereqs    : ${edges.length} edges (${VALID_PREREQUISITES.length} clean, ${PLANTED_VIOLATIONS.length} planted)`
  );
  console.log("");
  console.log(`Expected warnings in the UI: ${expectedFlags.length}`);
  for (const violation of expectedFlags) {
    console.log(`  ${violation.edge[0]} requires ${violation.edge[1]}  <- ${violation.why}`);
  }
  console.log("");
  console.log("Open the course as its professor, Nodes tab: every line above must show the");
  console.log('amber "!" badge, and no other item may show one.');
  console.log("");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
