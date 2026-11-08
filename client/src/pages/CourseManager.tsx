// Professor course manager - coordinates tabs, curriculum nodes, and graph/list workspace
import { useEffect, useState, useCallback, useRef } from 'react';
import ProfessorGraph from '../components/graph/ProfessorGraph';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Trash2, ChevronLeft, Globe, Lock, List, Network } from 'lucide-react';
import { api } from '../utils/api';
import { moveSubtopic } from '../utils/moveSubtopic';
import GuideOverlay from '../components/GuideOverlay';
import { hasSeenGuide, markGuideSeen } from '../utils/guideSession';
import WikidataSearchField from './courseManager/WikidataSearchField';
import TopicCard from './courseManager/TopicCard';
import QuizEditorModal, { getEmptyQuestion } from './courseManager/QuizEditorModal';
import CourseStatisticsTab from './courseManager/CourseStatisticsTab';
import { findViolations } from '../utils/prerequisiteViolations';
import { SHOW_LIST_WARNINGS } from './courseManager/courseManagerConstants';
import {
  OverviewTab,
  StudentsTab,
  FeedbackTab,
} from './courseManager/CourseTabs';

export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'students' | 'nodes' | 'statistics' | 'feedback'>('overview');
  // F-01: Toggle between list editor and professor prerequisite graph
  const [nodesViewMode, setNodesViewMode] = useState<'list' | 'graph'>('list');
  const [reorderError, setReorderError] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  const [movingSubtopicId, setMovingSubtopicId] = useState<string | null>(null);
  const [prereqBusy, setPrereqBusy] = useState(false);
  const moveBusyRef = useRef(false);
  const moveMessageTimerRef = useRef<number | null>(null);
  const prereqBusyRef = useRef(false);

  const [course, setCourse] = useState<any>(null);
  const [user] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackError, setFeedbackError] = useState('');
  const [statistics, setStatistics] = useState<any>(null);
  const [statisticsError, setStatisticsError] = useState('');
  const [loading, setLoading] = useState(true);

  // Node & Topic editing states
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubForm, setNewSubForm] = useState({
    name: '',
    sourceUrl: '',
    wikidataId: '',
    video: '',
    article: '',
    podcast: '',
    file: null as File | null,
  });
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [linkData, setLinkData] = useState({
    video: '',
    article: '',
    podcast: '',
    sourceUrl: '',
    file: null as File | null,
  });
  const [prereqSelection, setPrereqSelection] = useState<string[]>([]);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicForm, setNewTopicForm] = useState({
    name: '',
    sourceUrl: '',
    wikidataId: '',
    file: null as File | null,
  });
  const [newTopicWikiQuery, setNewTopicWikiQuery] = useState('');
  const [newTopicWikiResults, setNewTopicWikiResults] = useState<any[]>([]);
  const [newSubWikiQuery, setNewSubWikiQuery] = useState('');
  const [newSubWikiResults, setNewSubWikiResults] = useState<any[]>([]);
  const [suggestionsByTopic, setSuggestionsByTopic] = useState<Record<string, any[]>>({});
  const [suggestLoadingTopic, setSuggestLoadingTopic] = useState<string | null>(null);
  const [suggestErrorTopic, setSuggestErrorTopic] = useState<Record<string, string>>({});

  // F-02: Shared expansion state between list and graph
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedMainTopics, setExpandedMainTopics] = useState<Record<string, boolean>>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  // Quiz Editor state
  const [quizEditorTopic, setQuizEditorTopic] = useState<any>(null);
  const [quizEditorQuiz, setQuizEditorQuiz] = useState<any>(null);
  const [quizEditorQuestions, setQuizEditorQuestions] = useState<any[]>([]);
  const [quizEditorOpen, setQuizEditorOpen] = useState(false);
  const [quizEditorBusy, setQuizEditorBusy] = useState(false);
  const [quizEditorSaving, setQuizEditorSaving] = useState(false);
  const [quizEditorIncludesSubtopics, setQuizEditorIncludesSubtopics] = useState(false);
  const quizGenerationController = useRef<AbortController | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchCourse = useCallback(async () => {
    try {
      const res = await api.get(`/courses/${courseId}`);
      setCourse(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const moveSubtopicLocal = (
    subtopicId: string,
    targetParentId: string,
    targetIndex: number
  ) => {
    if (!course?.topics) return course;

    const sourceParent = course.topics.find((topic: any) =>
      topic.subtopics?.some((subtopic: any) => subtopic.id === subtopicId)
    );
    const targetParent = course.topics.find((topic: any) => topic.id === targetParentId);
    if (!sourceParent || !targetParent) return course;

    const movedSubtopic = sourceParent.subtopics.find(
      (subtopic: any) => subtopic.id === subtopicId
    );
    const sourceSubtopics = sourceParent.subtopics.filter(
      (subtopic: any) => subtopic.id !== subtopicId
    );
    const targetSubtopics = sourceParent.id === targetParentId
      ? [...sourceSubtopics]
      : [...(targetParent.subtopics || [])];
    targetSubtopics.splice(targetIndex, 0, {
      ...movedSubtopic,
      parentTopicId: targetParentId,
    });

    const renumber = (subtopics: any[]) =>
      subtopics.map((subtopic, order) => ({ ...subtopic, order }));

    const nextCourse = {
      ...course,
      topics: course.topics.map((topic: any) => {
        if (topic.id === sourceParent.id && topic.id === targetParentId) {
          return { ...topic, subtopics: renumber(targetSubtopics) };
        }
        if (topic.id === sourceParent.id) {
          return { ...topic, subtopics: renumber(sourceSubtopics) };
        }
        if (topic.id === targetParentId) {
          return { ...topic, subtopics: renumber(targetSubtopics) };
        }
        return topic;
      }),
    };

    setCourse(nextCourse);
    return course;
  };

  const restoreCourse = (previous: any) => {
    setCourse(previous);
  };

  const showMoveMessage = (message: string) => {
    setMoveMessage(message);
    if (moveMessageTimerRef.current !== null) {
      window.clearTimeout(moveMessageTimerRef.current);
    }
    moveMessageTimerRef.current = window.setTimeout(() => {
      setMoveMessage(null);
      moveMessageTimerRef.current = null;
    }, 4000);
  };

  const performMove = async (
    subtopicId: string,
    targetParentId: string,
    targetIndex: number
  ) => {
    if (moveBusy || moveBusyRef.current) return;
    moveBusyRef.current = true;
    const moveStartedAt = Date.now();
    setMoveBusy(true);
    setMovingSubtopicId(subtopicId);
    try {
      const previous = moveSubtopicLocal(subtopicId, targetParentId, targetIndex);
      const result = await moveSubtopic(courseId || '', subtopicId, targetParentId, targetIndex);
      if (result.ok) {
        setMoveMessage(null);
        if (moveMessageTimerRef.current !== null) {
          window.clearTimeout(moveMessageTimerRef.current);
          moveMessageTimerRef.current = null;
        }
        await fetchCourse();
      } else {
        restoreCourse(previous);
        showMoveMessage(result.message || 'Move failed, nothing was changed.');
      }
    } finally {
      const minimumSpinnerTime = 300;
      const remainingSpinnerTime = minimumSpinnerTime - (Date.now() - moveStartedAt);
      if (remainingSpinnerTime > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingSpinnerTime));
      }
      moveBusyRef.current = false;
      setMoveBusy(false);
      setMovingSubtopicId(null);
    }
  };

  useEffect(() => () => {
    if (moveMessageTimerRef.current !== null) {
      window.clearTimeout(moveMessageTimerRef.current);
    }
  }, []);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  useEffect(() => {
    if (course && user && !hasSeenGuide(user, 'professor-course')) {
      setShowGuide(true);
    }
  }, [course, user]);

  const closeGuide = () => {
    markGuideSeen(user, 'professor-course');
    setShowGuide(false);
  };

  const fetchFeedback = useCallback(async () => {
    if (!courseId) return;
    setFeedbackError('');
    try {
      const res = await api.get(`/feedback/course/${courseId}`);
      setFeedback(res.data || []);
    } catch (error: any) {
      setFeedbackError(error.response?.data?.error || 'Could not load feedback.');
      setFeedback([]);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'feedback') fetchFeedback();
  }, [tab, fetchFeedback]);

  const fetchStatistics = useCallback(async () => {
    if (!courseId) return;
    setStatisticsError('');
    try {
      const res = await api.get(`/statistics/course/${courseId}`);
      setStatistics(res.data);
    } catch (error: any) {
      setStatisticsError(error.response?.data?.error || 'Could not load statistics.');
      setStatistics(null);
    }
  }, [courseId]);

  useEffect(() => {
    if (tab === 'statistics') fetchStatistics();
  }, [tab, fetchStatistics]);

  const searchWiki = async (
    query: string,
    setQuery: (value: string) => void,
    setResults: (value: any[]) => void
  ) => {
    setQuery(query);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      const res = await api.get(`/wiki/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.data || []);
    } catch (error) {
      console.error('Wikidata search failed', error);
    }
  };

  const selectWikiResult = (
    item: any,
    setQuery: (value: string) => void,
    setResults: (value: any[]) => void,
    setForm: any
  ) => {
    setQuery(item.label);
    setResults([]);
    setForm((prev: any) => ({ ...prev, wikidataId: item.id }));
  };

  const toggleVisibility = async () => {
    const nextStatus = !course.isPublic;
    try {
      await api.put(`/courses/${courseId}`, { isPublic: nextStatus });
      setCourse({ ...course, isPublic: nextStatus });
    } catch (e) {
      console.error(e);
    }
  };

  const addSubtopic = async (parentId: string) => {
    if (!newSubForm.name.trim()) return;
    try {
      const formData = new FormData();
      formData.append('name', newSubForm.name.trim());
      formData.append('parentTopicId', parentId);
      if (newSubForm.sourceUrl.trim()) formData.append('sourceUrl', newSubForm.sourceUrl.trim());
      if (newSubForm.wikidataId.trim()) formData.append('wikidataId', newSubForm.wikidataId.trim());
      if (newSubForm.video.trim()) formData.append('videoUrl', newSubForm.video.trim());
      if (newSubForm.article.trim()) formData.append('articleUrl', newSubForm.article.trim());
      if (newSubForm.podcast.trim()) formData.append('podcastUrl', newSubForm.podcast.trim());
      if (newSubForm.file) formData.append('pdf', newSubForm.file);

      await api.post(`/courses/${courseId}/topics`, formData);
      setNewSubForm({ name: '', sourceUrl: '', wikidataId: '', video: '', article: '', podcast: '', file: null });
      setAddingSubTo(null);
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  const addTopic = async () => {
    if (!newTopicForm.name.trim()) return;
    try {
      const formData = new FormData();
      formData.append('name', newTopicForm.name.trim());
      if (newTopicForm.sourceUrl.trim()) formData.append('sourceUrl', newTopicForm.sourceUrl.trim());
      if (newTopicForm.wikidataId.trim()) formData.append('wikidataId', newTopicForm.wikidataId.trim());
      if (newTopicForm.file) formData.append('pdf', newTopicForm.file);

      await api.post(`/courses/${courseId}/topics`, formData);
      setNewTopicForm({ name: '', sourceUrl: '', wikidataId: '', file: null });
      setIsAddingTopic(false);
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  const loadSubtopicSuggestions = async (topic: any) => {
    if (!topic?.wikidataId) return;
    setSuggestLoadingTopic(topic.id);
    setSuggestErrorTopic((prev) => ({ ...prev, [topic.id]: '' }));
    try {
      const res = await api.get(`/wiki/suggestions/${topic.wikidataId}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setSuggestionsByTopic((prev) => ({ ...prev, [topic.id]: data }));
      if (data.length === 0) {
        setSuggestErrorTopic((prev) => ({
          ...prev,
          [topic.id]: 'No related concepts found for this topic.',
        }));
      }
    } catch {
      setSuggestErrorTopic((prev) => ({ ...prev, [topic.id]: 'Could not load suggestions.' }));
    } finally {
      setSuggestLoadingTopic(null);
    }
  };

  const acceptSuggestion = async (topic: any, suggestion: any) => {
    try {
      await api.post(`/courses/${courseId}/topics`, {
        name: suggestion.label,
        parentTopicId: topic.id,
        aiSuggested: true,
        ...(suggestion.wikidataId ? { wikidataId: suggestion.wikidataId } : {}),
      });
      setSuggestionsByTopic((prev) => ({
        ...prev,
        [topic.id]: (prev[topic.id] || []).filter((s) => s.uri !== suggestion.uri),
      }));
      fetchCourse();
    } catch (e) {
      console.error('Accept suggestion failed', e);
    }
  };

  const saveLinks = async (subId: string) => {
    try {
      const formData = new FormData();
      formData.append('videoUrl', linkData.video);
      formData.append('articleUrl', linkData.article);
      formData.append('podcastUrl', linkData.podcast);
      if (linkData.sourceUrl.trim()) formData.append('sourceUrl', linkData.sourceUrl.trim());
      if (linkData.file) formData.append('pdf', linkData.file);

      await api.put(`/courses/${courseId}/topics/${subId}`, formData);
      setEditingSubId(null);
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!editingSubId || !course?.topics) {
      setPrereqSelection([]);
      return;
    }
    const current = course.topics.find((topic: any) => topic.id === editingSubId);
    setPrereqSelection(
      Array.isArray(current?.prerequisites) ? current.prerequisites.map((p: any) => p.id) : []
    );
  }, [editingSubId, course]);

  // F-14: Saves prerequisites and links for BOTH topics and subtopics
  const listViolations = SHOW_LIST_WARNINGS ? findViolations(course?.topics || []) : [];
  const saveTopicSettings = async (topicId: string) => {
    try {
      await api.put(`/topics/${topicId}`, { prerequisiteIds: prereqSelection });
    } catch (e) {
      console.error('Could not save prerequisites:', e);
    }
    await saveLinks(topicId);
  };

  const saveSubtopicPrerequisites = async (
    subtopicId: string,
    prerequisiteId: string,
    checked: boolean
  ) => {
    if (!course?.topics || prereqBusyRef.current) return;
    const subtopic = course.topics
      .flatMap((topic: any) => topic.subtopics || [])
      .find((item: any) => item.id === subtopicId);
    if (!subtopic) return;

    const currentIds: string[] = (subtopic.prerequisites || []).map((item: any) => item.id);
    const nextIds = checked
      ? [...currentIds, prerequisiteId]
      : currentIds.filter((id) => id !== prerequisiteId);
    const previous = course;
    const prerequisiteById = new Map(
      course.topics.flatMap((topic: any) => [topic, ...(topic.subtopics || [])])
        .map((item: any) => [item.id, item] as const)
    );
    const nextCourse = {
      ...course,
      topics: course.topics.map((topic: any) => ({
        ...topic,
        subtopics: (topic.subtopics || []).map((item: any) =>
          item.id === subtopicId
            ? {
                ...item,
                prerequisites: nextIds
                  .map((id) => prerequisiteById.get(id))
                  .filter(Boolean)
                  .map((item: any) => ({ id: item.id, name: item.name })),
              }
            : item
        ),
      })),
    };

    prereqBusyRef.current = true;
    setPrereqBusy(true);
    setCourse(nextCourse);
    try {
      await api.put(`/topics/${subtopicId}`, { prerequisiteIds: nextIds });
      await fetchCourse();
    } catch (error) {
      restoreCourse(previous);
      console.error('Could not save prerequisites:', error);
      showMoveMessage('Saving failed, nothing was changed.');
    } finally {
      prereqBusyRef.current = false;
      setPrereqBusy(false);
    }
  };

  const handleReplacementFile = (file: File | null) => {
    setLinkData((prev) => ({
      ...prev,
      file,
      sourceUrl: file ? '' : prev.sourceUrl,
      article: file && prev.article.includes('/uploads/') ? '' : prev.article,
    }));
  };

  const clearAttachedPdf = async (topicId: string) => {
    try {
      await api.put(`/courses/${courseId}/topics/${topicId}`, { articleUrl: '' });
      if (editingSubId === topicId) {
        setLinkData((prev) => ({ ...prev, article: '', file: null, sourceUrl: '' }));
      }
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  // F-12 & F-11: Reorder topics with server rollback on error
  const handleTopicDrop = async (srcId: string, targetId: string) => {
    if (!course || srcId === targetId) return;
    setReorderError('');
    const topics = [...course.topics];
    const srcIdx = topics.findIndex((t: any) => t.id === srcId);
    const tgtIdx = topics.findIndex((t: any) => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = topics.splice(srcIdx, 1);
    topics.splice(tgtIdx, 0, moved);
    const updatedTopics = topics.map((t, idx) => ({ ...t, order: idx }));
    setCourse({ ...course, topics: updatedTopics });

    try {
      for (let i = 0; i < updatedTopics.length; i++) {
        await api.put(`/courses/${courseId}/topics/${updatedTopics[i].id}`, { order: i });
      }
    } catch (err) {
      console.error('Topic reorder failed:', err);
      setReorderError('Could not save new topic order. Restoring server order.');
      fetchCourse();
    }
  };

  const handleSubtopicDrop = (
    srcId: string,
    targetId: string,
    targetParentId: string
  ) => {
    if (!course || !srcId || !targetId || !targetParentId || srcId === targetId) return;
    const sourceParent = course.topics.find((topic: any) =>
      topic.subtopics?.some((subtopic: any) => subtopic.id === srcId)
    );
    const targetParent = course.topics.find((topic: any) => topic.id === targetParentId);
    const targetIndex = targetParent?.subtopics?.findIndex(
      (subtopic: any) => subtopic.id === targetId
    );
    const sourceIndex = sourceParent?.subtopics?.findIndex(
      (subtopic: any) => subtopic.id === srcId
    );
    if (!sourceParent || !targetParent || targetIndex === undefined || targetIndex < 0 || sourceIndex === undefined || sourceIndex < 0) return;

    const finalIndex = targetIndex -
      (sourceParent.id === targetParent.id && sourceIndex < targetIndex ? 1 : 0);
    void performMove(srcId, targetParentId, finalIndex);
  };

  const startEditingName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setEditingNameValue(currentName);
  };

  const saveName = async (id: string) => {
    if (!editingNameValue.trim()) {
      setEditingNameId(null);
      return;
    }
    try {
      await api.put(`/courses/${courseId}/topics/${id}`, { name: editingNameValue });
      setEditingNameId(null);
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTopic = async (id: string) => {
    if (!window.confirm('Delete this topic/subtopic permanently?')) return;
    try {
      await api.delete(`/courses/${courseId}/topics/${id}`);
      if (editingSubId === id) setEditingSubId(null);
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  const openQuizEditor = (topic: any, includeSubtopics = false) => {
    const existingQuiz =
      Array.isArray(topic.quizzes) && topic.quizzes.length > 0 ? topic.quizzes[0] : null;
    setQuizEditorIncludesSubtopics(includeSubtopics);
    setQuizEditorTopic(topic);
    setQuizEditorQuiz(existingQuiz);
    setQuizEditorQuestions(
      Array.isArray(existingQuiz?.questions) && existingQuiz.questions.length > 0
        ? existingQuiz.questions
        : [getEmptyQuestion()]
    );
    setQuizEditorOpen(true);
  };

  const generateQuizDraft = async (topic: any, includeSubtopics = false) => {
    quizGenerationController.current?.abort();
    const controller = new AbortController();
    const existingQuiz = Array.isArray(topic?.quizzes) ? topic.quizzes[0] : null;
    quizGenerationController.current = controller;
    setQuizEditorTopic(topic);
    setQuizEditorQuiz(existingQuiz);
    setQuizEditorQuestions(Array.isArray(existingQuiz?.questions) ? existingQuiz.questions : []);
    setQuizEditorOpen(true);

    try {
      setQuizEditorBusy(true);
      setQuizEditorIncludesSubtopics(includeSubtopics);
      const res = await api.post(
        `/topics/${topic.id}/enrich`,
        { includeSubtopics, draftOnly: true },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;

      const updatedTopic = res.data?.topic || topic;
      const quiz =
        Array.isArray(updatedTopic?.quizzes) && updatedTopic.quizzes.length > 0
          ? updatedTopic.quizzes[0]
          : null;
      setQuizEditorTopic(updatedTopic);
      setQuizEditorQuiz(quiz);
      setQuizEditorQuestions(
        Array.isArray(quiz?.questions) && quiz.questions.length > 0
          ? quiz.questions
          : [getEmptyQuestion()]
      );
      setQuizEditorOpen(true);
      fetchCourse();
    } catch (err) {
      if (axios.isCancel(err) || controller.signal.aborted) return;
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || 'AI generation failed.'
        : 'AI generation failed.';
      alert(message);
    } finally {
      if (quizGenerationController.current === controller) {
        quizGenerationController.current = null;
        setQuizEditorBusy(false);
      }
    }
  };

  const closeQuizEditor = () => {
    quizGenerationController.current?.abort();
    quizGenerationController.current = null;
    setQuizEditorBusy(false);
    setQuizEditorOpen(false);
  };

  const saveQuizEditor = async () => {
    if (!quizEditorTopic) return;
    try {
      setQuizEditorSaving(true);
      const questions = quizEditorQuestions
        .map((question) => ({
          ...question,
          question: (question.question || '').trim(),
          explanation: (question.explanation || '').trim(),
          points: Number.isFinite(Number(question.points)) ? Number(question.points) : 1,
          gradingMode:
            question.type === 'open_answer' &&
            Array.isArray(question.acceptedAnswers) &&
            question.acceptedAnswers.length > 1
              ? question.gradingMode || 'all'
              : question.gradingMode,
          partialCreditThreshold: Number.isFinite(Number(question.partialCreditThreshold))
            ? Math.max(1, Math.round(Number(question.partialCreditThreshold)))
            : 1,
        }))
        .filter((question) => question.question.length > 0);

      if (quizEditorQuiz?.id) {
        await api.put(`/topics/quizzes/${quizEditorQuiz.id}`, { questions });
      } else {
        await api.post(`/quizzes`, { topicId: quizEditorTopic.id, questions });
      }

      setQuizEditorOpen(false);
      setQuizEditorTopic(null);
      setQuizEditorQuiz(null);
      setQuizEditorQuestions([]);
      setQuizEditorIncludesSubtopics(false);
      fetchCourse();
    } catch {
      alert('Could not save quiz.');
    } finally {
      setQuizEditorSaving(false);
    }
  };

  const deleteQuizFromOverview = async (quizId: string) => {
    if (!quizId || !window.confirm('Delete this quiz permanently?')) return;
    try {
      await api.delete(`/topics/quizzes/${quizId}`);
      fetchCourse();
    } catch {
      alert('Could not delete quiz.');
    }
  };

  const renderQuizOverview = (topic: any, options: { skipTest?: boolean } = {}) => {
    const skipTest = Boolean(options.skipTest);
    const existingQuiz =
      Array.isArray(topic?.quizzes) && topic.quizzes.length > 0 ? topic.quizzes[0] : null;
    const questions = Array.isArray(existingQuiz?.questions) ? existingQuiz.questions : [];

    if (!existingQuiz || questions.length === 0) {
      if (!skipTest) return null;
      return (
        <div className="mt-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300">
                Skip Quiz Overview
              </p>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Covers this topic and all nested subtopics
              </p>
            </div>
            <button
              onClick={() => generateQuizDraft(topic, true)}
              disabled={quizEditorBusy}
              className="rounded-xl bg-purple-600 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
            >
              {quizEditorBusy ? 'Generating...' : 'Generate Quiz'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-2xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300">
              {skipTest ? 'Skip Quiz Overview' : 'Quiz Overview'}
            </p>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {questions.length} question{questions.length === 1 ? '' : 's'}{' '}
              {skipTest ? 'covering the full topic tree' : 'ready for review'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openQuizEditor(topic, skipTest)}
              className="shrink-0 px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-800 text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300 hover:bg-purple-100/70 dark:hover:bg-purple-900/30 transition-colors"
            >
              Review Quiz
            </button>
            <button
              onClick={() => deleteQuizFromOverview(existingQuiz.id)}
              title="Delete quiz"
              aria-label="Delete quiz"
              className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {questions.slice(0, 2).map((question: any, index: number) => (
            <div key={`${topic.id}-quiz-preview-${index}`} className="rounded-xl bg-white/80 dark:bg-gray-900/50 border border-white/70 dark:border-gray-800 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{question.type?.replace('_', ' ') || 'Question'}</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 line-clamp-2">{question.question}</p>
            </div>
          ))}
          {questions.length > 2 && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">+ {questions.length - 2} more questions inside</p>
          )}
        </div>
      </div>
    );
  };

  const renderResourceOverview = (topic: any) => {
    const items = [
      topic.videoUrl ? { label: 'Video', value: topic.videoUrl, tone: 'text-red-500' } : null,
      topic.articleUrl ? {
        label: topic.articleUrl.includes('/uploads/') ? 'PDF' : 'Article',
        value: topic.articleUrl,
        tone: 'text-blue-500'
      } : null,
      topic.podcastUrl ? { label: 'Podcast', value: topic.podcastUrl, tone: 'text-green-500' } : null,
      topic.wikidataId ? { label: 'Wikidata', value: topic.wikidataId, tone: 'text-violet-500' } : null,
    ].filter(Boolean) as Array<{ label: string; value: string; tone: string }>;

    if (items.length === 0) return null;

    return (
      <div className="mt-3 rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/60 dark:bg-sky-950/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-300">Resource Overview</p>
        </div>
        <div className="space-y-2">
          {items.map((item, index) => {
            const href = item.label === 'Wikidata'
              ? `https://www.wikidata.org/wiki/${item.value}`
              : (item.value.startsWith('/') ? `http://localhost:5000${item.value}` : item.value);

            return (
              <a
                key={`${topic.id}-resource-${index}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-gray-900/50 border border-white/70 dark:border-gray-800 px-3 py-2 hover:bg-white dark:hover:bg-gray-900 transition-colors"
                title={item.label === 'Wikidata' ? item.value : href}
              >
                <div className="min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${item.tone}`}>{item.label}</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                    {item.label === 'Wikidata' ? item.value : href}
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Open</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  };

  const getContentPreviewMeta = (topic: any) => {
    if (!topic?.content) return null;
    if (topic.wikidataId) return { title: 'Wikidata Overview', actionOpen: 'Collapse', actionClosed: 'Expand' };
    if (typeof topic.articleUrl === 'string' && topic.articleUrl.includes('/uploads/')) return { title: 'PDF Extract', actionOpen: 'Hide Preview', actionClosed: 'Show Preview' };
    return { title: 'Source Notes', actionOpen: 'Hide Preview', actionClosed: 'Show Preview' };
  };

  if (loading) return <div className="py-20 text-center text-gray-400 text-xs uppercase tracking-widest">Synchronizing...</div>;
  if (!course) return null;

  const flatCourseTopics = Array.isArray(course.topics)
    ? course.topics.flatMap((topic: any) => [
        ...(topic.aiSuggested ? [] : [{ id: topic.id, name: topic.name }]),
        ...(Array.isArray(topic.subtopics)
          ? topic.subtopics
              .filter((subtopic: any) => !subtopic.aiSuggested)
              .map((subtopic: any) => ({ id: subtopic.id, name: subtopic.name }))
          : []),
      ])
    : [];

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-gray-400 font-bold text-xs mb-4 hover:text-blue-600 transition-all uppercase"><ChevronLeft size={14} /> Back to Dashboard</button>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black text-gray-900 dark:text-white leading-tight">{course.title}</h1>
              <button 
                onClick={toggleVisibility}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${course.isPublic ? 'bg-green-50 text-green-600 border-green-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}
              >
                {course.isPublic ? <><Globe size={10} /> Public</> : <><Lock size={10} /> Private</>}
              </button>
            </div>
            <p className="text-gray-500 text-sm font-medium">{course.description || "Course Management"}</p>
          </div>
          <button onClick={async () => { if(window.confirm("Delete?")) { await api.delete(`/courses/${courseId}`); navigate('/dashboard'); } }} className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={14} /> Delete Course</button>
        </div>

        <div className="bg-gray-100/80 dark:bg-gray-900/50 p-1 rounded-xl flex gap-1 mb-8 border dark:border-gray-800 w-full overflow-x-auto sm:w-fit">
          {(["overview", "students", "nodes", "statistics", "feedback"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`shrink-0 px-6 sm:px-8 py-2 text-xs font-bold rounded-lg transition-all ${tab === t ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-gray-400"}`}>{t.toUpperCase()}</button>
          ))}
        </div>

        <main>
          {tab === "overview" && <OverviewTab course={course} />}
          {tab === "students" && <StudentsTab course={course} flatCourseTopics={flatCourseTopics} />}
          {tab === "statistics" && <CourseStatisticsTab statistics={statistics} statisticsError={statisticsError} onRefresh={fetchStatistics} />}
          {tab === "feedback" && <FeedbackTab feedback={feedback} feedbackError={feedbackError} onRefresh={fetchFeedback} />}

          {tab === "nodes" && (
            <div className="space-y-4 animate-in slide-in-from-bottom-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">Curriculum Nodes</h2>
                  {/* F-01: Toggle between list editor and professor graph */}
                  <div className="bg-gray-100 dark:bg-gray-900 p-1 rounded-xl flex items-center border dark:border-gray-800">
                    <button
                      onClick={() => setNodesViewMode('list')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${nodesViewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <List size={12} /> List
                    </button>
                    <button
                      onClick={() => setNodesViewMode('graph')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${nodesViewMode === 'graph' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <Network size={12} /> Graph
                    </button>
                  </div>
                </div>
                <button onClick={() => setIsAddingTopic(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase shadow-md">+ Add Topic</button>
              </div>

              {moveMessage && (
                <div className="p-3 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold">
                  {moveMessage}
                </div>
              )}

              {reorderError && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
                  {reorderError}
                </div>
              )}

              {nodesViewMode === 'graph' ? (
                <ProfessorGraph
                  courseId={courseId || ''}
                  courseTitle={course?.title || 'Course Manager'}
                  topics={course?.topics || []}
                  onDashboardClick={() => navigate('/dashboard')}
                  performMove={performMove}
                  movingSubtopicId={movingSubtopicId}
                />
              ) : (
                <>
                  {isAddingTopic && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm mb-4 flex gap-2">
                      <input autoFocus className="flex-1 px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="New Topic Name..." value={newTopicForm.name} onChange={(e) => setNewTopicForm((prev) => ({ ...prev, name: e.target.value }))} />
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Wikidata</p>
                        <WikidataSearchField
                          query={newTopicWikiQuery}
                          results={newTopicWikiResults}
                          placeholder="Search a topic in Wikidata"
                          onQueryChange={(value) => {
                            setNewTopicForm((prev) => ({ ...prev, wikidataId: '' }));
                            searchWiki(value, setNewTopicWikiQuery, setNewTopicWikiResults);
                          }}
                          onSelect={(item) => selectWikiResult(item, setNewTopicWikiQuery, setNewTopicWikiResults, setNewTopicForm)}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-dashed dark:border-gray-700 px-4 py-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">PDF Source</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{newTopicForm.file?.name || 'No file selected'}</p>
                        </div>
                        <label className="cursor-pointer rounded-xl bg-gray-100 dark:bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                          Upload PDF
                          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setNewTopicForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} />
                        </label>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setIsAddingTopic(false); setNewTopicForm({ name: '', sourceUrl: '', wikidataId: '', file: null }); setNewTopicWikiQuery(''); setNewTopicWikiResults([]); }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase text-gray-500">Cancel</button>
                        <button onClick={addTopic} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold uppercase">Add</button>
                      </div>
                    </div>
                  )}

                  {course.topics?.map((topic: any, i: number) => (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      i={i}
                      course={course}
                      editingNameId={editingNameId}
                      editingNameValue={editingNameValue}
                      setEditingNameValue={setEditingNameValue}
                      setEditingNameId={setEditingNameId}
                      saveName={saveName}
                      startEditingName={startEditingName}
                      deleteTopic={deleteTopic}
                      expandedMainTopics={expandedMainTopics}
                      setExpandedMainTopics={setExpandedMainTopics}
                      expandedTopics={expandedTopics}
                      setExpandedTopics={setExpandedTopics}
                      editingSubId={editingSubId}
                      setEditingSubId={setEditingSubId}
                      linkData={linkData}
                      setLinkData={setLinkData}
                      prereqSelection={prereqSelection}
                      setPrereqSelection={setPrereqSelection}
                      addingSubTo={addingSubTo}
                      setAddingSubTo={setAddingSubTo}
                      newSubForm={newSubForm}
                      setNewSubForm={setNewSubForm}
                      newSubWikiQuery={newSubWikiQuery}
                      newSubWikiResults={newSubWikiResults}
                      suggestLoadingTopic={suggestLoadingTopic}
                      suggestionsByTopic={suggestionsByTopic}
                      suggestErrorTopic={suggestErrorTopic}
                      handleTopicDrop={handleTopicDrop}
                      handleSubtopicDrop={handleSubtopicDrop}
                      prereqBusy={prereqBusy}
                      onPrerequisiteToggle={saveSubtopicPrerequisites}
                      handleReplacementFile={handleReplacementFile}
                      saveTopicSettings={saveTopicSettings}
                      saveSubtopicLinks={saveLinks}
                      clearAttachedPdf={clearAttachedPdf}
                      renderQuizOverview={renderQuizOverview}
                      renderResourceOverview={renderResourceOverview}
                      getContentPreviewMeta={getContentPreviewMeta}
                      openQuizEditor={openQuizEditor}
                      generateQuizDraft={generateQuizDraft}
                      loadSubtopicSuggestions={loadSubtopicSuggestions}
                      acceptSuggestion={acceptSuggestion}
                      addSubtopic={addSubtopic}
                      searchWiki={searchWiki}
                      selectWikiResult={selectWikiResult}
                      setNewSubWikiQuery={setNewSubWikiQuery}
                      setNewSubWikiResults={setNewSubWikiResults}
                      warnings={listViolations}
                    />
                  ))}
                  </>
              )}
            </div>
          )}
        </main>

        <QuizEditorModal
          open={quizEditorOpen}
          topic={quizEditorTopic}
          includesSubtopics={quizEditorIncludesSubtopics}
          busy={quizEditorBusy}
          saving={quizEditorSaving}
          questions={quizEditorQuestions}
          setQuestions={setQuizEditorQuestions}
          onClose={closeQuizEditor}
          onSave={saveQuizEditor}
          onGenerateDraft={generateQuizDraft}
        />

        {showGuide && (
          <GuideOverlay
            onClose={closeGuide}
            arrows={[
              { d: 'M24 23 C31 28 37 33 43 39' },
              { d: 'M50 26 C50 30 50 33 50 36' },
              { d: 'M76 66 C68 58 60 51 52 45' },
            ]}
            steps={[
              {
                number: 1,
                title: 'Course Overview',
                className: 'left-4 top-28 lg:left-12 lg:top-32',
                body: <p>Copy the join code and review the visibility your students will see.</p>,
              },
              {
                number: 2,
                title: 'Course Sections',
                className: 'left-1/2 top-32 -translate-x-1/2',
                body: <p>Use these tabs for students, curriculum nodes, quiz statistics, and feedback.</p>,
              },
              {
                number: 3,
                title: 'Build Nodes',
                className: 'right-4 bottom-20 lg:right-16',
                body: <p>Open Nodes to add topics, resources, quizzes, and the course structure.</p>,
              },
            ]}
          />
        )}
      </div>
    </>
  );
}