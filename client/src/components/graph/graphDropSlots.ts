export interface GraphDropNode {
  id: string;
  kind: 'topic' | 'subtopic';
  topicId: string;
  index: number;
  x: number;
  y: number;
  collapsed?: boolean;
  flowIndex?: number;
  subtopicCount?: number;
}

export interface GraphDropSlot {
  x: number;
  y: number;
  targetTopicId: string;
  targetIndex: number;
  previousNodeId: string;
  nextNodeId?: string;
}

export function getGraphDropSlots(
  flowNodes: GraphDropNode[],
  draggedNodeId?: string,
  flowColumns?: number
): GraphDropSlot[] {
  const draggedNode = flowNodes.find((node) => node.id === draggedNodeId);
  const slots: GraphDropSlot[] = [];

  const addSlot = (
    x: number,
    y: number,
    targetTopicId: string,
    originalIndex: number,
    previousNodeId: string,
    nextNodeId?: string
  ) => {
    const targetIndex = originalIndex -
      (draggedNode &&
      draggedNode.topicId === targetTopicId &&
      draggedNode.index < originalIndex
        ? 1
        : 0);

    if (
      draggedNode &&
      draggedNode.topicId === targetTopicId &&
      draggedNode.index === targetIndex
    ) {
      return;
    }

    slots.push({
      x,
      y,
      targetTopicId,
      targetIndex,
      previousNodeId,
      nextNodeId,
    });
  };

  for (let index = 0; index < flowNodes.length - 1; index += 1) {
    const previous = flowNodes[index];
    const next = flowNodes[index + 1];
    const targetIndex = previous.kind === 'topic' ? 0 : previous.index + 1;

    addSlot(
      (previous.x + next.x) / 2,
      (previous.y + next.y) / 2,
      previous.topicId,
      targetIndex,
      previous.id,
      next.id
    );
  }

  const last = flowNodes[flowNodes.length - 1];
  if (last) {
    const subtopicCount = last.subtopicCount ??
      flowNodes.filter((node) => node.kind === 'subtopic' && node.topicId === last.topicId).length;
    let x = last.x + 70;
    let y = last.y;

    if (flowColumns && last.flowIndex !== undefined) {
      const currentRow = Math.floor(last.flowIndex / flowColumns);
      const nextRow = Math.floor((last.flowIndex + 1) / flowColumns);
      if (currentRow === nextRow) {
        x = last.x + (currentRow % 2 === 0 ? 70 : -70);
      } else {
        x = last.x;
        y = last.y + 70;
      }
    } else if (flowNodes.length > 1) {
      const previousInRow = [...flowNodes].reverse().find(
        (node) => node.id !== last.id && node.y === last.y && node.x !== last.x
      );
      if (previousInRow) {
        x = last.x + Math.sign(last.x - previousInRow.x) * 70;
      } else {
        const previous = flowNodes[flowNodes.length - 2];
        if (previous.y !== last.y) {
          x = last.x;
          y = last.y + Math.sign(last.y - previous.y) * 70;
        }
      }
    }

    addSlot(x, y, last.topicId, subtopicCount, last.id);
  }

  return slots;
}
