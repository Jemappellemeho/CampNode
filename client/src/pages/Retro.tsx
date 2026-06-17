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

// ============================================================================
// COMPONENT: Retro
// ============================================================================
// This component renders the "Retro Mode" learning interface.
// It creates a dynamic, circuit-board style SVG diagram connecting main topics 
// and AI-suggested branches, giving the course a gamified "cyber" look.
export default function Retro() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  // ============================================================================
  // USER & COURSE STATE
  // ============================================================================
  
  // Holds the logged-in user's details. If they aren't logged in, they get redirected.
  const [user, setUser] = useState<any>(null);
  
  // The name of the course displayed at the very top of the screen.
  const [courseTitle, setCourseTitle] = useState("Loading Course...");
  
  // 'pathData' holds the fully processed list of topics and subtopics for this course.
  // It is the primary data source used to draw the entire map.
  const [pathData, setPathData] = useState<MainTopic[]>([]);
  
  // 'activeId' is the ID of the main topic the user is currently looking at.
  // We use this to decide which sub-topics should branch out on the map.
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Controls whether the side drawer (the Syllabus) is open or closed.
  const [isSyllabusOpen, setSyllabusOpen] = useState(false);
  
  // When a user hovers over a node on the map, we track its ID here to highlight it.
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  
  // Determines if the initial "INITIALIZING MAINFRAME..." loading screen is showing.
  const [loading, setLoading] = useState(true);

  // ============================================================================
  // PROGRESS & TRACKING STATE
  // ============================================================================
  
  // A list of topic IDs that the user has fully completed. This comes from the server.
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  
  // Holds the text content for the pop-up modal when a user reads an article.
  const [activePopupContent, setActivePopupContent] = useState<{title: string, content: string} | null>(null);
  
  // A list of resource IDs (like videos or articles) that the user has opened.
  // We track this locally so they don't have to re-open things if they refresh.
  const [resourceOpenedIds, setResourceOpenedIds] = useState<string[]>([]);
  
  // A list of quiz IDs that the user has passed. Also tracked locally for instant feedback.
  const [quizCompletedIds, setQuizCompletedIds] = useState<string[]>([]);
  
  // When the user clicks on a subnode, we store its data here so the "NodeDetailPanel" can display it.
  const [selectedSubnode, setSelectedSubnode] = useState<SelectedLearningNode | null>(null);

  // ============================================================================
  // NOTES & FEEDBACK STATE
  // ============================================================================
  
  // A dictionary storing the student's notes or feedback for specific topics.
  // Example: { "topic_123": "This was hard to understand." }
  const [topicNotes, setTopicNotes] = useState<Record<string, string>>({});
  
  // The topic the user is currently writing a note/feedback for.
  const [questionEditorTarget, setQuestionEditorTarget] = useState<QuestionEditorTarget | null>(null);
  
  // The live text the user is typing into the note editor.
  const [questionDraft, setQuestionDraft] = useState('');
  
  // Controls the visibility of the visual guide/tutorial overlay.
  const [showGuide, setShowGuide] = useState(false);

  // ============================================================================
  // RESPONSIVE SCREEN SIZING
  // ============================================================================
  // We need to know exactly how wide the screen is, because when the syllabus opens,
  // the map has to shrink and rearrange its nodes so nothing gets covered up.
  const getRawWidth = () => document.documentElement.clientWidth || window.innerWidth;
  const [rawWidth, setRawWidth] = useState(getRawWidth());

  useEffect(() => {
    // Whenever the browser window resizes, update our state so the map redraws instantly.
    const handleResize = () => setRawWidth(getRawWidth());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============================================================================
  // LOCAL STORAGE HELPERS
  // ============================================================================
  // We use the browser's local storage to save progress on resources and quizzes
  // so the screen doesn't feel sluggish waiting for the server on every click.
  const getResourceStorageKey = (userId?: string) => `campnode:resource-opened:${userId || 'anon'}`;
  const getQuizStorageKey = (userId?: string) => `campnode:quiz-completed:${userId || 'anon'}`;
  const getQuestionNotesStorageKey = (userId?: string, currentCourseId?: string) => `campnode:question-notes:${userId || 'anon'}:${currentCourseId || 'unknown'}`;

  // Helper to read lists of IDs from local storage
  const loadStoredIds = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };

  // Helper to write lists of IDs to local storage (removes duplicates automatically)
  const persistStoredIds = (key: string, ids: string[]) => {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))));
  };

  // Helper to read notes from local storage
  const loadStoredNotes = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  // Helper to write notes to local storage
  const persistStoredNotes = (key: string, notes: Record<string, string>) => {
    localStorage.setItem(key, JSON.stringify(notes));
  };

  // ============================================================================
  // RESOURCE URL RESOLVER
  // ============================================================================
  // Cleans up URLs. If it's an uploaded file (starts with '/'), we attach our server's address to it.
  const resolveResourceUrl = (url?: string) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return `${API_ORIGIN}/${url}`;
  };

  // ============================================================================
  // ARTICLE VIEWER
  // ============================================================================
  // If an article is external, we open it in a new tab.
  // If it's internal wiki content, we fetch it from the server and show it in a pop-up modal.
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

  // ============================================================================
  // SIDE EFFECTS
  // ============================================================================

  // Effect: Security check on load
  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) {}
    } else {
      navigate('/login');
    }
  }, [navigate]);

  // Effect: Tutorial Guide
  useEffect(() => {
    if (user && pathData.length > 0 && !hasSeenGuide(user, 'student-course')) {
      setShowGuide(true);
    }
  }, [user, pathData.length]);

  const closeGuide = () => {
    markGuideSeen(user, 'student-course');
    setShowGuide(false);
  };

  // Effect: Load Local Storage Data
  // When the course first loads, we pull all the saved progress from the browser's memory.
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

  // Effect: Fetch Course Data
  // This is the heavy lifter. It fetches the course from the server and reshapes the data
  // into a format (`pathData`) that is easy for the interactive map and the syllabus to draw.
  useEffect(() => {
    const fetchCourseData = async () => {
      try {
        const savedUser = localStorage.getItem('user');
        const parsedUser = savedUser ? JSON.parse(savedUser) : null;
        
        // Fetch both the course structure and the student's progress at the same time
        const [courseRes, progressRes] = await Promise.all([
          api.get(`/courses/${courseId}`),
          api.get(`/progress`)
        ]);

        const dbCourse = courseRes.data;
        setCourseTitle(dbCourse.title);

        // Find which topics the server officially says are done
        const backendCompleted = progressRes.data
          .filter((p: any) => p.topic?.courseId === courseId && p.completed)
          .map((p: any) => p.topicId);
        setCompletedIds(backendCompleted);

        // Reshape the raw database topics into `MainTopic` objects with standardized resources
        const transformedData: MainTopic[] = dbCourse.topics.map((topic: any, index: number) => {
          
          // Map subtopics first
          let mappedSubtopics: Subnode[] = (topic.subtopics || []).map((sub: any) => ({
            id: sub.id,
            title: sub.name,
            type: sub.aiSuggested ? 'ai' : 'prof',
            status: backendCompleted.includes(topic.id) ? 'completed' : 'current',
            hasArticle: Boolean(sub.articleUrl || sub.wikidataId || sub.content),
            hasQuiz: Array.isArray(sub.quizzes) && sub.quizzes.length > 0,
            
            // Standardize resources into a clean array
            resources: [
              ...(sub.videoUrl ? [{ type: 'video', title: sub.name, url: sub.videoUrl, estimatedMinutes: sub.videoMinutes }] : []),
              ...((sub.articleUrl || sub.wikidataId || sub.content) ? [{ type: 'article', title: sub.name, url: sub.articleUrl, estimatedMinutes: sub.articleMinutes }] : []),
              ...(sub.podcastUrl ? [{ type: 'podcast', title: sub.name, url: sub.podcastUrl, estimatedMinutes: sub.podcastMinutes }] : []),
              ...((Array.isArray(sub.quizzes) && sub.quizzes.length > 0) ? [{ type: 'quiz', title: 'Knowledge Check', url: '#', estimatedMinutes: sub.quizMinutes }] : [])
            ]
          }));

          // Return the shaped main topic
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
            // The first topic is unlocked ('current') by default, others are 'locked' until reached
            status: index === 0 ? 'current' : 'locked',
            progress: { completed: backendCompleted.includes(topic.id) ? 1 : 0, total: 1 },
            subnodes: mappedSubtopics
          };
        });

        // Collect all IDs so we know what is valid in this course
        const currentTrackableIds = Array.from(new Set(
          transformedData.flatMap((node) => [node.id, ...node.subnodes.map((sub) => sub.id)])
        ));

        // If the server says a topic is complete, we automatically mark its resources as opened locally
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

        // Expand the first node by default so the map has branches showing
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

  // ============================================================================
  // PROGRESS TRACKING LOGIC
  // ============================================================================

  // Saves user progress for a specific topic to the backend when completed.
  const saveTopicCompletion = async (topicId: string) => {
    try {
      // Don't send progress if the topic doesn't exist in our map
      const isKnownTopic = pathData.some((node) => node.id === topicId || node.subnodes.some((sub) => sub.id === topicId));
      if (!isKnownTopic) return;

      // Tell the server we finished it
      await api.post(`/progress`, { topicId, completed: true });
      
      // Update our local state so the screen reflects the completion immediately
      setCompletedIds(prev => (prev.includes(topicId) ? prev : [...prev, topicId]));
    } catch (err) { console.error("Progress failed"); }
  };

  // Checks if a topic or its subnodes have any quizzes attached to them.
  // Useful to know if a user can finish a topic just by reading, or if they MUST take a quiz.
  const hasQuizForTopic = (topicId: string) => {
    for (const node of pathData) {
      if (node.id === topicId) return node.hasQuiz;
      const matchedSub = node.subnodes.find((sub) => sub.id === topicId);
      if (matchedSub) return matchedSub.hasQuiz;
    }
    return false;
  };

  // Checks if a topic has any readable/watchable resources like videos, articles, or podcasts.
  const hasOpenableResourcesForTopic = (topicId: string) => {
    for (const node of pathData) {
      if (node.id === topicId) return node.resources.some((r) => r.type !== 'quiz');
      const matchedSub = node.subnodes.find((sub) => sub.id === topicId);
      if (matchedSub) return matchedSub.resources.some((r) => r.type !== 'quiz');
    }
    return false;
  };

  // Quick helper to check local storage arrays
  const isResourceOpened = (topicId: string) => resourceOpenedIds.includes(topicId) || completedIds.includes(topicId);
  const isQuizFinished = (topicId: string) => quizCompletedIds.includes(topicId) || completedIds.includes(topicId);

  // Determines if a single specific node (main or sub) is fully complete.
  const isCoreComplete = (topicId: string) => {
    // Check if it's already explicitly complete from the server
    if (completedIds.includes(topicId)) return true;
    
    // Auto-complete logic: If the parent main topic is marked complete, auto-complete its subnodes
    const parentNode = pathData.find(node => node.subnodes.some(sub => sub.id === topicId));
    if (parentNode && completedIds.includes(parentNode.id)) return true;

    const requiresQuiz = hasQuizForTopic(topicId);
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    
    // If it has absolutely nothing to do, it's considered complete
    if (!requiresQuiz && !requiresResource) return true;
    
    const resourceDone = !requiresResource || isResourceOpened(topicId);
    const quizDone = !requiresQuiz || isQuizFinished(topicId);
    
    return resourceDone && quizDone;
  };

  // Gets the exact completed/total fraction for the progress bars
  const getCoreProgress = (topicId: string) => {
    const requiresQuiz = hasQuizForTopic(topicId);
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    const completed = (requiresResource && isResourceOpened(topicId) ? 1 : 0) + (requiresQuiz && isQuizFinished(topicId) ? 1 : 0);
    const total = (requiresResource ? 1 : 0) + (requiresQuiz ? 1 : 0);
    return { completed, total };
  };

  // Checks if a Main Node is completely done (meaning ALL its subnodes are also done)
  const isNodeComplete = (node: MainTopic) => {
    // Fast-return true if the backend already marked it complete
    if (completedIds.includes(node.id)) return true;

    // If it has subnodes, all the non-AI subnodes must be complete
    if (node.subnodes.length > 0) {
      return node.subnodes.every((sub) => sub.type === 'ai' || isCoreComplete(sub.id));
    }
    
    // If no subnodes, just check the main node itself
    return isCoreComplete(node.id);
  };

  // Checks if a topic has fulfilled its requirements (resources read, quiz passed) 
  // and saves it to the server if so.
  const syncTopicCompletion = async (topicId: string, nextResourceOpenedIds: string[], nextQuizCompletedIds: string[]) => {
    const requiresResource = hasOpenableResourcesForTopic(topicId);
    const requiresQuiz = hasQuizForTopic(topicId);
    const hasResource = !requiresResource || nextResourceOpenedIds.includes(topicId);
    const hasQuiz = !requiresQuiz || nextQuizCompletedIds.includes(topicId);
    
    if (hasResource && hasQuiz && !completedIds.includes(topicId)) {
      await saveTopicCompletion(topicId);
    }
  };

  // ============================================================================
  // RESOURCE INTERACTION
  // ============================================================================

  // Marks a resource as "opened/read" and saves it to local storage.
  const markResourceOpened = async (topicId: string) => {
    const nextIds = resourceOpenedIds.includes(topicId) ? resourceOpenedIds : [...resourceOpenedIds, topicId];
    setResourceOpenedIds(nextIds);
    if (user?.id) {
      persistStoredIds(getResourceStorageKey(user.id), nextIds);
    }
    // After marking it open, see if this was the last thing they needed to do to finish the topic.
    await syncTopicCompletion(topicId, nextIds, quizCompletedIds);
  };

  // Sends an analytics event tracking how many minutes the student spent learning.
  const markLearningActivity = (subnode: Subnode, resource: LearningResource) => {
    const resourceIndex = subnode.resources.indexOf(resource);
    const fallbackTime = estimateLearningTime(subnode.id, resource.type, resource.title, resourceIndex);
    recordLearningActivity(user?.id, parseLearningMinutes(resource.estimatedMinutes) || parseLearningMinutes(resource.estimatedTime) || parseLearningMinutes(fallbackTime));
  };

  // Opens a resource (like a quiz, video, or article) and marks it as opened
  const openSubnodeResource = async (subnode: Subnode, resource: LearningResource, options?: { markAsSkip?: boolean }) => {
    // Quizzes navigate to a different page entirely
    if (resource.type === 'quiz') {
      navigate(`/quiz/${subnode.id}`, {
        state: { markAsSkip: Boolean(options?.markAsSkip) },
      });
      return;
    }
    
    // Articles open in our internal pop-up modal
    if (resource.type === 'article') {
      await openArticleModal(subnode.id, subnode.title, resource.url);
      markLearningActivity(subnode, resource);
      await markResourceOpened(subnode.id);
      return;
    }
    
    // Videos and Podcasts open in a new browser tab
    const resolvedUrl = resolveResourceUrl(resource.url);
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      markLearningActivity(subnode, resource);
      await markResourceOpened(subnode.id);
    }
  };

  // Helper that passes the request from the "NodeDetailPanel" down to the actual `openSubnodeResource` function
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

  // ============================================================================
  // BACKGROUND SYNCING
  // ============================================================================
  // These effects watch for changes in the local tracking arrays and save them to local storage continuously.
  
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

  // When a user passes a quiz, immediately check if that was enough to complete the entire topic
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

  // If a topic only has articles/videos (no quizzes), check if reading them is enough to finish the topic
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

  // ============================================================================
  // NOTES & FEEDBACK INTERACTION
  // ============================================================================

  // Opens the modal editor to write notes or feedback for a specific question/topic
  const openQuestionEditor = (id: string, title: string) => {
    setQuestionEditorTarget({ id, title });
    setQuestionDraft(topicNotes[id] || '');
  };

  // Sends the written note/feedback to the server and saves it locally
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
    
    // Update local state so it appears immediately on the screen without refreshing
    setTopicNotes((prev) => {
      const next = { ...prev };
      if (nextValue) next[questionEditorTarget.id] = nextValue;
      else delete next[questionEditorTarget.id];
      return next;
    });
    setQuestionEditorTarget(null);
    setQuestionDraft('');
  };

  // ============================================================================
  // GLOBAL PROGRESS CALCULATION
  // ============================================================================
  
  // Calculate the total progress across the entire course to show in the top header bar
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

  // ============================================================================
  // RETRO 80S MAP GENERATOR (THE GRID)
  // ============================================================================
  // This section does the complicated math to draw the nodes like a circuit board on the screen.
  
  // 1. Figure out how much space we actually have to draw the map.
  // If the syllabus is open on the right, we subtract 380px so the map doesn't get covered up.
  const effectiveWindowWidth = isSyllabusOpen && rawWidth >= 640 ? rawWidth - 380 : rawWidth;
  const isSm = effectiveWindowWidth < 640;
  
  // Padding on the left and right edges so nodes don't touch the sides of the screen.
  const xPadding = isSm ? 20 : 50;
  const availableWidth = effectiveWindowWidth - (xPadding * 2);

  // 2. Decide how many columns we can fit on the screen.
  const idealCellWidth = isSm ? 150 : 200;
  // Make sure there are at least 2 columns on mobile so the AI nodes have somewhere to branch out to.
  const calculatedCols = Math.max(isSm ? 2 : 1, Math.floor(availableWidth / idealCellWidth));
  const cols = Math.min(6, calculatedCols);
  
  // Separate the nodes into two lists: 
  // 'coreNodes' (the straight path of main topics and professor subtopics)
  // 'aiNodes' (the red nodes that branch off the main path)
  const coreNodes: any[] = [];
  const aiNodes: any[] = [];
  let currentIndex = 0;

  pathData.forEach((node, mainIndex) => {
    // Add the main topic to the core path
    coreNodes.push({
      ...node,
      displayNumber: `T${mainIndex + 1}`,
      isMain: true,
      listIndex: currentIndex++,
      nodeRef: node
    });

    // Only draw the subtopics if this specific main topic is clicked on (active)
    if (activeId === node.id) {
      node.subnodes.forEach((sub, subIndex) => {
        if (sub.type === 'ai') {
          // AI branches out to the side, it doesn't take up space on the main grid line
          aiNodes.push({
            ...sub,
            displayNumber: `AI.${subIndex + 1}`,
            isMain: false,
            parentId: node.id,
            nodeRef: sub
          });
        } else {
          // Professor subtopics stay exactly on the main line
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

  // 3. Coordinate Calculator
  // Takes a node's number in line (index) and figures out its (x, y) position on a zig-zag grid.
  // It goes left-to-right, drops down a row, then goes right-to-left.
  const getGridCoords = (index: number) => {
    const y = Math.floor(index / cols);
    const x = y % 2 === 0 ? index % cols : (cols - 1) - (index % cols);
    return { x, y };
  };

  // Figure out the maximum number of columns we actually used so the map stays centered
  const maxColIndex = coreNodes.reduce((max, node) => Math.max(max, getGridCoords(node.listIndex).x), 0);
  const actualCols = coreNodes.length > 0 ? maxColIndex + 1 : 1;

  // ============================================================================
  // RESPONSIVE BOX SIZING
  // ============================================================================
  // We dynamically stretch or shrink the invisible grid boxes based on screen width.
  const dynamicCellWidth = availableWidth / actualCols;
  const cellWidth = Math.max(120, dynamicCellWidth); 
  const cellHeight = cellWidth * 0.8; // Keeps a nice 4:5 rectangular ratio

  // However, the physical visual boxes (the colored squares) stay fixed sizes 
  // so they don't squish when the syllabus drawer opens.
  const coreNodeSize = isSm ? 70 : 100;
  const aiNodeSize = coreNodeSize * 0.8;
  const xOffset = xPadding;

  // Group all AI nodes by their parent, so we know how many branch off from each spot
  const aiNodesByParent: { [parentId: string]: typeof aiNodes } = {};
  aiNodes.forEach(node => {
    if (!aiNodesByParent[node.parentId]) aiNodesByParent[node.parentId] = [];
    aiNodesByParent[node.parentId].push(node);
  });

  // ============================================================================
  // DYNAMIC HEIGHT CALCULATION (PREVENTING OVERLAPS)
  // ============================================================================
  // If a row has AI nodes branching out downwards, it needs extra vertical space 
  // so it doesn't crash into the row beneath it.
  
  const maxAiNodesPerRow: { [row: number]: number } = {};
  coreNodes.forEach(node => {
    const coords = getGridCoords(node.listIndex);
    const aiCount = (aiNodesByParent[node.id] || []).length;
    maxAiNodesPerRow[coords.y] = Math.max(maxAiNodesPerRow[coords.y] || 0, aiCount);
  });

  // Calculate the exact pixel 'Y' height for every single row on the screen
  const rowOffsets: { [row: number]: number } = { 0: cellHeight / 2 };
  const maxRows = Math.ceil(coreNodes.length / cols);
  for (let y = 1; y < maxRows; y++) {
    const prevRowAiCount = maxAiNodesPerRow[y - 1] || 0;
    const extraHeight = prevRowAiCount > 0 ? (prevRowAiCount * (aiNodeSize + 30)) : 0;
    rowOffsets[y] = rowOffsets[y - 1] + cellHeight + extraHeight;
  }

  // ============================================================================
  // FINAL PIXEL COORDINATES
  // ============================================================================
  // Convert grid coordinates into exact pixel coordinates (px, py) for drawing the SVG lines.

  // Core Nodes (Straight lines)
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

  // AI Nodes (Branching lines)
  const aiCoordsMap: { [id: string]: { px: number, py: number, parentPx: number, parentPy: number, forkY: number } } = {};
  Object.values(aiNodesByParent).forEach((nodesForParent) => {
    nodesForParent.forEach((node, localIdx) => {
      const parentCoords = coreCoordsMap[node.parentId];
      if (parentCoords) {
        // Decide whether the branch goes left or right so it doesn't leave the screen
        const direction = parentCoords.x === cols - 1 ? -1 : 1;
        const offsetX = (cellWidth / 2) * direction;
        // Stack them vertically if there are multiple AI nodes attached to the same parent
        const offsetY = (cellHeight * 0.6) + (localIdx * (aiNodeSize + 30));
        
        aiCoordsMap[node.id] = {
          px: parentCoords.px + offsetX,
          py: parentCoords.py + offsetY,
          parentPx: parentCoords.px,
          parentPy: parentCoords.py,
          forkY: parentCoords.py + (cellHeight * 0.35) // The elbow joint of the SVG line
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
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-[10px] sm:text-xs font-bold px-1.5 sm:px-3 py-1.5 hover:bg-black/10 border border-transparent rounded transition-colors" style={{ color: "var(--cn-text)" }}>
            <ChevronLeft size={16} /> <span className="hidden sm:inline">[DASHBOARD]</span>
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-3 py-1.5 border rounded" style={{ borderColor: "var(--cn-border)", background: "var(--cn-bg)" }}>
            <span className="text-[9px] sm:text-xs font-bold" style={{ color: "var(--cn-text)" }}><span className="hidden sm:inline">SYS.SYNC: </span>{overallProgress}%</span>
            <div className="w-8 sm:w-20 h-1.5 overflow-hidden" style={{ background: "#F5C518" }}>
              <div className="h-full shadow-[0_0_8px_#3A9E3F] transition-all" style={{ width: `${overallProgress}%`, background: "#3A9E3F" }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">

            <button onClick={() => setSyllabusOpen(true)} className="text-[8px] sm:text-xs font-bold px-2 sm:px-6 py-1.5 sm:py-2 border text-white shadow-[0_0_10px_#3A9E3F] rounded transition-all" style={{ borderColor: "#3A9E3F", background: "#3A9E3F" }}>[SYLLABUS]</button>
        </div>
      </div>

      <main 
        className={`pb-16 sm:pb-24 flex flex-col items-center pt-24 sm:pt-32 w-full overflow-hidden transition-all duration-500 ease-in-out ${
          isSyllabusOpen ? 'sm:pr-[380px]' : 'pr-0'
        }`}
      >
        <div className="mb-10 text-center pointer-events-none px-4 w-full max-w-4xl mx-auto overflow-hidden">
            <h1 className="text-xl sm:text-4xl font-bold mb-1 tracking-widest drop-shadow-[0_0_8px_rgba(58,158,63,0.8)] uppercase break-words whitespace-normal" style={{ color: "var(--cn-text)" }}>{courseTitle}</h1>
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
                                className={`w-full h-full flex items-center justify-center rounded-[1.75rem] retro-node transition-transform duration-200 hover:scale-110
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
                                className={`absolute top-full left-1/2 -translate-x-1/2 mt-3 w-max max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity border text-xs sm:text-sm font-bold text-center p-2 rounded-sm pointer-events-none z-50 shadow-md
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
                                className={`w-full h-full flex items-center justify-center rounded-[1.75rem] retro-node transition-transform duration-200 hover:scale-110 
                                    ${isComplete ? 'retro-node-ai' : 'retro-node-ai-dim'}
                                    ${isHighlighted ? 'scale-110 ring-2 ring-white ring-offset-1' : ''}
                                `}
                            >
                                <span className="font-bold text-xs sm:text-sm">{node.displayNumber}</span>
                            </button>

                            {/* Hover Tooltip for Title */}
                            <div 
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity border border-[#EF4444] text-[#EF4444] text-xs sm:text-sm font-bold text-center p-2 rounded-sm pointer-events-none z-50 shadow-[0_0_10px_#EF4444]"
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
            <p className="text-[10px] font-black uppercase tracking-widest text-[#F5C518]/70">SYS.QUERY // INPUT</p>
            <p className="mt-1 text-sm font-bold text-[#F5C518]">{questionEditorTarget.title}</p>
            <textarea
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              placeholder="ENTER COMMAND..."
              className="mt-3 w-full min-h-28 rounded-sm border border-[#F5C518]/30 bg-black px-3 py-2 text-sm outline-none focus:border-[#F5C518] focus:shadow-[0_0_10px_#F5C518] text-[#F5C518] resize-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setQuestionEditorTarget(null); setQuestionDraft(''); }} className="px-3 py-1.5 text-xs font-bold uppercase text-[#F5C518]/70 hover:text-[#F5C518]">ABORT</button>
              <button onClick={saveQuestionNote} className="px-4 py-1.5 bg-[#F5C518] text-black text-xs font-black uppercase hover:bg-white transition-colors shadow-[0_0_10px_#F5C518]">EXECUTE</button>
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