/**
 * Pure logic for moving a subtopic, kept out of the drawing components (NF-08).
 *
 * A move is ONE operation: the UI turns a drop into a target index, shows the result
 * immediately, and sends a single request. The server runs the whole move in one
 * transaction and answers with the renumbered lists, which applyMoveResult() folds back
 * into the local state. Nothing here touches prerequisites - they are keyed by topic id
 * and survive a move unchanged.
 */

export interface MovePlan {
  /** 0-based slot inside the target topic, as the server expects it. */
  targetIndex: number;
  /** Topics array with the move already applied and both lists renumbered 0..n-1. */
  topics: any[];
}

export interface MoveResultList {
  parentTopicId: string;
  subtopics: { id: string; order: number }[];
}

export interface MoveResult {
  movedTopicId: string;
  sourceParentId: string;
  targetParentId: string;
  source: MoveResultList;
  target: MoveResultList;
}

function renumber(subtopics: any[], parentTopicId: string) {
  return subtopics.map((subtopic, index) => ({
    ...subtopic,
    order: index,
    parentTopicId,
  }));
}

/**
 * Turn a drop into a concrete move.
 *
 * @param dropTargetId the subtopic that was dropped on; empty means "append at the end",
 *                     which is also how a drop on the topic card itself arrives.
 * @returns null when there is nothing to do (unknown ids, or the subtopic would not move).
 */
export function planSubtopicMove(
  topics: any[],
  params: {
    subtopicId: string;
    sourceParentId: string;
    targetParentId: string;
    dropTargetId?: string;
  }
): MovePlan | null {
  const { subtopicId, sourceParentId, targetParentId, dropTargetId } = params;
  if (!Array.isArray(topics) || !subtopicId || !sourceParentId || !targetParentId) return null;
  if (subtopicId === dropTargetId) return null;

  const sourceParent = topics.find((topic: any) => topic.id === sourceParentId);
  const targetParent = topics.find((topic: any) => topic.id === targetParentId);
  if (!sourceParent || !targetParent) return null;

  const sourceList = [...(sourceParent.subtopics || [])];
  const sourceIndex = sourceList.findIndex((subtopic: any) => subtopic.id === subtopicId);
  if (sourceIndex === -1) return null;

  const sameParent = sourceParentId === targetParentId;

  // The drop slot is read from the list as it is shown on screen, so a subtopic dropped on
  // another one takes over that position - the behaviour the editor had before.
  const shownTarget = sameParent ? sourceList : [...(targetParent.subtopics || [])];
  const dropIndex = dropTargetId
    ? shownTarget.findIndex((subtopic: any) => subtopic.id === dropTargetId)
    : -1;

  const [moved] = sourceList.splice(sourceIndex, 1);
  const baseTarget = sameParent ? sourceList : shownTarget;

  // The moved subtopic is out of the list now, so the index range is 0..length (append),
  // which is exactly the range the server validates against.
  const targetIndex = dropIndex === -1 ? baseTarget.length : dropIndex;

  // Dropping an item back onto its own slot changes nothing - do not call the server.
  if (sameParent && targetIndex === sourceIndex) return null;

  const nextTarget = [...baseTarget];
  nextTarget.splice(targetIndex, 0, moved);

  const renumberedTarget = renumber(nextTarget, targetParentId);
  const renumberedSource = sameParent ? renumberedTarget : renumber(sourceList, sourceParentId);

  return {
    targetIndex,
    topics: topics.map((topic: any) => {
      if (topic.id === targetParentId) return { ...topic, subtopics: renumberedTarget };
      if (topic.id === sourceParentId) return { ...topic, subtopics: renumberedSource };
      return topic;
    }),
  };
}

/**
 * Fold the server response (the authoritative 0..n-1 lists) back into the topics array.
 * Returns null when the response does not line up with what the client holds - the caller
 * should then reload the course instead of guessing.
 */
export function applyMoveResult(topics: any[], result: MoveResult): any[] | null {
  if (!Array.isArray(topics) || !result?.target?.subtopics || !result?.source?.subtopics) {
    return null;
  }

  // Every subtopic currently on screen, so the moved one can be picked up from its old parent.
  const pool = new Map<string, any>();
  for (const topic of topics) {
    for (const subtopic of topic.subtopics || []) pool.set(subtopic.id, subtopic);
  }

  const rebuild = (list: MoveResultList) => {
    const rebuilt = list.subtopics.map((row) => {
      const existing = pool.get(row.id);
      if (!existing) return null;
      return { ...existing, order: row.order, parentTopicId: list.parentTopicId };
    });
    return rebuilt.includes(null) ? null : (rebuilt as any[]);
  };

  const byParent = new Map<string, any[]>();
  for (const list of [result.source, result.target]) {
    const rebuilt = rebuild(list);
    if (!rebuilt) return null;
    byParent.set(list.parentTopicId, rebuilt);
  }

  return topics.map((topic: any) =>
    byParent.has(topic.id) ? { ...topic, subtopics: byParent.get(topic.id) } : topic
  );
}
