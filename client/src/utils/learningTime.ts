import { api } from './api';

type ResourceType = 'video' | 'article' | 'podcast' | 'quiz';

type LearningActivityStats = {
  streak: number;
  todayMinutes: number;
};

// Send a real learning-activity chunk to the server (fire-and-forget).
// Powers time-on-task, daily engagement, focus time and streak. Must never disrupt the UI.
export const trackActivity = (payload: { courseId?: string | null; topicId?: string | null; seconds: number }) => {
  api.post('/statistics/track', payload).catch(() => {});
};

// Fetch the logged-in student's server-side focus time + streak (real data).
export const fetchMyLearningStats = async (): Promise<LearningActivityStats> => {
  try {
    const res = await api.get('/statistics/me');
    return {
      streak: Number(res.data?.streak) || 0,
      todayMinutes: Number(res.data?.todayMinutes) || 0,
    };
  } catch {
    return { streak: 0, todayMinutes: 0 };
  }
};

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

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPreviousLocalDateKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date);
};

const getActivityStorageKey = (userId?: string) => `campnode:learning-activity:${userId || 'anon'}`;

const parseStoredActivity = (userId?: string) => {
  try {
    return JSON.parse(localStorage.getItem(getActivityStorageKey(userId)) || '{}');
  } catch {
    return {};
  }
};

export const parseLearningMinutes = (value?: number | string | null) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value).match(/\d+/)?.[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
};

export const getLearningActivityStats = (userId?: string): LearningActivityStats => {
  const activity = parseStoredActivity(userId);
  const today = getLocalDateKey();

  return {
    streak: activity.lastActivityDate === today ? Number(activity.streak) || 0 : 0,
    todayMinutes: activity.todayDate === today ? Number(activity.todayMinutes) || 0 : 0,
  };
};

export const recordLearningActivity = (userId: string | undefined, minutes?: number | string | null) => {
  const activity = parseStoredActivity(userId);
  const today = getLocalDateKey();
  const yesterday = getPreviousLocalDateKey();
  const parsedMinutes = parseLearningMinutes(minutes) || 0;

  const nextStreak =
    activity.lastActivityDate === today
      ? Number(activity.streak) || 1
      : activity.lastActivityDate === yesterday
        ? (Number(activity.streak) || 0) + 1
        : 1;

  const nextTodayMinutes = activity.todayDate === today
    ? (Number(activity.todayMinutes) || 0) + parsedMinutes
    : parsedMinutes;

  localStorage.setItem(getActivityStorageKey(userId), JSON.stringify({
    streak: nextStreak,
    lastActivityDate: today,
    todayDate: today,
    todayMinutes: nextTodayMinutes,
  }));
};
