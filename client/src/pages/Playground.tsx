import { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import SyllabusDrawer from '../components/SyllabusDrawer';
import TopicAbstractModal from '../components/TopicAbstractModal';
import NodeDetailPanel from '../components/NodeDetailPanel';
import AiChatCompanion from '../components/AiChatCompanion';
import { MonitorPlay, BookOpen, Headphones, ChevronLeft } from 'lucide-react';

const API = 'http://localhost:3000/api';
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

export default function Playground() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [courseTitle, setCourseTitle] = useState("Loading Course...");
  const [pathData, setPathData] = useState<MainTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyllabusOpen, setSyllabusOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [activePopupContent, setActivePopupContent] = useState<{title: string, content: string} | null>(null);
  const [resourceOpenedIds, setResourceOpenedIds] = useState<string[]>([]);
  const [quizCompletedIds, setQuizCompletedIds] = useState<string[]>([]);
  const [selectedSubnode, setSelectedSubnode] = useState<SelectedLearningNode | null>(null);
  const [topicNotes, setTopicNotes] = useState<Record<string, string>>({});
  const [questionEditorTarget, setQuestionEditorTarget] = useState<QuestionEditorTarget | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');

  // These keys store lightweight per-user learning state in localStorage.
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

  // Convert backend-local assets like /uploads/... into full browser URLs.
  const resolveResourceUrl = (url?: string) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return `${API_ORIGIN}/${url}`;
  };

  // External links open directly.
  // Uploaded PDFs and generated source content are shown inside the modal.
  const openArticleModal = async (topicId: string, title: string, fallbackUrl?: string) => {
    const resolvedUrl = resolveResourceUrl(fallbackUrl);

    if (resolvedUrl && !fallbackUrl?.includes('/uploads/')) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/topics/${topicId}/content?lang=en`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
    // Restore student question notes for this exact course and user.
    setTopicNotes(loadStoredNotes(getQuestionNotesStorageKey(parsedUser?.id, courseId)));
  }, [courseId]);

  useEffect(() => {
    const fetchCourseData = async () => {
      try {
        const token = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');
        const parsedUser = savedUser ? JSON.parse(savedUser) : null;
        const [courseRes, progressRes] = await Promise.all([
          axios.get(`http://localhost:3000/api/courses/${courseId}`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`http://localhost:3000/api/progress`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        const dbCourse = courseRes.data;
        setCourseTitle(dbCourse.title);

        const backendCompleted = progressRes.data
          .filter((p: any) => p.topic?.courseId === courseId && p.completed)
          .map((p: any) => p.topicId);
        setCompletedIds(backendCompleted);

        // Convert backend topics into the node/tree structure used by the student view.
        const transformedData: MainTopic[] = dbCourse.topics.map((topic: any, index: number) => {
          let mappedSubtopics: Subnode[] = (topic.subtopics || []).map((sub: any) => ({
            id: sub.id,
            title: sub.name,
            type: sub.aiSuggested ? 'ai' : 'prof',
            status: backendCompleted.includes(topic.id) ? 'completed' : 'current',
            hasArticle: Boolean(sub.articleUrl || sub.wikidataId || sub.content),
            hasQuiz: Array.isArray(sub.quizzes) && sub.quizzes.length > 0,
            resources: [
              ...(sub.videoUrl ? [{ type: 'video', title: sub.name, url: sub.videoUrl }] : []),
              ...((sub.articleUrl || sub.wikidataId || sub.content) ? [{ type: 'article', title: sub.name, url: sub.articleUrl }] : []),
              ...(sub.podcastUrl ? [{ type: 'podcast', title: sub.name, url: sub.podcastUrl }] : []),
              ...((Array.isArray(sub.quizzes) && sub.quizzes.length > 0) ? [{ type: 'quiz', title: 'Knowledge Check', url: '#' }] : [])
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
              ...(topic.videoUrl ? [{ type: 'video', title: topic.name, url: topic.videoUrl }] : []),
              ...((topic.articleUrl || topic.wikidataId || topic.content) ? [{ type: 'article', title: topic.name, url: topic.articleUrl }] : []),
              ...(topic.podcastUrl ? [{ type: 'podcast', title: topic.name, url: topic.podcastUrl }] : []),
              ...((Array.isArray(topic.quizzes) && topic.quizzes.length > 0) ? [{ type: 'quiz', title: 'Knowledge Check', url: '#' }] : [])
            ],
            status: index === 0 ? 'current' : 'locked',
            progress: { completed: backendCompleted.includes(topic.id) ? 1 : 0, total: 1 },
            subnodes: mappedSubtopics
          };
        });

        // Limit local progress state to real nodes that still exist in this course.
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

      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:3000/api/progress`, { topicId, completed: true }, { headers: { Authorization: `Bearer ${token}` } });
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

  // A topic is "complete" when its resources have been opened and its quiz (if any) has been completed.
  const isResourceOpened = (topicId: string) => resourceOpenedIds.includes(topicId) || completedIds.includes(topicId);
  const isQuizFinished = (topicId: string) => quizCompletedIds.includes(topicId) || completedIds.includes(topicId);

  // For parent nodes, all subnodes must be complete to unlock the parent as "complete".
  const isCoreComplete = (topicId: string) => {
    const requiresQuiz = hasQuizForTopic(topicId);
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    
    if (!requiresQuiz && !requiresResource) return true;
    
    const resourceDone = !requiresResource || isResourceOpened(topicId);
    const quizDone = !requiresQuiz || isQuizFinished(topicId);
    
    return resourceDone && quizDone;
  };

  // Progress can move partially: resource step and quiz step (if required).
  const getCoreProgress = (topicId: string) => {
    const requiresQuiz = hasQuizForTopic(topicId);
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    
    const completed = (requiresResource && isResourceOpened(topicId) ? 1 : 0) + (requiresQuiz && isQuizFinished(topicId) ? 1 : 0);
    const total = (requiresResource ? 1 : 0) + (requiresQuiz ? 1 : 0);
    
    return { completed, total };
  };

  // A node with subnodes is only "complete" when all subnodes are complete. Otherwise it's based on its own status.
  const isNodeComplete = (node: MainTopic) => {
    if (node.subnodes.length > 0) {
      return node.subnodes.every((sub) => isCoreComplete(sub.id));
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

  // Opening a learning resource counts as the "resource completed" half of a node.
  const markResourceOpened = async (topicId: string) => {
    const nextIds = resourceOpenedIds.includes(topicId) ? resourceOpenedIds : [...resourceOpenedIds, topicId];
    setResourceOpenedIds(nextIds);
    if (user?.id) {
      persistStoredIds(getResourceStorageKey(user.id), nextIds);
    }
    await syncTopicCompletion(topicId, nextIds, quizCompletedIds);
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
      await markResourceOpened(subnode.id);
      return;
    }

    const resolvedUrl = resolveResourceUrl(resource.url);
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
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
    // Persist notes so question markers remain visible after reload.
    persistStoredNotes(getQuestionNotesStorageKey(user?.id, courseId), topicNotes);
  }, [topicNotes, user?.id, courseId]);

  useEffect(() => {
    const syncStoredQuizProgress = async () => {
      // Re-hydrate full completion for nodes whose quiz was already finished earlier.
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
      // Nodes without a quiz can become fully complete from resource access alone.
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
        const token = localStorage.getItem('token');
        await axios.post(
          `${API}/feedback`,
          {
            courseId,
            topicId: questionEditorTarget.id,
            content: nextValue,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
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

  const getNodeProgress = (node: MainTopic) => {
    const main = getCoreProgress(node.id);
    const subTotals = node.subnodes.reduce(
      (acc, sub) => {
        const part = getCoreProgress(sub.id);
        return {
          completed: acc.completed + part.completed,
          total: acc.total + part.total,
        };
      },
      { completed: 0, total: 0 }
    );

    return {
      completed: main.completed + subTotals.completed,
      total: main.total + subTotals.total,
    };
  };

  const isBranchCompleted = (node: MainTopic) => (
    isNodeComplete(node)
  );

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

  if (loading) return <div className="p-20 text-center text-white">Loading your Playground...</div>;

  return (
    <div className="min-h-screen font-sans transition-colors" style={{ background: "var(--cn-page)" }}>
      {/* HEADER HUD */}
      <div className="fixed top-[56px] sm:top-[64px] left-0 right-0 z-40 px-4 sm:px-8 py-3 border-b flex items-center justify-between shadow-sm" style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: "var(--cn-muted)" }}>
            <ChevronLeft size={16} /> Dashboard
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--cn-text)" }}>{overallProgress}%</span>
            <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: "var(--cn-border)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${overallProgress}%`, background: "#F5C518" }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/retro/${courseId}`)} className="font-mono font-bold text-xs sm:text-sm px-4 sm:px-6 py-2 rounded-xl border hover:opacity-80 transition-opacity uppercase shadow-sm" style={{ backgroundColor: "var(--cn-page)", color: "var(--cn-text)", borderColor: "var(--cn-border)" }}>
            [RETRO MODE]
          </button>
          <button onClick={() => setSyllabusOpen(true)} className="font-bold text-xs sm:text-sm px-6 py-2 rounded-xl text-white bg-[#2563EB]">SYLLABUS</button>
        </div>
      </div>

      <main className="pb-16 sm:pb-24 flex flex-col items-center px-3 sm:px-4 pt-16 sm:pt-20">
        <div className="mb-10 mt-4 text-center px-4 max-w-4xl">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight drop-shadow-sm" style={{ color: "var(--cn-text)" }}>{courseTitle}</h1>
        </div>

        {pathData.map((node, index) => (
          <div key={node.id} className="flex flex-col items-center w-full max-w-5xl">
            <div className="relative z-20">
              <button
                onClick={() => {
                  setActiveId(activeId === node.id ? null : node.id);
                }}
                style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
                className={`w-28 h-24 sm:w-40 sm:h-36 flex flex-col items-center justify-center p-3 text-center transition-all duration-300 shadow-xl
                  ${activeId === node.id ? 'bg-green-500 scale-110 ring-4 ring-yellow-400' : 'bg-green-600 brightness-75'}
                `}
              >
                {isBranchCompleted(node) && (
                  <span className="mb-1 rounded-full bg-green-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-green-700">
                    Done
                  </span>
                )}
                <span className="text-white font-black text-[9px] sm:text-xs uppercase px-2">{node.title}</span>
                <span className="text-white text-[9px] mt-1 opacity-90">
                  {getNodeProgress(node).completed}/{getNodeProgress(node).total}
                </span>
              </button>
              {/* Student question marker in Playground (outside Syllabus). */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openQuestionEditor(node.id, node.title);
                }}
                className={`absolute -top-2 -right-2 h-7 w-7 rounded-full text-[11px] font-black shadow-md border transition-all ${topicNotes[node.id] ? 'bg-red-500 text-white border-red-400' : 'bg-red-500 text-white border-red-400 hover:bg-red-600'}`}
                title={topicNotes[node.id] ? 'Edit question/note' : 'Add question/note'}
                aria-label="Topic question note"
              >
                ?
              </button>

            </div>

            {/* Subnodes */}
            {activeId === node.id && (
              <>
                <div className="mt-5 flex gap-3 p-2.5 rounded-2xl bg-white dark:bg-gray-800 border shadow-lg z-10">
                  <button onClick={async () => { const v = node.resources.find(r => r.type === 'video'); const url = resolveResourceUrl(v?.url); if(url) { window.open(url, '_blank', 'noopener,noreferrer'); await markResourceOpened(node.id); } }} className={`p-1.5 transition-all ${node.resources.some(r => r.type === 'video') ? 'text-blue-500' : 'text-gray-300'}`}><MonitorPlay size={18} /></button>
                  <button
                    onClick={async () => {
                      const a = node.resources.find(r => r.type === 'article');
                      await openArticleModal(node.id, node.title, a?.url);
                      await markResourceOpened(node.id);
                    }}
                    className={`p-1.5 transition-all ${node.hasArticle ? 'text-blue-500' : 'text-gray-300'}`}
                  >
                    <BookOpen size={18} />
                  </button>
                  <button onClick={async () => { const p = node.resources.find(r => r.type === 'podcast'); const url = resolveResourceUrl(p?.url); if(url) { window.open(url, '_blank', 'noopener,noreferrer'); await markResourceOpened(node.id); } }} className={`p-1.5 transition-all ${node.resources.some(r => r.type === 'podcast') ? 'text-blue-500' : 'text-gray-300'}`}><Headphones size={18} /></button>
                  {node.hasQuiz && (
                    <button onClick={() => navigate(`/quiz/${node.id}`)} className="p-1.5 text-red-500 font-black text-xs hover:scale-125 transition-all">
                      {isQuizFinished(node.id) ? 'Q✓' : 'Q'}
                    </button>
                  )}
                </div>

                {node.subnodes.length > 0 && (
                  <div className="w-0.5 sm:w-1 h-6 sm:h-10 z-10" style={{ background: isNodeComplete(node) ? "#3A9E3F" : "#F5C518" }} />
                )}
              </>
            )}

            {activeId === node.id && node.subnodes.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center items-center gap-10 sm:gap-12 my-6 w-full animate-in fade-in slide-in-from-bottom-4">
                {node.subnodes.map((sub) => (
                  <div key={sub.id} className="flex flex-col items-center relative">
                    <button
                      onClick={() => {
                        setSelectedSubnode({
                          id: sub.id,
                          name: sub.title,
                          color: sub.type === 'ai' ? 'red' : 'blue',
                          resources: sub.resources,
                          completed: isCoreComplete(sub.id),
                          quizCompleted: isQuizFinished(sub.id),
                        });
                      }}
                      className={`w-20 h-20 sm:w-32 sm:h-32 rotate-45 rounded-xl flex items-center justify-center shadow-xl transition-all duration-500 relative z-20 hover:scale-110
                        ${sub.type === 'ai' ? 'bg-red-500' : 'bg-blue-600'}
                        ${isCoreComplete(sub.id) ? 'ring-4 ring-green-400' : ''}
                      `}
                    >
                      <div className="-rotate-45 text-center p-2">
                        {isCoreComplete(sub.id) && <span className="text-white text-[8px] font-black mb-1 bg-green-600 px-1 rounded uppercase">DONE ✔️</span>}
                        <span className="text-white font-black text-[9px] sm:text-[11px] leading-tight line-clamp-3 uppercase">{sub.title}</span>
                      </div>
                    </button>
                    {/* Student question marker per subtopic in Playground. */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openQuestionEditor(sub.id, sub.title);
                      }}
                      className={`absolute -top-3 -right-2 h-7 w-7 rounded-full text-[11px] font-black shadow-md border transition-all z-30 ${topicNotes[sub.id] ? 'bg-red-500 text-white border-red-400' : 'bg-red-500 text-white border-red-400 hover:bg-red-600'}`}
                      title={topicNotes[sub.id] ? 'Edit question/note' : 'Add question/note'}
                      aria-label="Subtopic question note"
                    >
                      ?
                    </button>

                    {sub.type === 'ai' && (
                      <div className="mt-5 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-red-200" style={{ background: '#FEF2F2', color: '#EF4444' }}>
                        AI suggested
                      </div>
                    )}

                    <div className="mt-5 flex gap-3 p-2.5 rounded-2xl bg-white dark:bg-gray-800 border shadow-lg z-10">
                      <button
                        onClick={async () => {
                          const v = sub.resources.find((resource) => resource.type === 'video');
                          if (v) await openSubnodeResource(sub, v);
                        }}
                        className={`p-1.5 transition-all ${sub.resources.some((resource) => resource.type === 'video') ? 'text-blue-500' : 'text-gray-300'}`}
                      >
                        <MonitorPlay size={18} />
                      </button>
                      <button
                        onClick={async () => {
                          const a = sub.resources.find((resource) => resource.type === 'article');
                          if (a) await openSubnodeResource(sub, a);
                        }}
                        className={`p-1.5 transition-all ${sub.hasArticle ? 'text-blue-500' : 'text-gray-300'}`}
                      >
                        <BookOpen size={18} />
                      </button>
                      <button
                        onClick={async () => {
                          const p = sub.resources.find((resource) => resource.type === 'podcast');
                          if (p) await openSubnodeResource(sub, p);
                        }}
                        className={`p-1.5 transition-all ${sub.resources.some((resource) => resource.type === 'podcast') ? 'text-blue-500' : 'text-gray-300'}`}
                      >
                        <Headphones size={18} />
                      </button>
                      {sub.hasQuiz && (
                        <button
                          onClick={() => navigate(`/quiz/${sub.id}`)}
                          className="p-1.5 text-red-500 font-black text-xs hover:scale-125 transition-all"
                        >
                          {isQuizFinished(sub.id) ? 'Q✓' : 'Q'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {index < pathData.length - 1 && (
              <div className="w-0.5 sm:w-1 h-10 sm:h-16 my-4 opacity-30 rounded-full" style={{ background: isNodeComplete(node) ? "#3A9E3F50" : "#F5C51850" }} />
            )}
          </div>
        ))}
      </main>

      <SyllabusDrawer
        isOpen={isSyllabusOpen}
        onClose={() => setSyllabusOpen(false)}
        pathData={pathData}
        activeId={activeId}
        onSelectTopic={(id) => setActiveId(id)}
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
          resources={selectedSubnode.resources.map((resource) => ({
            ...resource,
            duration: resource.type === 'video' ? 'Video Resource' : resource.type === 'article' ? 'Reading Material' : resource.type === 'podcast' ? 'Audio Resource' : 'Required to pass',
          }))}
          completed={selectedSubnode.completed}
          quizCompleted={selectedSubnode.quizCompleted}
          onOpenResource={handlePanelResourceOpen}
        />
      )}

      {questionEditorTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border bg-white dark:bg-gray-800 dark:border-gray-700 p-4 shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Question / Note</p>
            <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{questionEditorTarget.title}</p>
            {/* Input field requested by the user when pressing question mark. */}
            <textarea
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              placeholder="Type your question or short note here..."
              className="mt-3 w-full min-h-28 rounded-xl border dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:text-white"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setQuestionEditorTarget(null);
                  setQuestionDraft('');
                }}
                className="px-3 py-1.5 text-xs font-bold uppercase text-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={saveQuestionNote}
                className="px-4 py-1.5 rounded-lg bg-[#F5C518] text-xs font-black uppercase text-slate-900"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating RAG Study Companion Chatbot */}
      <AiChatCompanion
        courseId={courseId || ""}
        courseTitle={courseTitle}
        topics={pathData}
      />
    </div>
  );
}
