// Atomic subtopic moves for the course manager.
//
// A move is ONE operation: the client sends a single request, the server runs a single
// interactive transaction, and either the whole move lands or nothing changes at all.
// Inside that transaction the moved subtopic gets its new parent + index, and BOTH the old
// and the new parent are renumbered to a clean 0..n-1 (no gaps, no duplicates).
//
// Prerequisites are a self-relation keyed by topic id ("TopicHierarchy"), so a move never
// touches them: we only write parentTopicId and order. (PUT /api/topics/:id with
// prerequisiteIds REPLACES the whole list - that endpoint is not involved here.)
//
// Unique constraints: the Topic table has no unique index on (parentTopicId, order) -
// only the primary key on id (verified against schema.prisma and the live database, see
// scripts/checkSubtopicMove.js, which re-asserts it). Renumbering can therefore write the
// final values directly without parking rows at temporary orders first. If a unique
// (parentTopicId, order) index is ever added, that check fails and this renumbering needs
// a two-phase write.
const prisma = require("../utils/prisma");

// Validation failures carry the HTTP status the controller should answer with.
class TopicMoveError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "TopicMoveError";
    this.status = status;
  }
}

// Interactive transactions run against a remote (pooled) Postgres, so a handful of row
// updates can take a moment. The default 5s timeout is tight for a topic with many
// subtopics; 15s keeps the all-or-nothing guarantee without aborting a healthy move.
const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 15000 };

// Order values in legacy rows can be duplicated or gappy (older clients saved reorders as
// N separate requests). Sorting by (order, id) gives a stable, deterministic list anyway,
// and the renumbering below cleans the stored values up.
const SIBLING_ORDER_BY = [{ order: "asc" }, { id: "asc" }];

// A subtopic inherits its course from its parent topic; older rows may also carry courseId.
function resolveCourseId(subtopic) {
  return subtopic.courseId || subtopic.parentTopic?.courseId || null;
}

// Assign 0..n-1 and return only the rows whose stored order actually differs.
function planRenumber(siblings, parentTopicId) {
  return siblings.map((sibling, index) => ({
    id: sibling.id,
    order: index,
    parentTopicId,
    changed: sibling.order !== index || sibling.parentTopicId !== parentTopicId,
  }));
}

/**
 * Move a subtopic to a position inside a root topic of the same course.
 *
 * @param {object} params
 * @param {string} params.courseId      Course the move happens in.
 * @param {string} params.subtopicId    Subtopic being moved.
 * @param {string} params.targetParentId Root topic that receives the subtopic.
 * @param {number} params.targetIndex   0-based slot in the target list (length = append).
 * @returns {Promise<object>} the renumbered source and target lists.
 * @throws {TopicMoveError} on any validation problem - nothing is written then.
 */
async function moveSubtopic({ courseId, subtopicId, targetParentId, targetIndex }) {
  if (!courseId) throw new TopicMoveError(400, "courseId is required");
  if (!subtopicId) throw new TopicMoveError(400, "subtopicId is required");
  if (!targetParentId) throw new TopicMoveError(400, "targetParentId is required");

  const index = Number(targetIndex);
  if (!Number.isInteger(index) || index < 0) {
    throw new TopicMoveError(400, "targetIndex must be an integer >= 0");
  }

  return prisma.$transaction(async (tx) => {
    // --- Validation: the subtopic ---
    const subtopic = await tx.topic.findUnique({
      where: { id: subtopicId },
      select: {
        id: true,
        name: true,
        courseId: true,
        parentTopicId: true,
        order: true,
        parentTopic: { select: { id: true, courseId: true } },
      },
    });

    if (!subtopic) throw new TopicMoveError(404, "Subtopic not found");
    if (!subtopic.parentTopicId) {
      throw new TopicMoveError(400, "Only subtopics can be moved; this topic has no parent");
    }
    if (resolveCourseId(subtopic) !== courseId) {
      throw new TopicMoveError(400, "Subtopic does not belong to this course");
    }

    // --- Validation: the target topic ---
    if (targetParentId === subtopicId) {
      throw new TopicMoveError(400, "A subtopic cannot be moved into itself");
    }

    const targetParent = await tx.topic.findUnique({
      where: { id: targetParentId },
      select: { id: true, name: true, courseId: true, parentTopicId: true },
    });

    if (!targetParent) throw new TopicMoveError(404, "Target topic not found");
    if (targetParent.courseId !== courseId) {
      throw new TopicMoveError(400, "Target topic does not belong to this course");
    }
    if (targetParent.parentTopicId) {
      throw new TopicMoveError(400, "Target topic must be a root topic");
    }

    const sourceParentId = subtopic.parentTopicId;
    const sameParent = sourceParentId === targetParent.id;

    // --- Build the two new sibling lists ---
    const sourceSiblings = await tx.topic.findMany({
      where: { parentTopicId: sourceParentId },
      orderBy: SIBLING_ORDER_BY,
      select: { id: true, order: true, parentTopicId: true },
    });

    const remainingSource = sourceSiblings.filter((sibling) => sibling.id !== subtopicId);

    const targetSiblings = sameParent
      ? remainingSource
      : await tx.topic.findMany({
          where: { parentTopicId: targetParent.id },
          orderBy: SIBLING_ORDER_BY,
          select: { id: true, order: true, parentTopicId: true },
        });

    // --- Validation: the index ---
    // The subtopic is already pulled out of its list, so index === length means "append".
    if (index > targetSiblings.length) {
      throw new TopicMoveError(
        400,
        `targetIndex ${index} is out of range (0..${targetSiblings.length})`
      );
    }

    const movedRow = { id: subtopicId, order: subtopic.order, parentTopicId: sourceParentId };
    const nextTarget = [
      ...targetSiblings.slice(0, index),
      movedRow,
      ...targetSiblings.slice(index),
    ];

    const targetPlan = planRenumber(nextTarget, targetParent.id);
    const sourcePlan = sameParent ? targetPlan : planRenumber(remainingSource, sourceParentId);

    // --- Write: both lists end up as a clean 0..n-1 ---
    // Every statement below shares this transaction, so a failure anywhere (bad id, lost
    // connection, constraint) rolls the whole move back.
    const writes = [...targetPlan, ...(sameParent ? [] : sourcePlan)].filter((row) => row.changed);
    for (const row of writes) {
      await tx.topic.update({
        where: { id: row.id },
        data: { order: row.order, parentTopicId: row.parentTopicId },
      });
    }

    const stripPlan = (plan) => plan.map(({ id, order }) => ({ id, order }));

    return {
      movedTopicId: subtopicId,
      movedTopicName: subtopic.name,
      sourceParentId,
      targetParentId: targetParent.id,
      targetIndex: index,
      sameParent,
      updatedCount: writes.length,
      source: { parentTopicId: sourceParentId, subtopics: stripPlan(sourcePlan) },
      target: { parentTopicId: targetParent.id, subtopics: stripPlan(targetPlan) },
    };
  }, TRANSACTION_OPTIONS);
}

module.exports = { moveSubtopic, TopicMoveError };
