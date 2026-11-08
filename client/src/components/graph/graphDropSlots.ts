export interface GraphDropNode {
  id: string;
  kind: 'topic' | 'subtopic';
  topicId: string;
  index: number;
  x: number;
  y: number;
  collapsed?: boolean;
}

export interface GraphDropSlot {
  x: number;
  y: number;
  targetTopicId: string;
  targetIndex: number;
  previousNodeId: string;
  nextNodeId: string;
}

export function getGraphDropSlots(
  flowNodes: GraphDropNode[],
  draggedNodeId?: string
): GraphDropSlot[] {
  const draggedNode = flowNodes.find((node) => node.id === draggedNodeId);
  const slots: GraphDropSlot[] = [];

  for (let index = 0; index < flowNodes.length - 1; index += 1) {
    const previous = flowNodes[index];
    const next = flowNodes[index + 1];

    if (
      previous.id === draggedNodeId ||
      next.id === draggedNodeId ||
      (previous.kind === 'topic' && previous.collapsed)
    ) {
      continue;
    }

    const targetTopicId = previous.topicId;
    let targetIndex = previous.kind === 'topic' ? 0 : previous.index + 1;
    if (
      draggedNode &&
      draggedNode.topicId === targetTopicId &&
      draggedNode.index < targetIndex
    ) {
      targetIndex -= 1;
    }

    slots.push({
      x: (previous.x + next.x) / 2,
      y: (previous.y + next.y) / 2,
      targetTopicId,
      targetIndex,
      previousNodeId: previous.id,
      nextNodeId: next.id,
    });
  }

  return slots;
}
