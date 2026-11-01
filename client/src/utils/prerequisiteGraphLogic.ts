/**
 * Pure prerequisite and position logic engine for CampNode professor graph.
 * Satisfies NF-08: Position and flag calculations separated from drawing components.
 */

export interface Position {
  topicOrder: number;
  subtopicOrder: number; // 0 for topics, s + 1 for subtopics
}

/**
 * F-06: Give a topic with order t the position (t, 0) 
 * and a subtopic with order s inside a topic with order t the position (t, s + 1).
 */
export function calculateItemPositions(topics: any[]): Map<string, Position> {
  const positions = new Map<string, Position>();

  if (!Array.isArray(topics)) return positions;

  topics.forEach((topic, tIdx) => {
    const topicOrder = topic.order ?? tIdx;
    positions.set(topic.id, { topicOrder, subtopicOrder: 0 });

    if (Array.isArray(topic.subtopics)) {
      topic.subtopics.forEach((subtopic: any, sIdx: number) => {
        const subtopicOrder = (subtopic.order ?? sIdx) + 1;
        positions.set(subtopic.id, { topicOrder, subtopicOrder });
      });
    }
  });

  return positions;
}

/**
 * F-06: Positions are compared like words in a dictionary:
 * first number first, second number only if the first is equal.
 * Returns: negative if posA < posB, 0 if equal, positive if posA > posB.
 */
export function comparePositions(posA: Position, posB: Position): number {
  if (posA.topicOrder !== posB.topicOrder) {
    return posA.topicOrder - posB.topicOrder;
  }
  return posA.subtopicOrder - posB.subtopicOrder;
}

/**
 * F-07: Flag every prerequisite whose required item has a later position 
 * than the item that needs it (backward prerequisite).
 */
export function isBackwardPrerequisite(
  requiredId: string,
  dependentId: string,
  positions: Map<string, Position>
): boolean {
  const posRequired = positions.get(requiredId);
  const posDependent = positions.get(dependentId);

  if (!posRequired || !posDependent) return false;

  // A prerequisite is backward if the required item comes AFTER the dependent item
  return comparePositions(posRequired, posDependent) > 0;
}

/**
 * Analyzes all topics/subtopics and returns a set of flagged prerequisite edge keys ("requiredId->dependentId")
 * and map of warning counts per node/collapsed topic (F-08).
 */
export function analyzeCoursePrerequisites(topics: any[]) {
  const positions = calculateItemPositions(topics);
  const flaggedEdges = new Set<string>();
  const warningCounts = new Map<string, number>();

  // Helper to increment warnings for an item
  const addWarning = (id: string) => {
    warningCounts.set(id, (warningCounts.get(id) || 0) + 1);
  };

  if (!Array.isArray(topics)) {
    return { positions, flaggedEdges, warningCounts };
  }

  topics.forEach((topic) => {
    // Check topic prerequisites if any
    if (Array.isArray(topic.prerequisites)) {
      topic.prerequisites.forEach((prereq: any) => {
        if (isBackwardPrerequisite(prereq.id, topic.id, positions)) {
          flaggedEdges.add(`${prereq.id}->${topic.id}`);
          addWarning(topic.id);
        }
      });
    }

    // Check subtopic prerequisites
    if (Array.isArray(topic.subtopics)) {
      topic.subtopics.forEach((sub: any) => {
        if (Array.isArray(sub.prerequisites)) {
          sub.prerequisites.forEach((prereq: any) => {
            if (isBackwardPrerequisite(prereq.id, sub.id, positions)) {
              flaggedEdges.add(`${prereq.id}->${sub.id}`);
              addWarning(sub.id);
              // Also add warning to parent topic container for collapsed view (F-08)
              addWarning(topic.id);
            }
          });
        }
      });
    }
  });

  return { positions, flaggedEdges, warningCounts };
}