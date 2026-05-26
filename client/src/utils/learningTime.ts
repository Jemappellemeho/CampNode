type ResourceType = 'video' | 'article' | 'podcast' | 'quiz';

const MINUTES_BY_TYPE: Record<ResourceType, [number, number]> = {
  video: [8, 18],
  article: [6, 15],
  podcast: [7, 17],
  quiz: [4, 9],
};

const hashText = (text: string) => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const getResourceTypeLabel = (type: ResourceType) => {
  switch (type) {
    case 'video':
      return 'Video Resource';
    case 'article':
      return 'Reading Material';
    case 'podcast':
      return 'Audio Resource';
    case 'quiz':
      return 'Knowledge Check';
    default:
      return 'Learning Resource';
  }
};

export const formatLearningTime = (minutes?: number | string | null) => {
  if (minutes === undefined || minutes === null || minutes === '') return undefined;
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return `${Math.round(parsed)} min`;
};

export const estimateLearningTime = (
  nodeId: string,
  resourceType: ResourceType,
  resourceTitle: string,
  resourceIndex = 0
) => {
  const [minimum, maximum] = MINUTES_BY_TYPE[resourceType];
  const spread = maximum - minimum + 1;
  const minutes = minimum + (hashText(`${nodeId}:${resourceType}:${resourceTitle}:${resourceIndex}`) % spread);

  return `${minutes} min`;
};
