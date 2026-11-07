// Checks the atomic subtopic move against the real database.
//
// Covers:
//   - no unique index on (parentTopicId, order) that could clash mid-renumber
//   - order numbers stay 0..n-1 in BOTH lists after every move
//   - prerequisite links survive a move untouched (they are keyed by id)
//   - every validation rule rejects, and rejects without writing anything
//   - a failure in the middle of the renumbering rolls the whole move back
//   - moving a subtopic out and back restores the exact starting structure
//
// Needs the seeded fixture:
//   npm run seed:test-course --prefix backend
//   npm run check:subtopic-move --prefix backend
require("dotenv").config();
const prisma = require("../src/utils/prisma");
const { moveSubtopic, TopicMoveError } = require("../src/services/topicOrderService");

const JOIN_CODE = "QATEST";

// Failure injection for the rollback test: when armed, the Nth Topic.update inside the
// move throws, which must leave the database exactly as it was.
const probe = { armed: false, failAfter: 2, seen: 0 };
prisma.$use(async (params, next) => {
  if (probe.armed && params.model === "Topic" && params.action === "update") {
    probe.seen += 1;
    if (probe.seen > probe.failAfter) {
      throw new Error("injected failure in the middle of the renumbering");
    }
  }
  return next(params);
});

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
}

// --- structure helpers -----------------------------------------------------

async function loadCourse(courseId) {
  const topics = await prisma.topic.findMany({
    where: { courseId, parentTopicId: null },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      order: true,
      subtopics: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, name: true, order: true, parentTopicId: true },
      },
    },
  });
  return topics;
}

// Canonical fingerprint of structure + prerequisite edges, used to prove that a rejected
// move wrote nothing and that move-and-move-back is a round trip.
async function snapshot(courseId) {
  const topics = await loadCourse(courseId);
  const edges = [];
  const items = await prisma.topic.findMany({
    where: { OR: [{ courseId }, { parentTopic: { courseId } }] },
    orderBy: { id: "asc" },
    select: { id: true, prerequisites: { orderBy: { id: "asc" }, select: { id: true } } },
  });
  for (const item of items) {
    for (const prerequisite of item.prerequisites) edges.push(`${item.id}->${prerequisite.id}`);
  }
  return JSON.stringify({
    topics: topics.map((topic) => ({
      id: topic.id,
      order: topic.order,
      subtopics: topic.subtopics.map((sub) => ({ id: sub.id, order: sub.order })),
    })),
    edges: edges.sort(),
  });
}

// "clean" means exactly 0..n-1, no gaps and no duplicates.
function describeOrders(subtopics) {
  return subtopics.map((sub) => sub.order).join(",");
}

function ordersAreClean(subtopics) {
  return subtopics.every((sub, index) => sub.order === index);
}

async function prerequisiteFingerprint(topicId) {
  const row = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      prerequisites: { orderBy: { id: "asc" }, select: { id: true } },
      requiredBy: { orderBy: { id: "asc" }, select: { id: true } },
    },
  });
  return JSON.stringify({
    requires: row.prerequisites.map((item) => item.id),
    requiredBy: row.requiredBy.map((item) => item.id),
  });
}

async function expectRejected(label, payload, expectedStatus, courseId) {
  const before = await snapshot(courseId);
  let error = null;
  try {
    await moveSubtopic(payload);
  } catch (caught) {
    error = caught;
  }
  const after = await snapshot(courseId);

  if (!error) {
    check(label, false, "the move was accepted");
    return;
  }
  const isValidation = error instanceof TopicMoveError && error.status === expectedStatus;
  check(
    `${label} -> ${expectedStatus}`,
    isValidation,
    isValidation ? "" : `${error.name} ${error.status || ""} ${error.message}`
  );
  check(`${label} wrote nothing`, before === after);
}

// --- main ------------------------------------------------------------------

async function main() {
  const course = await prisma.course.findFirst({
    where: { joinCode: JOIN_CODE },
    select: { id: true, title: true },
  });
  if (!course) {
    throw new Error(
      `No course with join code ${JOIN_CODE}. Run: npm run seed:test-course --prefix backend`
    );
  }
  console.log(`\nCourse under test: ${course.title} (${course.id})\n`);

  // 1. The constraint question from the review ---------------------------------
  console.log("1) schema guarantees");
  const indexes = await prisma.$queryRawUnsafe(
    `select indexdef from pg_indexes where tablename = 'Topic'`
  );
  const orderIndex = indexes.filter(
    (row) => /unique/i.test(row.indexdef) && /parentTopicId/.test(row.indexdef) && /order/.test(row.indexdef)
  );
  check(
    "no unique index on (parentTopicId, order) - direct renumbering cannot clash",
    orderIndex.length === 0,
    orderIndex.map((row) => row.indexdef).join(" | ")
  );

  const startSnapshot = await snapshot(course.id);
  const startTopics = await loadCourse(course.id);
  check("fixture has at least 3 root topics", startTopics.length >= 3, `${startTopics.length}`);
  check(
    "fixture has at least 8 subtopics per topic",
    startTopics.every((topic) => topic.subtopics.length >= 8),
    startTopics.map((topic) => topic.subtopics.length).join(",")
  );
  check(
    "fixture starts with clean orders everywhere",
    startTopics.every((topic, index) => topic.order === index && ordersAreClean(topic.subtopics))
  );

  const sourceTopic = startTopics[0];
  const targetTopic = startTopics[2];
  const moved = sourceTopic.subtopics[1];
  const sourceCount = sourceTopic.subtopics.length;
  const targetCount = targetTopic.subtopics.length;
  const prereqBefore = await prerequisiteFingerprint(moved.id);
  const totalBefore = await prisma.topic.count({
    where: { OR: [{ courseId: course.id }, { parentTopic: { courseId: course.id } }] },
  });

  // 2. Cross-topic move --------------------------------------------------------
  console.log(`\n2) cross-topic move: "${moved.name}" -> "${targetTopic.name}" at index 4`);
  const result = await moveSubtopic({
    courseId: course.id,
    subtopicId: moved.id,
    targetParentId: targetTopic.id,
    targetIndex: 4,
  });

  let topics = await loadCourse(course.id);
  let sourceAfter = topics.find((topic) => topic.id === sourceTopic.id);
  let targetAfter = topics.find((topic) => topic.id === targetTopic.id);

  check("source list renumbered 0..n-1", ordersAreClean(sourceAfter.subtopics), describeOrders(sourceAfter.subtopics));
  check("target list renumbered 0..n-1", ordersAreClean(targetAfter.subtopics), describeOrders(targetAfter.subtopics));
  check("source lost exactly one subtopic", sourceAfter.subtopics.length === sourceCount - 1);
  check("target gained exactly one subtopic", targetAfter.subtopics.length === targetCount + 1);
  check("subtopic landed at the requested index", targetAfter.subtopics[4].id === moved.id);
  check("subtopic is gone from the old parent", !sourceAfter.subtopics.some((sub) => sub.id === moved.id));
  check("new parentTopicId is stored", targetAfter.subtopics[4].parentTopicId === targetTopic.id);
  check(
    "nothing was created or deleted",
    (await prisma.topic.count({
      where: { OR: [{ courseId: course.id }, { parentTopic: { courseId: course.id } }] },
    })) === totalBefore
  );
  check("prerequisites of the moved subtopic are untouched", (await prerequisiteFingerprint(moved.id)) === prereqBefore);
  check(
    "response reports both renumbered lists",
    result.source.subtopics.length === sourceCount - 1 &&
      result.target.subtopics.length === targetCount + 1 &&
      result.target.subtopics.every((sub, index) => sub.order === index)
  );
  check("other topics were left alone", topics
    .filter((topic) => topic.id !== sourceTopic.id && topic.id !== targetTopic.id)
    .every((topic) => ordersAreClean(topic.subtopics)));

  // 3. Same-parent reorder -----------------------------------------------------
  console.log("\n3) reorder inside the new parent: index 4 -> 0");
  await moveSubtopic({
    courseId: course.id,
    subtopicId: moved.id,
    targetParentId: targetTopic.id,
    targetIndex: 0,
  });
  topics = await loadCourse(course.id);
  targetAfter = topics.find((topic) => topic.id === targetTopic.id);
  check("list stays clean after a same-parent move", ordersAreClean(targetAfter.subtopics), describeOrders(targetAfter.subtopics));
  check("subtopic is first now", targetAfter.subtopics[0].id === moved.id);
  check("list length unchanged", targetAfter.subtopics.length === targetCount + 1);

  console.log("\n4) append at the end (index === length)");
  const appendIndex = targetAfter.subtopics.length - 1;
  await moveSubtopic({
    courseId: course.id,
    subtopicId: moved.id,
    targetParentId: targetTopic.id,
    targetIndex: appendIndex,
  });
  topics = await loadCourse(course.id);
  targetAfter = topics.find((topic) => topic.id === targetTopic.id);
  check("subtopic sits last", targetAfter.subtopics[appendIndex].id === moved.id);
  check("list stays clean", ordersAreClean(targetAfter.subtopics), describeOrders(targetAfter.subtopics));

  // 5. Validation --------------------------------------------------------------
  console.log("\n5) validation (each must reject AND write nothing)");
  const otherCourse = await prisma.course.findFirst({
    where: { id: { not: course.id }, topics: { some: { parentTopicId: null } } },
    select: { id: true, topics: { where: { parentTopicId: null }, take: 1, select: { id: true } } },
  });

  await expectRejected(
    "index above the list length",
    { courseId: course.id, subtopicId: moved.id, targetParentId: targetTopic.id, targetIndex: targetAfter.subtopics.length },
    400,
    course.id
  );
  await expectRejected(
    "negative index",
    { courseId: course.id, subtopicId: moved.id, targetParentId: targetTopic.id, targetIndex: -1 },
    400,
    course.id
  );
  await expectRejected(
    "non-integer index",
    { courseId: course.id, subtopicId: moved.id, targetParentId: targetTopic.id, targetIndex: 1.5 },
    400,
    course.id
  );
  await expectRejected(
    "target is a subtopic, not a root topic",
    { courseId: course.id, subtopicId: moved.id, targetParentId: targetTopic.subtopics[1].id, targetIndex: 0 },
    400,
    course.id
  );
  await expectRejected(
    "moving a root topic",
    { courseId: course.id, subtopicId: sourceTopic.id, targetParentId: targetTopic.id, targetIndex: 0 },
    400,
    course.id
  );
  await expectRejected(
    "subtopic into itself",
    { courseId: course.id, subtopicId: moved.id, targetParentId: moved.id, targetIndex: 0 },
    400,
    course.id
  );
  await expectRejected(
    "unknown subtopic id",
    { courseId: course.id, subtopicId: "00000000-0000-0000-0000-000000000000", targetParentId: targetTopic.id, targetIndex: 0 },
    404,
    course.id
  );
  await expectRejected(
    "unknown target id",
    { courseId: course.id, subtopicId: moved.id, targetParentId: "00000000-0000-0000-0000-000000000000", targetIndex: 0 },
    404,
    course.id
  );
  await expectRejected(
    "missing targetParentId",
    { courseId: course.id, subtopicId: moved.id, targetParentId: null, targetIndex: 0 },
    400,
    course.id
  );
  if (otherCourse) {
    await expectRejected(
      "subtopic belongs to another course",
      { courseId: otherCourse.id, subtopicId: moved.id, targetParentId: targetTopic.id, targetIndex: 0 },
      400,
      course.id
    );
    await expectRejected(
      "target topic belongs to another course",
      { courseId: course.id, subtopicId: moved.id, targetParentId: otherCourse.topics[0].id, targetIndex: 0 },
      400,
      course.id
    );
  } else {
    console.log("  skip  cross-course checks (no second course with a root topic in this database)");
  }

  // 6. Rollback ----------------------------------------------------------------
  console.log("\n6) failure in the middle of the renumbering");
  const beforeProbe = await snapshot(course.id);
  let probeError = null;
  probe.armed = true;
  probe.seen = 0;
  try {
    // A cross-topic move writes many rows; this one dies after the third write.
    await moveSubtopic({
      courseId: course.id,
      subtopicId: moved.id,
      targetParentId: startTopics[1].id,
      targetIndex: 0,
    });
  } catch (caught) {
    probeError = caught;
  } finally {
    probe.armed = false;
  }
  check("the move failed", probeError !== null, "it succeeded despite the injected failure");
  check("writes happened before the failure", probe.seen > probe.failAfter, `${probe.seen} updates seen`);
  check("database is byte-identical after the failed move", (await snapshot(course.id)) === beforeProbe);

  // 7. Round trip --------------------------------------------------------------
  console.log("\n7) move back to the original slot");
  await moveSubtopic({
    courseId: course.id,
    subtopicId: moved.id,
    targetParentId: sourceTopic.id,
    targetIndex: 1,
  });
  const endSnapshot = await snapshot(course.id);
  check("structure and prerequisites match the starting state exactly", endSnapshot === startSnapshot);

  console.log("");
  if (failures.length) {
    console.log(`${passed} checks passed, ${failures.length} FAILED:`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${passed} checks passed.`);
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error("\nCheck aborted:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
