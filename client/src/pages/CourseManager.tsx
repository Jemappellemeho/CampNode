import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Plus, Trash2, ChevronLeft, GripVertical,
  BookOpen, X, Users, Globe, Copy, Check,
  ChevronRight, ChevronDown, Play, Headphones, Sparkles, Lock, Edit2, Search
} from 'lucide-react';

const API = 'http://localhost:3000/api';
const API_ORIGIN = 'http://localhost:3000';
const BLUE = '#1E6FFF';

function WikidataSearchField({
  query,
  results,
  placeholder,
  onQueryChange,
  onSelect,
}: {
  query: string;
  results: any[];
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: any) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full rounded-lg border px-3 py-2 pl-9 text-sm outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {results.map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => onSelect(result)}
            className="flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div>
              <p className="font-bold dark:text-white">{result.label}</p>
              <p className="text-xs text-gray-500">{result.description}</p>
            </div>
            <Plus size={16} className="mt-1 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "students" | "nodes" | "statistics" | "feedback">("overview");
  const [course, setCourse] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackError, setFeedbackError] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Logic States
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
  const [linkData, setLinkData] = useState({ video: '', article: '', podcast: '', sourceUrl: '', file: null as File | null });
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
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedMainTopics, setExpandedMainTopics] = useState<Record<string, boolean>>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [quizEditorTopic, setQuizEditorTopic] = useState<any>(null);
  const [quizEditorQuiz, setQuizEditorQuiz] = useState<any>(null);
  const [quizEditorQuestions, setQuizEditorQuestions] = useState<any[]>([]);
  const [quizEditorOpen, setQuizEditorOpen] = useState(false);
  const [quizEditorBusy, setQuizEditorBusy] = useState(false);
  const [quizEditorSaving, setQuizEditorSaving] = useState(false);
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);
  
  const token = localStorage.getItem('token');

  const fetchCourse = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourse(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [courseId, token]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const fetchFeedback = useCallback(async () => {
    if (!courseId) return;
    setFeedbackError('');
    try {
      const res = await axios.get(`${API}/feedback/course/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFeedback(res.data || []);
    } catch (error: any) {
      console.error('Failed to load feedback', error);
      setFeedbackError(error.response?.data?.error || 'Could not load feedback.');
      setFeedback([]);
    }
  }, [courseId, token]);

  useEffect(() => {
    if (tab === 'feedback') fetchFeedback();
  }, [tab, fetchFeedback]);

  const searchWiki = async (
    query: string,
    setQuery: (value: string) => void,
    setResults: (value: any[]) => void,
  ) => {
    setQuery(query);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    try {
      const res = await axios.get(`${API}/wiki/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.data || []);
    } catch (error) {
      console.error('Wikidata search failed', error);
    }
  };

  const selectWikiResult = (
    item: any,
    setQuery: (value: string) => void,
    setResults: (value: any[]) => void,
    setForm: any,
  ) => {
    setQuery(item.label);
    setResults([]);
    setForm((prev: any) => ({ ...prev, wikidataId: item.id }));
  };

  // Make backend-local resource paths clickable from the teacher dashboard.
  const resolveResourceUrl = (url?: string | null) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
    return `${API_ORIGIN}/${url}`;
  };

  const toggleVisibility = async () => {
    const nextStatus = !course.isPublic;
    try {
      await axios.put(`${API}/courses/${courseId}`, { isPublic: nextStatus }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourse({ ...course, isPublic: nextStatus });
    } catch (e) { console.error(e); }
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

      await axios.post(`${API}/courses/${courseId}/topics`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setNewSubForm({ name: '', sourceUrl: '', wikidataId: '', video: '', article: '', podcast: '', file: null });
      setAddingSubTo(null);
      fetchCourse();
    } catch (e) { console.error(e); }
  };

  const addTopic = async () => {
    if (!newTopicForm.name.trim()) return;
    try {
      const formData = new FormData();
      formData.append('name', newTopicForm.name.trim());
      if (newTopicForm.sourceUrl.trim()) formData.append('sourceUrl', newTopicForm.sourceUrl.trim());
      if (newTopicForm.wikidataId.trim()) formData.append('wikidataId', newTopicForm.wikidataId.trim());
      if (newTopicForm.file) formData.append('pdf', newTopicForm.file);

      await axios.post(`${API}/courses/${courseId}/topics`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setNewTopicForm({ name: '', sourceUrl: '', wikidataId: '', file: null });
      setIsAddingTopic(false);
      fetchCourse();
    } catch (e) { console.error(e); }
  };

  // One editor handles plain links, source re-scraping, and PDF replacement.
  const saveLinks = async (subId: string) => {
    try {
      const formData = new FormData();
      formData.append('videoUrl', linkData.video);
      formData.append('articleUrl', linkData.article);
      formData.append('podcastUrl', linkData.podcast);
      if (linkData.sourceUrl.trim()) formData.append('sourceUrl', linkData.sourceUrl.trim());
      if (linkData.file) formData.append('pdf', linkData.file);

      await axios.put(`${API}/courses/${courseId}/topics/${subId}`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setEditingSubId(null); fetchCourse();
    } catch (e) { console.error(e); }
  };

  // Hide the stale /uploads/... value when a new replacement PDF is selected.
  const handleReplacementFile = (file: File | null) => {
    setLinkData((prev) => ({
      ...prev,
      file,
      sourceUrl: file ? '' : prev.sourceUrl,
      article: file && prev.article.includes('/uploads/') ? '' : prev.article,
    }));
  };

  // Clearing articleUrl removes the current local PDF association for that node.
  const clearAttachedPdf = async (topicId: string) => {
    try {
      await axios.put(`${API}/courses/${courseId}/topics/${topicId}`, {
        articleUrl: ''
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingSubId === topicId) {
        setLinkData((prev) => ({ ...prev, article: '', file: null, sourceUrl: '' }));
      }
      fetchCourse();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTopicDrop = async (srcId: string, targetId: string) => {
    if (!course || srcId === targetId) return;
    const topics = [...course.topics];
    const srcIdx = topics.findIndex((t: any) => t.id === srcId);
    const tgtIdx = topics.findIndex((t: any) => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = topics.splice(srcIdx, 1);
    topics.splice(tgtIdx, 0, moved);
    setCourse({ ...course, topics });
    for (let i = 0; i < topics.length; i++) {
      await axios.put(`${API}/courses/${courseId}/topics/${topics[i].id}`, { order: i }, { headers: { Authorization: `Bearer ${token}` } });
    }
  };

  const handleSubtopicDrop = async (srcId: string, targetId: string, parentTopicId: string, targetParentId: string) => {
    if (!course || srcId === targetId || parentTopicId !== targetParentId) return;
    
    const parentTopic = course.topics.find((t: any) => t.id === parentTopicId);
    if (!parentTopic || !parentTopic.subtopics) return;

    const subtopics = [...parentTopic.subtopics];
    const srcIdx = subtopics.findIndex((t: any) => t.id === srcId);
    const tgtIdx = subtopics.findIndex((t: any) => t.id === targetId);
    
    if (srcIdx === -1 || tgtIdx === -1) return;
    
    const [moved] = subtopics.splice(srcIdx, 1);
    subtopics.splice(tgtIdx, 0, moved);
    
    const updatedTopics = course.topics.map((t: any) => 
      t.id === parentTopicId ? { ...t, subtopics } : t
    );
    setCourse({ ...course, topics: updatedTopics });
    
    for (let i = 0; i < subtopics.length; i++) {
      await axios.put(`${API}/courses/${courseId}/topics/${subtopics[i].id}`, { order: i }, { headers: { Authorization: `Bearer ${token}` } });
    }
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
      await axios.put(`${API}/courses/${courseId}/topics/${id}`, { name: editingNameValue }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingNameId(null);
      fetchCourse();
    } catch(e) { console.error(e); }
  };

  const deleteTopic = async (id: string) => {
    if (!window.confirm("Delete this topic/subtopic permanently?")) return;
    try {
      await axios.delete(`${API}/courses/${courseId}/topics/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (editingSubId === id) setEditingSubId(null);
      fetchCourse();
    } catch(e) { console.error(e); }
  };

  const getEmptyQuestion = () => ({
    type: 'multiple_choice',
    question: '',
    options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
    correctIndex: 0,
    correctAnswer: true,
    correctIndices: [0],
    items: ['Step 1', 'Step 2', 'Step 3'],
    correctOrder: [0, 1, 2],
    acceptedAnswers: ['Answer'],
    explanation: '',
    points: 10,
  });

  const openQuizEditor = (topic: any) => {
    const existingQuiz = Array.isArray(topic.quizzes) && topic.quizzes.length > 0 ? topic.quizzes[0] : null;
    setQuizEditorTopic(topic);
    setQuizEditorQuiz(existingQuiz);
    setQuizEditorQuestions(Array.isArray(existingQuiz?.questions) && existingQuiz.questions.length > 0 ? existingQuiz.questions : [getEmptyQuestion()]);
    setQuizEditorOpen(true);
  };

  const generateQuizDraft = async (topic: any) => {
    try {
      setQuizEditorBusy(true);
      const res = await axios.post(
        `${API}/topics/${topic.id}/enrich`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedTopic = res.data?.topic || topic;
      const quiz = Array.isArray(updatedTopic?.quizzes) && updatedTopic.quizzes.length > 0 ? updatedTopic.quizzes[0] : null;
      setQuizEditorTopic(updatedTopic);
      setQuizEditorQuiz(quiz);
      setQuizEditorQuestions(Array.isArray(quiz?.questions) && quiz.questions.length > 0 ? quiz.questions : [getEmptyQuestion()]);
      setQuizEditorOpen(true);
      fetchCourse();
    } catch (err) {
      console.error('Failed to generate quiz draft', err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || 'AI generation failed.'
        : 'AI generation failed.';
      alert(message);
    } finally {
      setQuizEditorBusy(false);
    }
  };

  const updateQuizQuestion = (index: number, patch: any) => {
    setQuizEditorQuestions((prev) => prev.map((question, currentIndex) => (currentIndex === index ? { ...question, ...patch } : question)));
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
          points: Number.isFinite(Number(question.points)) ? Number(question.points) : 10,
        }))
        .filter((question) => question.question.length > 0);

      if (quizEditorQuiz?.id) {
        await axios.put(
          `${API}/topics/quizzes/${quizEditorQuiz.id}`,
          { questions },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API}/quizzes`,
          { topicId: quizEditorTopic.id, questions },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      setQuizEditorOpen(false);
      setQuizEditorTopic(null);
      setQuizEditorQuiz(null);
      setQuizEditorQuestions([]);
      fetchCourse();
    } catch (err) {
      console.error('Failed to save quiz', err);
      alert('Could not save quiz.');
    } finally {
      setQuizEditorSaving(false);
    }
  };

  const renderQuizOverview = (topic: any) => {
    const existingQuiz = Array.isArray(topic?.quizzes) && topic.quizzes.length > 0 ? topic.quizzes[0] : null;
    const questions = Array.isArray(existingQuiz?.questions) ? existingQuiz.questions : [];

    if (!existingQuiz || questions.length === 0) return null;

    return (
      <div className="mt-3 rounded-2xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300">Quiz Overview</p>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{questions.length} question{questions.length === 1 ? '' : 's'} ready for review</p>
          </div>
          <button
            onClick={() => openQuizEditor(topic)}
            className="shrink-0 px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-800 text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-300 hover:bg-purple-100/70 dark:hover:bg-purple-900/30 transition-colors"
          >
            Review Quiz
          </button>
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

  // Resource Overview is a compact audit of sources attached to the node.
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
          <button
            onClick={() => {
              setEditingSubId(editingSubId === topic.id ? null : topic.id);
              setLinkData({
                video: topic.videoUrl || '',
                article: topic.articleUrl || '',
                podcast: topic.podcastUrl || '',
                sourceUrl: '',
                file: null
              });
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-blue-600 hover:bg-blue-100/70 dark:hover:bg-blue-950/20"
            aria-label="Edit topic resources"
            title="Edit topic resources"
          >
            <Edit2 size={14} />
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, index) => (
            (() => {
              const href = item.label === 'Wikidata'
                ? `https://www.wikidata.org/wiki/${item.value}`
                : (resolveResourceUrl(item.value) || '#');

              return (
            <a
              key={`${topic.id}-resource-${index}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-gray-900/50 border border-white/70 dark:border-gray-800 px-3 py-2 hover:bg-white dark:hover:bg-gray-900 transition-colors"
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
            })()
          ))}
        </div>
      </div>
    );
  };

  // Label the preview honestly by source type instead of always calling it Wikipedia.
  const getContentPreviewMeta = (topic: any) => {
    if (!topic?.content) return null;

    if (topic.wikidataId) {
      return {
        title: 'Wikidata Overview',
        actionOpen: 'Collapse',
        actionClosed: 'Expand',
      };
    }

    if (typeof topic.articleUrl === 'string' && topic.articleUrl.includes('/uploads/')) {
      return {
        title: 'PDF Extract',
        actionOpen: 'Hide Preview',
        actionClosed: 'Show Preview',
      };
    }

    if (typeof topic.articleUrl === 'string' && topic.articleUrl.trim()) {
      return {
        title: 'Source Extract',
        actionOpen: 'Hide Preview',
        actionClosed: 'Show Preview',
      };
    }

    return {
      title: 'Source Notes',
      actionOpen: 'Hide Preview',
      actionClosed: 'Show Preview',
    };
  };

  const renderQuestionEditor = (question: any, index: number) => {
    const setCommaSeparatedValues = (value: string, key: string) => {
      const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
      updateQuizQuestion(index, { [key]: parsed });
    };

    return (
      <div key={index} className="relative p-5 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border dark:border-gray-700">
        <div className="absolute -top-3 -left-3 w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-lg">
          {index + 1}
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Question type</label>
          <select
            value={question.type || 'multiple_choice'}
            onChange={(e) => updateQuizQuestion(index, { type: e.target.value })}
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="true_false">True / False</option>
            <option value="multiple_select">Multiple select</option>
            <option value="reorder">Reorder</option>
            <option value="open_answer">Open answer</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Question</label>
          <input
            type="text"
            value={question.question || ''}
            onChange={(e) => updateQuizQuestion(index, { question: e.target.value })}
            className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
          />
        </div>

        {(question.type === 'multiple_choice' || question.type === 'multiple_select') && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Options, separated by commas</label>
            <textarea
              value={Array.isArray(question.options) ? question.options.join(', ') : ''}
              onChange={(e) => setCommaSeparatedValues(e.target.value, 'options')}
              className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        {question.type === 'multiple_choice' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct option index</label>
            <input
              type="number"
              value={question.correctIndex ?? 0}
              onChange={(e) => updateQuizQuestion(index, { correctIndex: Number(e.target.value) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        {question.type === 'true_false' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct answer</label>
            <select
              value={question.correctAnswer ? 'true' : 'false'}
              onChange={(e) => updateQuizQuestion(index, { correctAnswer: e.target.value === 'true' })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </div>
        )}

        {question.type === 'multiple_select' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct indices, separated by commas</label>
            <input
              type="text"
              value={Array.isArray(question.correctIndices) ? question.correctIndices.join(', ') : ''}
              onChange={(e) => updateQuizQuestion(index, { correctIndices: e.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        {question.type === 'reorder' && (
          <>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Items, separated by commas</label>
              <textarea
                value={Array.isArray(question.items) ? question.items.join(', ') : ''}
                onChange={(e) => updateQuizQuestion(index, { items: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correct order indexes, separated by commas</label>
              <input
                type="text"
                value={Array.isArray(question.correctOrder) ? question.correctOrder.join(', ') : ''}
                onChange={(e) => updateQuizQuestion(index, { correctOrder: e.target.value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite) })}
                className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
              />
            </div>
          </>
        )}

        {question.type === 'open_answer' && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Accepted answers, separated by commas</label>
            <input
              type="text"
              value={Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers.join(', ') : ''}
              onChange={(e) => updateQuizQuestion(index, { acceptedAnswers: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Explanation</label>
            <textarea
              value={question.explanation || ''}
              onChange={(e) => updateQuizQuestion(index, { explanation: e.target.value })}
              className="w-full min-h-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Points</label>
            <input
              type="number"
              value={question.points ?? 10}
              onChange={(e) => updateQuizQuestion(index, { points: Number(e.target.value) })}
              className="w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={() => setQuizEditorQuestions((prev) => prev.filter((_, currentIndex) => currentIndex !== index))} className="text-red-500 hover:text-red-700 p-2 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="py-20 text-center text-gray-400 text-xs uppercase tracking-widest">Synchronizing...</div>;
  if (!course) return null;

  // Build one flat topic list so each student's completion can be calculated consistently with the learner view.
  const flatCourseTopics = Array.isArray(course.topics)
    ? course.topics.flatMap((topic: any) => [
        { id: topic.id, name: topic.name },
        ...(Array.isArray(topic.subtopics) ? topic.subtopics.map((subtopic: any) => ({ id: subtopic.id, name: subtopic.name })) : []),
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
          <button onClick={async () => { if(window.confirm("Delete?")) { await axios.delete(`${API}/courses/${courseId}`, {headers: {Authorization: `Bearer ${token}`}}); navigate('/dashboard'); } }} className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={14} /> Delete Course</button>
        </div>

        <div className="bg-gray-100/80 dark:bg-gray-900/50 p-1 rounded-xl flex gap-1 mb-8 border dark:border-gray-800 w-full overflow-x-auto sm:w-fit">
          {["overview", "students", "nodes", "statistics", "feedback"].map((t) => (
            <button key={t} onClick={() => setTab(t as any)} className={`shrink-0 px-6 sm:px-8 py-2 text-xs font-bold rounded-lg transition-all ${tab === t ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-gray-400"}`}>{t.toUpperCase()}</button>
          ))}
        </div>

        <main>
          {tab === "overview" && (
            <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border dark:border-gray-700 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><Users size={24} /></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Students</p><p className="text-2xl font-black dark:text-white">{course.students?.length || 0}</p></div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border dark:border-gray-700 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><BookOpen size={24} /></div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Nodes</p><p className="text-2xl font-black dark:text-white">{course.topics?.length || 0}</p></div>
                </div>
                <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${course.isPublic ? 'bg-green-50/30 border-green-100' : 'bg-blue-50/30 border-blue-100'}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${course.isPublic ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>{course.isPublic ? <Globe size={24} /> : <Lock size={24} />}</div>
                  <div><p className="text-[10px] font-bold text-gray-400 uppercase">Visibility</p><p className={`text-2xl font-black ${course.isPublic ? 'text-green-600' : 'text-blue-600'}`}>{course.isPublic ? 'Public' : 'Private'}</p></div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border dark:border-gray-700 shadow-sm">
                <h3 className="text-[10px] font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest">Access Configuration</h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 sm:p-5 rounded-2xl border dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div><p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Student Join Code</p><p className="text-xl font-mono font-bold text-blue-600 uppercase tracking-widest">{course.joinCode}</p></div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(course.joinCode);
                      setJoinCodeCopied(true);
                      setTimeout(() => setJoinCodeCopied(false), 2000);
                    }} 
                    className="p-2.5 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 flex items-center gap-2 text-xs font-bold text-gray-500 w-full justify-center sm:w-auto min-w-[100px]"
                  >
                    {joinCodeCopied ? (
                      <><Check size={18} className="text-green-500" /> <span className="text-green-600">COPIED!</span></>
                    ) : (
                      <><Copy size={18} /> <span className="sm:hidden">COPY</span></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STUDENTS TAB RESTORED */}
          {tab === "students" && (
            <div className="space-y-3 animate-in fade-in">
              <h2 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4">Enrolled Students</h2>
              {(!course.students || course.students.length === 0) ? (
                <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">No students yet</div>
              ) : (
                course.students.map((s: any) => {
                  // Reuse student progress entries to compute completion and unresolved-topic question markers.
                  const progressByTopicId = new Map(
                    (Array.isArray(s.progress) ? s.progress : []).map((item: any) => [item.topicId, Boolean(item.completed)])
                  );
                  const completedCount = flatCourseTopics.reduce((count: number, topic: any) => {
                    return count + (progressByTopicId.get(topic.id) ? 1 : 0);
                  }, 0);
                  const totalTopics = flatCourseTopics.length;
                  const completionPercent = totalTopics === 0 ? 0 : Math.round((completedCount / totalTopics) * 100);
                  const needsHelpTopics = flatCourseTopics.filter((topic: any) => !progressByTopicId.get(topic.id));

                  return (
                  <div key={s.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">{s.email?.[0].toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-bold dark:text-white">{s.name || "Student"}</p>
                        <p className="text-[10px] text-gray-500">{s.email}</p>
                      </div>
                    </div>
                    <div className="text-right min-w-[220px]">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Progress</p>
                      <p className="text-sm font-black text-blue-600">{completionPercent}%</p>
                      {/* Match student syllabus progress look: neutral track + yellow fill. */}
                      <div className="mt-1 h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${completionPercent}%`, background: '#F5C518' }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {`${completedCount}/${totalTopics} topics completed`}
                      </p>
                      {needsHelpTopics.length > 0 && (
                        <div className="mt-2 flex flex-wrap justify-end gap-1">
                          {needsHelpTopics.slice(0, 3).map((topic: any) => (
                            <span key={`${s.id}-${topic.id}`} className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                              {topic.name} ?
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )})
              )}
            </div>
          )}

          {tab === "statistics" && (
            <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">
              Statistics coming soon
            </div>
          )}

          {tab === "feedback" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">Student Feedback</h2>
                <button onClick={fetchFeedback} className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  Refresh
                </button>
              </div>
              {feedbackError ? (
                <div className="p-6 rounded-3xl border border-red-200 bg-red-50 text-sm font-bold text-red-600">
                  {feedbackError}
                </div>
              ) : feedback.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed rounded-3xl text-gray-400 text-sm">
                  No feedback yet
                </div>
              ) : (
                feedback.map((item) => (
                  <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5">
                    <div className="flex justify-between gap-4 mb-2">
                      <div>
                        <p className="text-xs font-black uppercase text-blue-600">{item.topic?.name || 'Unknown node'}</p>
                        <p className="text-xs text-gray-500">{item.user?.email || 'Student'}</p>
                      </div>
                      <p className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{item.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "nodes" && (
            <div className="space-y-4 animate-in slide-in-from-bottom-2">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">Curriculum Nodes</h2>
                <button onClick={() => setIsAddingTopic(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase shadow-md">+ Add Topic</button>
              </div>

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
                <div 
                  key={topic.id} draggable
                  onDragStart={(e) => e.dataTransfer.setData('topicId', topic.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleTopicDrop(e.dataTransfer.getData('topicId'), topic.id)}
                  className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm mb-4 group transition-all"
                >
                  <div className="flex items-center justify-between mb-4 font-bold">
                    <div className="flex items-center gap-3 w-full">
                      <GripVertical size={16} className="text-gray-300 cursor-grab group-hover:text-gray-500" />
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: BLUE }}>{i + 1}</div>
                      {editingNameId === topic.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input autoFocus className="flex-1 px-2 py-1 text-sm rounded border dark:border-gray-600 outline-none dark:bg-gray-900 dark:text-white" value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName(topic.id)} />
                          <button onClick={() => saveName(topic.id)} className="text-xs text-blue-600 font-bold">Save</button>
                          <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600"><X size={14}/></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title w-full">
                          <h3 className="text-base dark:text-white">{topic.name}</h3>
                          <button onClick={() => startEditingName(topic.id, topic.name)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Edit2 size={12} /></button>
                          <button onClick={() => deleteTopic(topic.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
                          <button onClick={() => openQuizEditor(topic)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">Quiz</button>
                          <button onClick={() => generateQuizDraft(topic)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">AI Quiz</button>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => setExpandedMainTopics(prev => ({...prev, [topic.id]: !prev[topic.id]}))} 
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                    >
                      <ChevronDown size={18} className={`transition-transform duration-200 ${expandedMainTopics[topic.id] ? '' : '-rotate-90'}`} />
                    </button>
                  </div>
                  
                  {expandedMainTopics[topic.id] && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      {/* WIKIDATA CONTENT PREVIEW */}
                  {topic.content && getContentPreviewMeta(topic) && (
                    <div className="ml-6 mb-6 pl-4 border-l-2 border-gray-100 dark:border-gray-800 relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{getContentPreviewMeta(topic)?.title}</p>
                        <button onClick={() => setExpandedTopics(prev => ({...prev, [topic.id]: prev[topic.id] === undefined ? false : !prev[topic.id]}))} className="text-[10px] text-blue-600 font-bold uppercase transition-all hover:text-blue-700">
                          {expandedTopics[topic.id] !== false ? getContentPreviewMeta(topic)?.actionOpen : getContentPreviewMeta(topic)?.actionClosed}
                        </button>
                      </div>
                      {expandedTopics[topic.id] !== false && (
                        <div 
                           className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border dark:border-gray-800 overflow-y-auto max-h-40"
                           dangerouslySetInnerHTML={{ __html: topic.content }} 
                        />
                      )}
                    </div>
                  )}

                  <div className="ml-6 mt-3 flex flex-wrap items-center gap-2">
                    {topic.articleUrl?.includes('/uploads/') && (
                      <button
                        onClick={() => clearAttachedPdf(topic.id)}
                        className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                      >
                        Delete Current PDF
                      </button>
                    )}
                  </div>

                  {renderResourceOverview(topic)}
                  {renderQuizOverview(topic)}

                  {editingSubId === topic.id && (
                    <div className="ml-6 mt-4 rounded-2xl border dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                          <Play size={12} className="text-red-500" />
                          <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Video URL" value={linkData.video} onChange={e => setLinkData({...linkData, video: e.target.value})} />
                        </div>
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                          <BookOpen size={12} className="text-blue-500" />
                          <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Article URL" value={linkData.article} onChange={e => setLinkData({...linkData, article: e.target.value})} />
                        </div>
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                          <Headphones size={12} className="text-green-500" />
                          <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Podcast URL" value={linkData.podcast} onChange={e => setLinkData({...linkData, podcast: e.target.value})} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                          <BookOpen size={12} className="text-violet-500" />
                          <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="New source URL to rescrape" value={linkData.sourceUrl} onChange={e => setLinkData({...linkData, sourceUrl: e.target.value})} />
                        </div>
                        <label className="flex items-center justify-between gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700 cursor-pointer">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 truncate">{linkData.file?.name || 'Replace attached PDF'}</span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Upload</span>
                          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleReplacementFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => saveLinks(topic.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md">Save</button>
                      </div>
                    </div>
                  )}

                  <div className="pl-6 border-l-2 border-gray-100 dark:border-gray-800 space-y-2 ml-6">
                    {topic.subtopics?.map((sub: any) => (
                      <div 
                        key={sub.id} 
                        draggable
                        onDragStart={(e) => {
                           e.stopPropagation();
                           e.dataTransfer.setData('subtopicId', sub.id);
                           e.dataTransfer.setData('parentTopicId', topic.id);
                        }}
                        onDragOver={(e) => {
                           e.preventDefault();
                           e.stopPropagation();
                        }}
                        onDrop={(e) => {
                           e.stopPropagation();
                           handleSubtopicDrop(e.dataTransfer.getData('subtopicId'), sub.id, e.dataTransfer.getData('parentTopicId'), topic.id);
                        }}
                        className={`p-4 rounded-2xl border transition-all ${sub.aiSuggested ? 'border-dashed border-red-500 bg-red-50/30' : 'bg-gray-50/50 dark:bg-gray-900/30 border-transparent'}`}
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical size={14} className="text-gray-300 cursor-grab hover:text-gray-500 transition-colors" />
                          <div className="flex-1">
                            {editingNameId === sub.id ? (
                              <div className="flex items-center gap-2">
                                <input autoFocus className="flex-1 px-2 py-1 text-sm rounded border dark:border-gray-600 outline-none dark:bg-gray-900 dark:text-white" value={editingNameValue} onChange={e => setEditingNameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName(sub.id)} />
                                <button onClick={() => saveName(sub.id)} className="text-xs text-blue-600 font-bold">Save</button>
                                <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600"><X size={14}/></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group/subtitle">
                                <p className="font-bold dark:text-white text-sm">{sub.name}</p>
                                <button onClick={() => startEditingName(sub.id, sub.name)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><Edit2 size={12} /></button>
                                <button onClick={() => deleteTopic(sub.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><Trash2 size={12} /></button>
                                <button onClick={() => openQuizEditor(sub)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">Quiz</button>
                                <button onClick={() => generateQuizDraft(sub)} className="text-gray-400 hover:text-purple-600 transition-colors p-1 text-[10px] font-black uppercase">AI Quiz</button>
                              </div>
                            )}
                            {sub.aiSuggested && <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 mt-1"><Sparkles size={10}/> AI Suggestion</span>}
                            {renderResourceOverview(sub)}
                            {renderQuizOverview(sub)}
                          </div>
                          <button onClick={() => {
                            setEditingSubId(editingSubId === sub.id ? null : sub.id);
                            setLinkData({ video: sub.videoUrl || '', article: sub.articleUrl || '', podcast: sub.podcastUrl || '', sourceUrl: '', file: null });
                          }} className="text-gray-400 hover:text-blue-600 p-2"><ChevronRight size={16} className={editingSubId === sub.id ? 'rotate-90' : ''}/></button>
                        </div>

                        {editingSubId === sub.id && (
                          <div className="mt-4 pt-4 border-t space-y-3 animate-in fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                <Play size={12} className="text-red-500" />
                                <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Video URL" value={linkData.video} onChange={e => setLinkData({...linkData, video: e.target.value})} />
                              </div>
                              <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                <BookOpen size={12} className="text-blue-500" />
                                <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Article URL" value={linkData.article} onChange={e => setLinkData({...linkData, article: e.target.value})} />
                              </div>
                              <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                <Headphones size={12} className="text-green-500" />
                                <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="Podcast URL" value={linkData.podcast} onChange={e => setLinkData({...linkData, podcast: e.target.value})} />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                                <BookOpen size={12} className="text-violet-500" />
                                <input className="text-[10px] outline-none w-full bg-transparent dark:text-white" placeholder="New source URL to rescrape" value={linkData.sourceUrl} onChange={e => setLinkData({...linkData, sourceUrl: e.target.value})} />
                              </div>
                              <label className="flex items-center justify-between gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700 cursor-pointer">
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 truncate">{linkData.file?.name || 'Replace attached PDF'}</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Upload</span>
                                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleReplacementFile(e.target.files?.[0] || null)} />
                              </label>
                            </div>
                            <div className="flex justify-end mt-2">
                              <button onClick={() => saveLinks(sub.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md">Save</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {addingSubTo === topic.id ? (
                      <div className="mt-3 rounded-2xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                        <input autoFocus className="w-full px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Subtopic Name..." value={newSubForm.name} onChange={(e) => setNewSubForm((prev) => ({ ...prev, name: e.target.value }))} />
                        <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Wikidata</p>
                          <WikidataSearchField
                            query={newSubWikiQuery}
                            results={newSubWikiResults}
                            placeholder="Search a topic in Wikidata"
                            onQueryChange={(value) => {
                              setNewSubForm((prev) => ({ ...prev, wikidataId: '' }));
                              searchWiki(value, setNewSubWikiQuery, setNewSubWikiResults);
                            }}
                            onSelect={(item) => selectWikiResult(item, setNewSubWikiQuery, setNewSubWikiResults, setNewSubForm)}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input className="px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Video URL" value={newSubForm.video} onChange={(e) => setNewSubForm((prev) => ({ ...prev, video: e.target.value }))} />
                          <input className="px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Article URL" value={newSubForm.article} onChange={(e) => setNewSubForm((prev) => ({ ...prev, article: e.target.value }))} />
                          <input className="px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Podcast URL" value={newSubForm.podcast} onChange={(e) => setNewSubForm((prev) => ({ ...prev, podcast: e.target.value }))} />
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-dashed dark:border-gray-700 px-4 py-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">PDF Source</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{newSubForm.file?.name || 'No file selected'}</p>
                          </div>
                          <label className="cursor-pointer rounded-xl bg-gray-100 dark:bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                            Upload PDF
                            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setNewSubForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} />
                          </label>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setAddingSubTo(null); setNewSubForm({ name: '', sourceUrl: '', wikidataId: '', video: '', article: '', podcast: '', file: null }); setNewSubWikiQuery(''); setNewSubWikiResults([]); }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase text-gray-500">Cancel</button>
                          <button onClick={() => addSubtopic(topic.id)} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold">Add</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingSubTo(topic.id)} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline uppercase tracking-widest">
                        <Plus size={14} /> Add Subtopic / Links
                      </button>
                    )}
                  </div>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
        </main>

        {quizEditorOpen && quizEditorTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in transition-all">
            <div className="bg-white dark:bg-gray-800 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border dark:border-gray-700">
              <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <div>
                  <h3 className="text-xl font-bold dark:text-white">Quiz Editor ✨</h3>
                  <p className="text-xs text-gray-400 mt-1">AI builds a draft from Wikidata, saved article text, or attached source material. Then you can review, edit, and save it.</p>
                </div>
                <button onClick={() => setQuizEditorOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => generateQuizDraft(quizEditorTopic)}
                    disabled={quizEditorBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {quizEditorBusy ? 'Generating...' : 'Generate AI Draft'}
                  </button>
                  <button
                    onClick={() => setQuizEditorQuestions((prev) => [...prev, getEmptyQuestion()])}
                    className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-widest"
                    style={{ borderColor: 'var(--cn-border)', color: 'var(--cn-text)' }}
                  >
                    <Plus size={14} /> Add Question
                  </button>
                </div>

                {quizEditorQuestions.map((question, index) => renderQuestionEditor(question, index))}
              </div>

              <div className="p-6 border-t dark:border-gray-700 flex gap-3 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex-1" />
                <button onClick={() => setQuizEditorOpen(false)} className="px-6 py-2 text-sm font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={saveQuizEditor} disabled={quizEditorSaving} className="px-8 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20">
                  {quizEditorSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
