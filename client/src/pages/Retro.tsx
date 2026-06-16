import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useParams, useNavigate } from 'react-router-dom';
import SyllabusDrawer from '../components/SyllabusDrawer';
import TopicAbstractModal from '../components/TopicAbstractModal';
import NodeDetailPanel from '../components/NodeDetailPanel';
import AiChatCompanion from '../components/AiChatCompanion';
import { ChevronLeft } from 'lucide-react';
import GuideOverlay from '../components/GuideOverlay';
import { estimateLearningTime, formatLearningTime, getResourceTypeLabel, parseLearningMinutes, recordLearningActivity } from '../utils/learningTime';
import { hasSeenGuide, markGuideSeen } from '../utils/guideSession';

// API_ORIGIN wird nur für Ressourcen-URLs (window.open) gebraucht, nicht für API-Calls
const API_ORIGIN = 'http://localhost:3000';

type Status = 'completed' | 'current' | 'locked';

interface Subnode {
  id: string;
  title: string;
  type: 'prof' | 'ai';
  status: Status;
  hasArticle: boolean;
  hasQuiz: boolean;
  resources: Array<{
    type: 'video' | 'article' | 'podcast' | 'quiz';
    title: string;
    url?: string;
    duration?: string;
    estimatedTime?: string;
    estimatedMinutes?: number | null;
  }>;
}

interface MainTopic {
  id: string;
  title: string;
  description: string;
  content?: string;
  hasArticle: boolean;
  hasQuiz: boolean;
  resources: Array<{
    type: 'video' | 'article' | 'podcast' | 'quiz';
    title: string;
    url?: string;
    duration?: string;
    estimatedTime?: string;
    estimatedMinutes?: number | null;
  }>;
  status: Status;
  subnodes: Subnode[];
  progress: { completed: number; total: number };
}

type LearningResource = Subnode['resources'][number];

interface SelectedLearningNode {
  id: string;
  name: string;
  color: string;
  resources: LearningResource[];
  completed: boolean;
  quizCompleted: boolean;
}

interface QuestionEditorTarget {
  id: string;
  title: string;
}

// This component renders the "Retro Mode" (formerly Vein Mode) learning interface.
// It creates a dynamic, circuit-board style SVG diagram connecting main topics and AI-suggested branches.
export default function Retro() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [courseTitle, setCourseTitle] = useState("Loading Course...");
  const [pathData, setPathData] = useState<MainTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyllabusOpen, setSyllabusOpen] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [activePopupContent, setActivePopupContent] = useState<{title: string, content: string} | null>(null);
  const [resourceOpenedIds, setResourceOpenedIds] = useState<string[]>([]);
  const [quizCompletedIds, setQuizCompletedIds] = useState<string[]>([]);
  const [selectedSubnode, setSelectedSubnode] = useState<SelectedLearningNode | null>(null);
  const [topicNotes, setTopicNotes] = useState<Record<string, string>>({});
  const [questionEditorTarget, setQuestionEditorTarget] = useState<QuestionEditorTarget | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Screen sizing — subtract syllabus width when open so map shrinks and nodes rearrange
  const getRawWidth = () => document.documentElement.clientWidth || window.innerWidth;

  const [rawWidth, setRawWidth] = useState(getRawWidth());

  useEffect(() => {
    const handleResize = () => setRawWidth(getRawWidth());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  const getResourceStorageKey = (userId?: string) => `campnode:resource-opened:${userId || 'anon'}`;
  const getQuizStorageKey = (userId?: string) => `campnode:quiz-completed:${userId || 'anon'}`;
  const getQuestionNotesStorageKey = (userId?: string, currentCourseId?: string) => `campnode:question-notes:${userId || 'anon'}:${currentCourseId || 'unknown'}`;

  const loadStoredIds = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };

  const persistStoredIds = (key: string, ids: string[]) => {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))));
  };

  const loadStoredNotes = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const persistStoredNotes = (key: string, notes: Record<string, string>) => {
    localStorage.setItem(key, JSON.stringify(notes));
  };

  const resolveResourceUrl = (url?: string) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return `${API_ORIGIN}/${url}`;
  };

  const openArticleModal = async (topicId: string, title: string, fallbackUrl?: string) => {
    const resolvedUrl = resolveResourceUrl(fallbackUrl);

    if (resolvedUrl && !fallbackUrl?.includes('/uploads/')) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const res = await api.get(`/topics/${topicId}/content?lang=en`);

      if (res.data?.content) {
        setActivePopupContent({ title, content: res.data.content });
        return;
      }
    } catch (err) {
      console.error('Failed to load full wiki article:', err);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) {}
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (user && pathData.length > 0 && !hasSeenGuide(user, 'student-course')) {
      setShowGuide(true);
    }
  }, [user, pathData.length]);

  const closeGuide = () => {
    markGuideSeen(user, 'student-course');
    setShowGuide(false);
  };

  useEffect(() => {
    if (!courseId) return;
    const storedUser = localStorage.getItem('user');
    let parsedUser: any = null;
    try {
      parsedUser = storedUser ? JSON.parse(storedUser) : null;
    } catch {
      parsedUser = null;
    }

    setResourceOpenedIds(loadStoredIds(getResourceStorageKey(parsedUser?.id)));
    setQuizCompletedIds(loadStoredIds(getQuizStorageKey(parsedUser?.id)));
    setTopicNotes(loadStoredNotes(getQuestionNotesStorageKey(parsedUser?.id, courseId)));
  }, [courseId]);

  useEffect(() => {
    // --- CORE DATA FETCHING ---
  // We fetch the course data and transform it into a format that our Grid and Syllabus can easily read.
  // The syllabus changes are powered here by directly using the actual topic/subtopic 'name'
  // for the 'title' of the resource, rather than extracting a generic website URL.
  const fetchCourseData = async () => {
      try {
        const savedUser = localStorage.getItem('user');
        const parsedUser = savedUser ? JSON.parse(savedUser) : null;
        const [courseRes, progressRes] = await Promise.all([
          api.get(`/courses/${courseId}`),
          api.get(`/progress`)
        ]);

        const dbCourse = courseRes.data;
        setCourseTitle(dbCourse.title);

        const backendCompleted = progressRes.data
          .filter((p: any) => p.topic?.courseId === courseId && p.completed)
          .map((p: any) => p.topicId);
        setCompletedIds(backendCompleted);

        const transformedData: MainTopic[] = dbCourse.topics.map((topic: any, index: number) => {
          let mappedSubtopics: Subnode[] = (topic.subtopics || []).map((sub: any) => ({
            id: sub.id,
            title: sub.name,
            type: sub.aiSuggested ? 'ai' : 'prof',
            status: backendCompleted.includes(topic.id) ? 'completed' : 'current',
            hasArticle: Boolean(sub.articleUrl || sub.wikidataId || sub.content),
            hasQuiz: Array.isArray(sub.quizzes) && sub.quizzes.length > 0,
            resources: [
              ...(sub.videoUrl ? [{ type: 'video', title: sub.name, url: sub.videoUrl, estimatedMinutes: sub.videoMinutes }] : []),
              ...((sub.articleUrl || sub.wikidataId || sub.content) ? [{ type: 'article', title: sub.name, url: sub.articleUrl, estimatedMinutes: sub.articleMinutes }] : []),
              ...(sub.podcastUrl ? [{ type: 'podcast', title: sub.name, url: sub.podcastUrl, estimatedMinutes: sub.podcastMinutes }] : []),
              ...((Array.isArray(sub.quizzes) && sub.quizzes.length > 0) ? [{ type: 'quiz', title: 'Knowledge Check', url: '#', estimatedMinutes: sub.quizMinutes }] : [])
            ]
          }));

          return {
            id: topic.id,
            title: `${index + 1}. ${topic.name}`,
            description: topic.description || "No description provided.",
            content: topic.content,
            hasArticle: Boolean(topic.articleUrl || topic.wikidataId || topic.content),
            hasQuiz: Array.isArray(topic.quizzes) && topic.quizzes.length > 0,
            resources: [
              ...(topic.videoUrl ? [{ type: 'video', title: topic.name, url: topic.videoUrl, estimatedMinutes: topic.videoMinutes }] : []),
              ...((topic.articleUrl || topic.wikidataId || topic.content) ? [{ type: 'article', title: topic.name, url: topic.articleUrl, estimatedMinutes: topic.articleMinutes }] : []),
              ...(topic.podcastUrl ? [{ type: 'podcast', title: topic.name, url: topic.podcastUrl, estimatedMinutes: topic.podcastMinutes }] : []),
              ...((Array.isArray(topic.quizzes) && topic.quizzes.length > 0) ? [{ type: 'quiz', title: 'Knowledge Check', url: '#', estimatedMinutes: topic.quizMinutes }] : [])
            ],
            status: index === 0 ? 'current' : 'locked',
            progress: { completed: backendCompleted.includes(topic.id) ? 1 : 0, total: 1 },
            subnodes: mappedSubtopics
          };
        });

        const currentTrackableIds = Array.from(new Set(
          transformedData.flatMap((node) => [node.id, ...node.subnodes.map((sub) => sub.id)])
        ));

        const inferredResourceIds = backendCompleted.filter((topicId: string) =>
          currentTrackableIds.includes(topicId)
        );
        const inferredQuizIds = backendCompleted.filter((topicId: string) =>
          transformedData.some((node) =>
            (node.id === topicId && node.hasQuiz) ||
            node.subnodes.some((sub) => sub.id === topicId && sub.hasQuiz)
          )
        );

        setResourceOpenedIds((prev) => {
          const next = Array.from(new Set([...prev.filter((id) => currentTrackableIds.includes(id)), ...inferredResourceIds]));
          if (parsedUser?.id) persistStoredIds(getResourceStorageKey(parsedUser.id), next);
          return next;
        });

        setQuizCompletedIds((prev) => {
          const next = Array.from(new Set([...prev.filter((id) => currentTrackableIds.includes(id)), ...inferredQuizIds]));
          if (parsedUser?.id) persistStoredIds(getQuizStorageKey(parsedUser.id), next);
          return next;
        });

        // Initialize activeId
        if (transformedData.length > 0) setActiveId(transformedData[0].id);
        setPathData(transformedData);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setLoading(false);
      }
    };
    if (courseId) fetchCourseData();
  }, [courseId, navigate]);

  const saveTopicCompletion = async (topicId: string) => {
    try {
      const isKnownTopic = pathData.some((node) => node.id === topicId || node.subnodes.some((sub) => sub.id === topicId));
      if (!isKnownTopic) return;

      await api.post(`/progress`, { topicId, completed: true });
      setCompletedIds(prev => (prev.includes(topicId) ? prev : [...prev, topicId]));
    } catch (err) { console.error("Progress failed"); }
  };

  const hasQuizForTopic = (topicId: string) => {
    for (const node of pathData) {
      if (node.id === topicId) return node.hasQuiz;
      const matchedSub = node.subnodes.find((sub) => sub.id === topicId);
      if (matchedSub) return matchedSub.hasQuiz;
    }
    return false;
  };

  const hasOpenableResourcesForTopic = (topicId: string) => {
    for (const node of pathData) {
      if (node.id === topicId) return node.resources.some((r) => r.type !== 'quiz');
      const matchedSub = node.subnodes.find((sub) => sub.id === topicId);
      if (matchedSub) return matchedSub.resources.some((r) => r.type !== 'quiz');
    }
    return false;
  };

  const isResourceOpened = (topicId: string) => resourceOpenedIds.includes(topicId) || completedIds.includes(topicId);
  const isQuizFinished = (topicId: string) => quizCompletedIds.includes(topicId) || completedIds.includes(topicId);

  const isCoreComplete = (topicId: string) => {
    // Check if it's already explicitly complete
    if (completedIds.includes(topicId)) return true;
    
    // NEW LOGIC: If the parent main topic is complete, auto-complete its subnodes
    const parentNode = pathData.find(node => node.subnodes.some(sub => sub.id === topicId));
    if (parentNode && completedIds.includes(parentNode.id)) return true;

    const requiresQuiz = hasQuizForTopic(topicId);
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    if (!requiresQuiz && !requiresResource) return true;
    const resourceDone = !requiresResource || isResourceOpened(topicId);
    const quizDone = !requiresQuiz || isQuizFinished(topicId);
    return resourceDone && quizDone;
  };

  const getCoreProgress = (topicId: string) => {
    const requiresQuiz = hasQuizForTopic(topicId);
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    const completed = (requiresResource && isResourceOpened(topicId) ? 1 : 0) + (requiresQuiz && isQuizFinished(topicId) ? 1 : 0);
    const total = (requiresResource ? 1 : 0) + (requiresQuiz ? 1 : 0);
    return { completed, total };
  };

  const isNodeComplete = (node: MainTopic) => {
    // NEW LOGIC: Fast-return true if the backend already marked it complete
    if (completedIds.includes(node.id)) return true;

    if (node.subnodes.length > 0) {
      return node.subnodes.every((sub) => sub.type === 'ai' || isCoreComplete(sub.id));
    }
    return isCoreComplete(node.id);
  };

  const syncTopicCompletion = async (topicId: string, nextResourceOpenedIds: string[], nextQuizCompletedIds: string[]) => {
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    const requiresQuiz = hasQuizForTopic(topicId);
    const hasResource = !requiresResource || nextResourceOpenedIds.includes(topicId);
    const hasQuiz = !requiresQuiz || nextQuizCompletedIds.includes(topicId);
    if (hasResource && hasQuiz && !completedIds.includes(topicId)) {
      await saveTopicCompletion(topicId);
    }
  };

  const markResourceOpened = async (topicId: string) => {
    const nextIds = resourceOpenedIds.includes(topicId) ? resourceOpenedIds : [...resourceOpenedIds, topicId];
    setResourceOpenedIds(nextIds);
    if (user?.id) {
      persistStoredIds(getResourceStorageKey(user.id), nextIds);
    }
    await syncTopicCompletion(topicId, nextIds, quizCompletedIds);
  };

  const markLearningActivity = (subnode: Subnode, resource: LearningResource) => {
    const resourceIndex = subnode.resources.indexOf(resource);
    const fallbackTime = estimateLearningTime(subnode.id, resource.type, resource.title, resourceIndex);
    recordLearningActivity(user?.id, parseLearningMinutes(resource.estimatedMinutes) || parseLearningMinutes(resource.estimatedTime) || parseLearningMinutes(fallbackTime));
  };

  const openSubnodeResource = async (subnode: Subnode, resource: LearningResource, options?: { markAsSkip?: boolean }) => {
    if (resource.type === 'quiz') {
      navigate(`/quiz/${subnode.id}`, {
        state: { markAsSkip: Boolean(options?.markAsSkip) },
      });
      return;
    }
    if (resource.type === 'article') {
      await openArticleModal(subnode.id, subnode.title, resource.url);
      markLearningActivity(subnode, resource);
      await markResourceOpened(subnode.id);
      return;
    }
    const resolvedUrl = resolveResourceUrl(resource.url);
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      markLearningActivity(subnode, resource);
      await markResourceOpened(subnode.id);
    }
  };

  const handlePanelResourceOpen = async (
    resource: SelectedLearningNode['resources'][number],
    options?: { markAsSkip?: boolean }
  ) => {
    if (!selectedSubnode) return;
    const parentNode = pathData.find((node) => node.subnodes.some((sub) => sub.id === selectedSubnode.id));
    const subnode = parentNode?.subnodes.find((sub) => sub.id === selectedSubnode.id);
    if (!subnode) return;
    await openSubnodeResource(subnode, resource, options);
  };

  useEffect(() => {
    if (!user?.id || !courseId) return;
    persistStoredIds(getQuizStorageKey(user.id), quizCompletedIds);
  }, [quizCompletedIds, user?.id, courseId]);

  useEffect(() => {
    if (!user?.id || !courseId) return;
    persistStoredIds(getResourceStorageKey(user.id), resourceOpenedIds);
  }, [resourceOpenedIds, user?.id, courseId]);

  useEffect(() => {
    if (!courseId) return;
    persistStoredNotes(getQuestionNotesStorageKey(user?.id, courseId), topicNotes);
  }, [topicNotes, user?.id, courseId]);

  useEffect(() => {
    const syncStoredQuizProgress = async () => {
      for (const topicId of quizCompletedIds) {
        await syncTopicCompletion(topicId, resourceOpenedIds, quizCompletedIds);
      }
    };
    if (quizCompletedIds.length > 0) {
      syncStoredQuizProgress();
    }
  }, [quizCompletedIds, pathData]);

  useEffect(() => {
    const syncReadOnlyProgress = async () => {
      for (const topicId of resourceOpenedIds) {
        if (!hasQuizForTopic(topicId)) {
          await syncTopicCompletion(topicId, resourceOpenedIds, quizCompletedIds);
        }
      }
    };
    if (resourceOpenedIds.length > 0 && pathData.length > 0) {
      syncReadOnlyProgress();
    }
  }, [resourceOpenedIds, pathData]);

  const openQuestionEditor = (id: string, title: string) => {
    setQuestionEditorTarget({ id, title });
    setQuestionDraft(topicNotes[id] || '');
  };

  const saveQuestionNote = async () => {
    if (!questionEditorTarget || !courseId) return;
    const nextValue = questionDraft.trim();
    if (nextValue) {
      try {
        await api.post(
          `/feedback`,
          { courseId, topicId: questionEditorTarget.id, content: nextValue }
        );
      } catch (error) {
        console.error('Failed to save feedback:', error);
        alert('Feedback could not be saved.');
        return;
      }
    }
    setTopicNotes((prev) => {
      const next = { ...prev };
      if (nextValue) next[questionEditorTarget.id] = nextValue;
      else delete next[questionEditorTarget.id];
      return next;
    });
    setQuestionEditorTarget(null);
    setQuestionDraft('');
  };

  const trackableIds = Array.from(new Set(
    pathData.flatMap((node) => [node.id, ...node.subnodes.map((sub) => sub.id)])
  ));
  const totalProgress = trackableIds.reduce(
    (acc, id) => {
      const core = getCoreProgress(id);
      return {
        completed: acc.completed + core.completed,
        total: acc.total + core.total,
      };
    },
    { completed: 0, total: 0 }
  );
  const overallProgress = totalProgress.total > 0
    ? Math.min(100, Math.max(0, Math.round((totalProgress.completed / totalProgress.total) * 100)))
    : 0;

  // --- RETRO 80S GRID GENERATION LOGIC ---
  const effectiveWindowWidth = isSyllabusOpen && rawWidth >= 640 ? rawWidth - 380 : rawWidth;
  const isSm = effectiveWindowWidth < 640;
  
  const xPadding = isSm ? 20 : 50;
  
  const availableWidth = effectiveWindowWidth - (xPadding * 2);

  const idealCellWidth = isSm ? 150 : 200;
  // Ensure at least 2 columns on mobile so AI nodes have space to branch left/right
  const calculatedCols = Math.max(isSm ? 2 : 1, Math.floor(availableWidth / idealCellWidth));
  const cols = Math.min(6, calculatedCols);
  
  const coreNodes: any[] = [];
  const aiNodes: any[] = [];
  let currentIndex = 0;

  pathData.forEach((node, mainIndex) => {
    coreNodes.push({
      ...node,
      displayNumber: `T${mainIndex + 1}`,
      isMain: true,
      listIndex: currentIndex++,
      nodeRef: node
    });

    if (activeId === node.id) {
      node.subnodes.forEach((sub, subIndex) => {
        if (sub.type === 'ai') {
          // AI branches out, does not occupy core grid space
          aiNodes.push({
            ...sub,
            displayNumber: `AI.${subIndex + 1}`,
            isMain: false,
            parentId: node.id,
            nodeRef: sub
          });
        } else {
          // Core Prof subtopics stay on the linear grid
          coreNodes.push({
            ...sub,
            displayNumber: `${mainIndex + 1}.${subIndex + 1}`,
            isMain: false,
            parentId: node.id,
            listIndex: currentIndex++,
            nodeRef: sub
          });
        }
      });
    }
  });

  const getGridCoords = (index: number) => {
    const y = Math.floor(index / cols);
    const x = y % 2 === 0 ? index % cols : (cols - 1) - (index % cols);
    return { x, y };
  };

  // Calculate actual columns used so we can dynamically scale the grid to fit the screen
  const maxColIndex = coreNodes.reduce((max, node) => Math.max(max, getGridCoords(node.listIndex).x), 0);
  const actualCols = coreNodes.length > 0 ? maxColIndex + 1 : 1;

  // Fixed padding required to prevent AI branches from clipping.
  // Take more space on mobile to prevent cramming.

  // --- RESPONSIVE GRID CALCULATIONS ---
  // We dynamically adjust the size of the boxes based on the screen width.
  // This ensures that the nodes don't overlap or look cramped.
  const dynamicCellWidth = availableWidth / actualCols;
  const cellWidth = Math.max(120, dynamicCellWidth); 
  const cellHeight = cellWidth * 0.8; // 4:5 ratio

  // Fixed node sizes based on device type so they NEVER shrink when the syllabus drawer opens
  const coreNodeSize = isSm ? 70 : 100;
  const aiNodeSize = coreNodeSize * 0.8;
  const xOffset = xPadding;

  const aiNodesByParent: { [parentId: string]: typeof aiNodes } = {};
  aiNodes.forEach(node => {
    if (!aiNodesByParent[node.parentId]) aiNodesByParent[node.parentId] = [];
    aiNodesByParent[node.parentId].push(node);
  });

  // --- DYNAMIC HEIGHT CALCULATION ---
  // To prevent the AI nodes (red squares) from overlapping with the main curriculum rows below them,
  // we count how many AI nodes are in each row, and calculate exactly how much extra vertical space is needed.
  const maxAiNodesPerRow: { [row: number]: number } = {};
  coreNodes.forEach(node => {
    const coords = getGridCoords(node.listIndex);
    const aiCount = (aiNodesByParent[node.id] || []).length;
    maxAiNodesPerRow[coords.y] = Math.max(maxAiNodesPerRow[coords.y] || 0, aiCount);
  });

  const rowOffsets: { [row: number]: number } = { 0: cellHeight / 2 };
  const maxRows = Math.ceil(coreNodes.length / cols);
  for (let y = 1; y < maxRows; y++) {
    const prevRowAiCount = maxAiNodesPerRow[y - 1] || 0;
    const extraHeight = prevRowAiCount > 0 ? (prevRowAiCount * (aiNodeSize + 30)) : 0;
    rowOffsets[y] = rowOffsets[y - 1] + cellHeight + extraHeight;
  }

  // Pre-calculate exact pixel coordinates for all nodes
  const coreCoordsMap: { [id: string]: { x: number, y: number, px: number, py: number } } = {};
  coreNodes.forEach((node) => {
    const coords = getGridCoords(node.listIndex);
    coreCoordsMap[node.id] = {
      x: coords.x,
      y: coords.y,
      px: coords.x * cellWidth + cellWidth / 2 + xOffset,
      py: rowOffsets[coords.y] || (coords.y * cellHeight + cellHeight / 2)
    };
  });

  const aiCoordsMap: { [id: string]: { px: number, py: number, parentPx: number, parentPy: number, forkY: number } } = {};
  Object.values(aiNodesByParent).forEach((nodesForParent) => {
    nodesForParent.forEach((node, localIdx) => {
      const parentCoords = coreCoordsMap[node.parentId];
      if (parentCoords) {
        // Place on one side to form a single continuous path
        const direction = parentCoords.x === cols - 1 ? -1 : 1;
        const offsetX = (cellWidth / 2) * direction;
        const offsetY = (cellHeight * 0.6) + (localIdx * (aiNodeSize + 30));
        
        aiCoordsMap[node.id] = {
          px: parentCoords.px + offsetX,
          py: parentCoords.py + offsetY,
          parentPx: parentCoords.px,
          parentPy: parentCoords.py,
          forkY: parentCoords.py + (cellHeight * 0.35)
        };
      }
    });
  });

  // Generate Core SVG Paths (Straight lines with juice effect)
  interface CorePath {
    d: string;
    color: string;
    isGlowing: boolean;
    key: string;
  }
  const corePaths: CorePath[] = [];
  for (let i = 0; i < coreNodes.length - 1; i++) {
    const p1 = coreCoordsMap[coreNodes[i].id];
    const p2 = coreCoordsMap[coreNodes[i+1].id];
    const d = `M ${p1.px} ${p1.py} L ${p2.px} ${p2.py}`;
    
    const n2 = coreNodes[i+1];
    
    // Line color matches the destination node's type
    const color = n2.isMain ? '#3A9E3F' : '#3B82F6'; // Green for main, Blue for sub
    
    // Always glow for aesthetic!
    const isGlowing = true;

    corePaths.push({ d, color, isGlowing, key: `core-line-${i}` });
  }

  // Generate AI SVG Paths (Sequential circuit-board path)
  interface AiPath {
    d: string;
    color: string;
    isGlowing: boolean;
    key: string;
  }
  const aiPaths: AiPath[] = [];
  Object.values(aiNodesByParent).forEach((nodesForParent) => {
    nodesForParent.forEach((node, localIdx) => {
      const coords = aiCoordsMap[node.id];
      if (coords) {
        const color = '#EF4444'; // AI paths are always red
        const isGlowing = true; // Always glow for aesthetic!
        
        let d = "";
        if (localIdx === 0) {
          d = `M ${coords.parentPx} ${coords.parentPy} L ${coords.parentPx} ${coords.forkY} L ${coords.px} ${coords.forkY} L ${coords.px} ${coords.py}`;
        } else {
          const prevNode = nodesForParent[localIdx - 1];
          const prevCoords = aiCoordsMap[prevNode.id];
          d = `M ${prevCoords.px} ${prevCoords.py} L ${coords.px} ${coords.py}`;
        }

        aiPaths.push({ d, color, isGlowing, key: `ai-line-${node.id}` });
      }
    });
  });

  const containerWidth = (actualCols * cellWidth) + (xOffset * 2);
  const lastRowY = maxRows > 0 ? rowOffsets[maxRows - 1] : 0;
  const lastRowAiCount = maxAiNodesPerRow[maxRows - 1] || 0;
  const extraBottomHeight = lastRowAiCount > 0 ? (lastRowAiCount * (aiNodeSize + 30)) : 0;
  const containerHeight = Math.max(window.innerHeight, lastRowY + extraBottomHeight + 300);

  if (loading) return <div className="p-20 text-center" style={{ color: "var(--cn-text)" }}>INITIALIZING MAINFRAME...</div>;

  return (
    <div 
      className="min-h-screen font-sans relative" 
      style={{ 
        backgroundColor: 'var(--cn-page)', 
        backgroundImage: 'linear-gradient(var(--cn-border) 1px, transparent 1px), linear-gradient(90deg, var(--cn-border) 1px, transparent 1px)', 
        backgroundSize: '40px 40px',
        width: rawWidth >= 768 ? `${rawWidth}px` : '100%',
        marginLeft: rawWidth >= 768 ? `calc(50% - ${rawWidth / 2}px)` : '0',
      }}
    >
      <style>{`
        @keyframes juiceFlow {
          from { stroke-dashoffset: 40; }
          to { stroke-dashoffset: 0; }
        }
        .juice-line {
          stroke-dasharray: 20 10;
          animation: juiceFlow 0.5s linear infinite;
        }
        .retro-node {
          background: var(--cn-card);
          border: 2px solid;
          font-family: 'Courier New', Courier, monospace;
          text-transform: uppercase;
        }
        .retro-node-main {
          border-color: #3A9E3F;
          color: #3A9E3F;
          box-shadow: 0 0 10px #3A9E3F, inset 0 0 5px #3A9E3F;
        }
        .retro-node-main-dim {
          border-color: #3A9E3F;
          color: #3A9E3F;
          box-shadow: 0 0 10px #3A9E3F, inset 0 0 5px #3A9E3F;
        }
        .retro-node-sub {
          border-color: #3B82F6;
          color: #3B82F6;
          box-shadow: 0 0 10px #3B82F6, inset 0 0 5px #3B82F6;
        }
        .retro-node-sub-dim {
          border-color: #3B82F6;
          color: #3B82F6;
          box-shadow: 0 0 10px #3B82F6, inset 0 0 5px #3B82F6;
        }
        .retro-node-ai {
          border-color: #EF4444;
          color: #EF4444;
          box-shadow: 0 0 10px #EF4444, inset 0 0 5px #EF4444;
        }
        .retro-node-ai-dim {
          border-color: #EF4444;
          color: #EF4444;
          box-shadow: 0 0 10px #EF4444, inset 0 0 5px #EF4444;
        }
        .retro-hud {
          background: var(--cn-card);
          border-bottom: 1px solid var(--cn-border);
          box-shadow: 0 0 15px rgba(0, 0, 0, 0.1);
        }
      `}</style>

      {/* HEADER HUD */}
      <div className="fixed top-[56px] sm:top-[64px] left-0 right-0 z-40 px-2 sm:px-8 py-3 retro-hud flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-1 sm:gap-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-[10px] sm:text-xs font-bold px-1.5 sm:px-3 py-1.5 hover:bg-black/10 border border-transparent rounded transition-colors" style={{ fontFamily: 'Courier New', color: "var(--cn-text)" }}>
            <ChevronLeft size={16} /> <span className="hidden sm:inline">[DASHBOARD]</span>
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-3 py-1.5 border rounded" style={{ borderColor: "var(--cn-border)", background: "var(--cn-bg)" }}>
            <span className="text-[9px] sm:text-xs font-bold font-mono" style={{ color: "var(--cn-text)" }}><span className="hidden sm:inline">SYS.SYNC: </span>{overallProgress}%</span>
            <div className="w-8 sm:w-20 h-1.5 overflow-hidden" style={{ background: "#F5C518" }}>
              <div className="h-full shadow-[0_0_8px_#3A9E3F] transition-all" style={{ width: `${overallProgress}%`, background: "#3A9E3F" }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 font-mono">

            <button onClick={() => setSyllabusOpen(true)} className="text-[8px] sm:text-xs font-bold px-2 sm:px-6 py-1.5 sm:py-2 border text-white shadow-[0_0_10px_#3A9E3F] rounded transition-all" style={{ borderColor: "#3A9E3F", background: "#3A9E3F" }}>[SYLLABUS]</button>
        </div>
      </div>

      <main 
        className={`pb-16 sm:pb-24 flex flex-col items-center pt-24 sm:pt-32 w-full overflow-hidden transition-all duration-500 ease-in-out ${
          isSyllabusOpen ? 'sm:pr-[380px]' : 'pr-0'
        }`}
      >
        <div className="mb-10 text-center pointer-events-none px-4 w-full max-w-4xl mx-auto overflow-hidden">
            <h1 className="text-xl sm:text-4xl font-bold mb-1 font-mono tracking-widest drop-shadow-[0_0_8px_rgba(58,158,63,0.8)] uppercase break-words whitespace-normal" style={{ color: "var(--cn-text)" }}>{courseTitle}</h1>
        </div>

        {/* --- MAIN SVG DIAGRAM --- */}
        {/* We use SVG to draw the glowing connecting lines between topics before rendering the HTML buttons on top */}
        <div className="w-full overflow-x-auto overflow-y-hidden pb-10">
            <div className="relative shrink-0 mx-auto" style={{ width: containerWidth, height: containerHeight }}>
            {/* SVG Connections Layer */}
            <svg className="absolute inset-0 pointer-events-none z-10" width="100%" height="100%">
                {/* Core Paths */}
                {corePaths.map((path) => (
                    <polyline
                        key={path.key}
                        points={path.d.replace(/M |L /g, '')}
                        stroke={path.color}
                        strokeWidth={path.isGlowing ? "4" : "2"}
                        fill="none"
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                        className={path.isGlowing ? "juice-line" : ""}
                        style={path.isGlowing ? { filter: `drop-shadow(0 0 6px ${path.color})` } : {}}
                    />
                ))}

                {/* AI Paths */}
                {aiPaths.map((path) => (
                    <polyline
                        key={path.key}
                        points={path.d.replace(/M |L /g, '')}
                        stroke={path.color}
                        strokeWidth={path.isGlowing ? "4" : "2"}
                        fill="none"
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                        className={path.isGlowing ? "juice-line" : ""}
                        style={path.isGlowing ? { filter: `drop-shadow(0 0 6px ${path.color})` } : {}}
                    />
                ))}
            </svg>

            {/* Draw Core Nodes */}
            {coreNodes.map((node) => {
                const coords = coreCoordsMap[node.id];
                const isComplete = node.isMain ? isNodeComplete(node.nodeRef) : isCoreComplete(node.id);
                
                const isActive = node.isMain && activeId === node.id;
                const isHighlighted = highlightedNodeId === node.id;
                
                return (
                    <div
                        key={node.id}
                        className="absolute flex items-center justify-center transition-all duration-300 z-20 hover:z-50"
                        style={{
                            left: coords.px - (coreNodeSize / 2),
                            top: coords.py - (coreNodeSize / 2),
                            width: coreNodeSize,
                            height: coreNodeSize,
                        }}
                    >
                        <div className="relative group w-full h-full">
                            <button
                                onClick={() => {
                                    if (node.isMain) {
                                        setActiveId(activeId === node.id ? null : node.id);
                                        setHighlightedNodeId(null);
                                    } else {
                                        setHighlightedNodeId(node.id);
                                        setSyllabusOpen(true);
                                        setSelectedSubnode({
                                            id: node.id,
                                            name: node.title,
                                            color: 'blue',
                                            resources: node.resources,
                                            completed: isCoreComplete(node.id),
                                            quizCompleted: isQuizFinished(node.id),
                                        });
                                    }
                                }}
                                className={`w-full h-full flex items-center justify-center rounded retro-node transition-transform duration-200 hover:scale-110
                                    ${node.isMain 
                                        ? (isComplete || isActive ? 'retro-node-main' : 'retro-node-main-dim') 
                                        : (isComplete ? 'retro-node-sub' : 'retro-node-sub-dim')}
                                    ${isActive ? 'scale-125 !bg-[#3A9E3F] !text-white' : ''}
                                    ${isHighlighted ? 'scale-110 ring-2 ring-white ring-offset-1' : ''}
                                `}
                            >
                                <span className="font-bold text-base sm:text-lg">{node.displayNumber}</span>
                            </button>

                            {/* Hover Tooltip for Title */}
                            <div 
                                className={`absolute top-full left-1/2 -translate-x-1/2 mt-3 w-max max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity border text-xs sm:text-sm font-bold text-center p-2 rounded-sm pointer-events-none z-50 font-mono shadow-md
                                ${node.isMain ? 'border-[#3A9E3F] text-[#3A9E3F] shadow-[0_0_10px_#3A9E3F]' : 'border-[#3B82F6] text-[#3B82F6] shadow-[0_0_10px_#3B82F6]'}
                                `}
                                style={{ background: 'var(--cn-page)' }}
                            >
                                {node.title}
                            </div>
                            
                            {/* Student question marker */}
                            <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openQuestionEditor(node.id, node.title);
                                }}
                                className={`absolute -top-2 -right-2 w-[30%] h-[30%] min-w-6 min-h-6 max-w-8 max-h-8 rounded-full text-[10px] sm:text-[11px] flex items-center justify-center font-black shadow-md border transition-all z-30
                                  ${topicNotes[node.id] ? 'bg-red-500 text-white border-red-400' : 'bg-red-500 text-white border-red-400 hover:bg-red-600'}`}
                                title={topicNotes[node.id] ? 'Edit question/note' : 'Add question/note'}
                                aria-label="Topic question note"
                            >
                                ?
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* Draw AI Nodes */}
            {aiNodes.map((node) => {
                const coords = aiCoordsMap[node.id];
                if (!coords) return null;
                const isComplete = isCoreComplete(node.id);
                const isHighlighted = highlightedNodeId === node.id;
                
                return (
                    <div
                        key={node.id}
                        className="absolute flex items-center justify-center transition-all duration-300 z-20 hover:z-50"
                        style={{
                            left: coords.px - (aiNodeSize / 2),
                            top: coords.py - (aiNodeSize / 2),
                            width: aiNodeSize,
                            height: aiNodeSize,
                        }}
                    >
                        <div className="relative group w-full h-full">
                            <button
                                onClick={() => {
                                    setHighlightedNodeId(node.id);
                                    setSyllabusOpen(true);
                                    setSelectedSubnode({
                                        id: node.id,
                                        name: node.title,
                                        color: 'red',
                                        resources: node.resources,
                                        completed: isCoreComplete(node.id),
                                        quizCompleted: isQuizFinished(node.id),
                                    });
                                }}
                                className={`w-full h-full flex items-center justify-center rounded retro-node transition-transform duration-200 hover:scale-110 
                                    ${isComplete ? 'retro-node-ai' : 'retro-node-ai-dim'}
                                    ${isHighlighted ? 'scale-110 ring-2 ring-white ring-offset-1' : ''}
                                `}
                            >
                                <span className="font-bold text-xs sm:text-sm">{node.displayNumber}</span>
                            </button>

                            {/* Hover Tooltip for Title */}
                            <div 
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity border border-[#EF4444] text-[#EF4444] text-xs sm:text-sm font-bold text-center p-2 rounded-sm pointer-events-none z-50 font-mono shadow-[0_0_10px_#EF4444]"
                                style={{ background: 'var(--cn-page)' }}
                            >
                                [AI SYNC] {node.title}
                            </div>

                            {/* Student question marker */}
                            <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openQuestionEditor(node.id, node.title);
                                }}
                                className={`absolute -top-2 -right-2 w-[30%] h-[30%] min-w-6 min-h-6 max-w-8 max-h-8 rounded-full text-[10px] flex items-center justify-center font-black shadow-md border transition-all z-30
                                  ${topicNotes[node.id] ? 'bg-red-500 text-white border-red-400' : 'bg-red-500 text-white border-red-400 hover:bg-red-600'}`}
                                title={topicNotes[node.id] ? 'Edit question/note' : 'Add question/note'}
                                aria-label="Topic question note"
                            >
                                ?
                            </button>
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
      </main>

      <SyllabusDrawer
        isOpen={isSyllabusOpen}
        onClose={() => {
          setSyllabusOpen(false);
          setHighlightedNodeId(null);
        }}
        pathData={pathData}
        activeId={activeId}
        highlightedNodeId={highlightedNodeId}
        onSelectTopic={(id) => setActiveId(id)}
        onOpenNodeDetail={(node) => setSelectedSubnode(node)}
        onOpenResource={async (nodeInfo, resource) => {
          if (resource.type === 'quiz') {
            navigate(`/quiz/${nodeInfo.id}`);
            return;
          }
          if (resource.type === 'article') {
            await openArticleModal(nodeInfo.id, nodeInfo.title, resource.url);
            markLearningActivity(nodeInfo as any, resource as any);
            await markResourceOpened(nodeInfo.id);
            return;
          }
          const resolvedUrl = resolveResourceUrl(resource.url);
          if (resolvedUrl) {
            window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
            markLearningActivity(nodeInfo as any, resource as any);
            await markResourceOpened(nodeInfo.id);
          }
        }}
        completedIds={completedIds}
        resourceOpenedIds={resourceOpenedIds}
        quizCompletedIds={quizCompletedIds}
        overallProgress={overallProgress}
      />
      <TopicAbstractModal activeContent={activePopupContent} onClose={() => setActivePopupContent(null)} />
      {selectedSubnode && (
        <NodeDetailPanel
          isOpen={!!selectedSubnode}
          onClose={() => setSelectedSubnode(null)}
          nodeName={selectedSubnode.name}
          nodeColor={selectedSubnode.color}
          resources={selectedSubnode.resources.map((resource, index) => ({
            ...resource,
            duration: getResourceTypeLabel(resource.type),
            estimatedTime: formatLearningTime(resource.estimatedMinutes) || estimateLearningTime(selectedSubnode.id, resource.type, resource.title, index),
          }))}
          completed={selectedSubnode.completed}
          quizCompleted={selectedSubnode.quizCompleted}
          onOpenResource={handlePanelResourceOpen}
        />
      )}

      {questionEditorTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-sm border border-[#F5C518] bg-[#1a1a1a] p-4 shadow-[0_0_20px_#F5C518]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#F5C518]/70 font-mono">SYS.QUERY // INPUT</p>
            <p className="mt-1 text-sm font-bold text-[#F5C518] font-mono">{questionEditorTarget.title}</p>
            <textarea
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              placeholder="ENTER COMMAND..."
              className="mt-3 w-full min-h-28 rounded-sm border border-[#F5C518]/30 bg-black px-3 py-2 text-sm outline-none focus:border-[#F5C518] focus:shadow-[0_0_10px_#F5C518] text-[#F5C518] font-mono resize-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setQuestionEditorTarget(null); setQuestionDraft(''); }} className="px-3 py-1.5 text-xs font-bold uppercase text-[#F5C518]/70 hover:text-[#F5C518] font-mono">ABORT</button>
              <button onClick={saveQuestionNote} className="px-4 py-1.5 bg-[#F5C518] text-black text-xs font-black uppercase hover:bg-white transition-colors font-mono shadow-[0_0_10px_#F5C518]">EXECUTE</button>
            </div>
          </div>
        </div>
      )}

      {showGuide && (
        <GuideOverlay
          onClose={closeGuide}
          arrows={[
            { d: 'M21 20 C27 27 34 34 42 41' },
            { d: 'M79 18 C75 16 72 15 68 14' },
            { d: 'M73 82 C77 78 80 74 83 70' },
          ]}
          steps={[
            {
              number: 1,
              title: 'Retro Map',
              className: 'left-4 top-32 lg:left-12',
              body: <p>Click glowing nodes to open topics, subtopics, resources, and quizzes.</p>,
            },
            {
              number: 2,
              title: 'Syllabus',
              className: 'right-4 top-28 lg:right-16',
              body: <p>Open the syllabus to scan the full course and your progress.</p>,
            },
            {
              number: 3,
              title: 'Study Assistant',
              className: 'right-4 bottom-28 lg:right-20',
              body: <p>Use the assistant for course questions while you study.</p>,
            },
          ]}
        />
      )}

      <AiChatCompanion courseId={courseId || ""} courseTitle={courseTitle} topics={pathData} />
    </div>
  );
}