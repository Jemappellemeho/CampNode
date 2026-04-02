// CoursePlayer is the student view for reading course topics.
// Layout: fixed sidebar on the left (topics list + language switcher),

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  BookOpen, Headphones, HelpCircle, Play,
  X, LayoutList
} from 'lucide-react';
import TopicAbstractModal from '../components/TopicAbstractModal';

const API = 'http://localhost:3000/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubTopic {
  id: string;
  name: string;
  description?: string;
  completed: boolean;
  aiSuggested?: boolean;
  videoUrl?: string;
  articleUrl?: string;
  podcastUrl?: string;
  quizzes?: { id: string }[];
  prerequisites?: { id: string; name: string }[];
  wikidataId?: string;
}

interface Topic {
  id: string;
  name: string;
  description?: string;
  order: number;
  completed: boolean;
  subtopics: SubTopic[];
  quizzes?: { id: string }[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
  topics: Topic[];
  progressMap: Record<string, boolean>;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
const BLUE   = '#1E6FFF';
const RED    = '#E63027';
const GREEN  = '#3A9E3F';
const YELLOW = '#F5C518';
const DARK   = '#1a2340';

function topicHexColor(topic: Topic): string {
  if (topic.completed) return GREEN;
  if (topic.subtopics.some(s => s.completed)) return YELLOW;
  return DARK;
}

function subtopicDiamondColor(sub: SubTopic, parentComplete: boolean): string {
  if (sub.completed) return GREEN;
  if (sub.aiSuggested) return RED;
  if (parentComplete) return BLUE; // parent done → all subs unlocked
  return BLUE; // always show unlocked for now; lock logic can be added per prereqs
}

// ─── SVG shape components ─────────────────────────────────────────────────────

/** Hexagon node (flat-top, used for parent topics) */
function HexagonNode({
  label, subLabel, color, onClick, size = 110,
}: {
  label: string; subLabel?: string; color: string; onClick?: () => void; size?: number;
}) {
  const w = size;
  const h = size * 0.866; // cos(30°)
  const cx = w / 2;
  const cy = h / 2;
  const r  = w / 2;
  // Flat-top hexagon points
  const pts = [0,1,2,3,4,5].map(i => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');

  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center cursor-pointer select-none"
      style={{ width: w }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        <polygon
          points={pts}
          fill={color}
          stroke={color === DARK ? '#2a3558' : 'none'}
          strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))' }}
        />
        <foreignObject x={4} y={4} width={w - 8} height={h - 8}>
          <div
            style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: 4,
            }}
          >
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 10, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {label}
            </span>
            {subLabel && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, marginTop: 2 }}>
                {subLabel}
              </span>
            )}
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}

/** Diamond node (rotated square, used for subtopics) */
function DiamondNode({
  label, color, onClick, aiSuggested = false, size = 90,
}: {
  label: string; color: string; onClick?: () => void; aiSuggested?: boolean; size?: number;
}) {
  const s = size;
  return (
    <div className="flex flex-col items-center" style={{ width: s + 20 }}>
      <div
        onClick={onClick}
        className="cursor-pointer select-none relative flex items-center justify-center"
        style={{
          width: s, height: s,
          transform: 'rotate(45deg)',
          background: color,
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}
      >
        <span
          style={{
            transform: 'rotate(-45deg)',
            color: '#fff', fontWeight: 700, fontSize: 10,
            textAlign: 'center', textTransform: 'uppercase',
            letterSpacing: 0.3, lineHeight: 1.2,
            maxWidth: s * 0.7, display: 'block',
          }}
        >
          {label}
        </span>
      </div>
      {aiSuggested && (
        <span style={{ fontSize: 9, color: RED, marginTop: 4, fontWeight: 600 }}>
          AI suggested
        </span>
      )}
    </div>
  );
}

/** Resource icon row under a node */
function ResourceRow({
  topic, onQuiz, onArticle,
}: {
  topic: SubTopic | Topic;
  onQuiz?: () => void;
  onArticle?: () => void;
}) {
  const sub = topic as SubTopic;
  const hasVideo   = !!sub.videoUrl;
  const hasArticle = !!sub.articleUrl || !!onArticle;
  const hasPodcast = !!sub.podcastUrl;
  const hasQuiz    = sub.quizzes && sub.quizzes.length > 0;

  const iconBtn = (
    icon: ReactNode,
    url?: string,
    action?: () => void,
    active = true,
  ) => (
    <button
      disabled={!active}
      onClick={() => {
        if (action) {
          action();
          return;
        }
        if (url) {
          window.open(url, '_blank');
        }
      }}
      className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        color: active ? '#fff' : 'rgba(255,255,255,0.25)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex gap-1 justify-center mt-2">
      {iconBtn(<Play size={12} />, sub.videoUrl, undefined, hasVideo)}
      {iconBtn(<BookOpen size={12} />, undefined, onArticle, hasArticle)}
      {iconBtn(<Headphones size={12} />, sub.podcastUrl, undefined, hasPodcast)}
      {iconBtn(<HelpCircle size={12} />, undefined, onQuiz, hasQuiz)}
    </div>
  );
}

// ─── Syllabus Panel ───────────────────────────────────────────────────────────
function SyllabusPanel({
  course, progressPct, onClose,
}: {
  course: Course; progressPct: number; onClose: () => void;
}) {
  const statusIcon = (completed: boolean, locked: boolean) => {
    if (completed) return <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>;
    if (locked)    return <span style={{ color: '#888' }}>🔒</span>;
    return <span style={{ color: YELLOW }}>→</span>;
  };

  return (
    <div
      className="fixed top-0 right-0 h-full w-80 z-50 overflow-y-auto"
      style={{
        background: '#fff',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: '#eee' }}>
        <h2 style={{ fontWeight: 900, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }}>
          Course Syllabus
        </h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X size={18} />
        </button>
      </div>

      {/* Progress */}
      <div className="mx-4 mt-4 mb-2 p-4 rounded-xl" style={{ border: '1px solid #eee' }}>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Overall Progress</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 rounded-full" style={{ background: '#e5e7eb' }}>
            <div
              className="h-3 rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: YELLOW }}
            />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{progressPct}%</span>
        </div>
      </div>

      {/* Topics */}
      <div className="px-4 pb-8 mt-2 flex flex-col gap-4">
        {course.topics.map((topic, ti) => {
          const doneCount = topic.subtopics.filter(s => s.completed).length;
          const total     = topic.subtopics.length;
          return (
            <div key={topic.id}>
              <div className="flex items-baseline gap-2 mb-1">
                <span style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>
                  {ti + 1}. {topic.name.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, color: '#888' }}>
                  ({doneCount}/{total})
                </span>
              </div>
              {topic.description && (
                <p style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
                  {topic.description}
                </p>
              )}
              <div className="flex flex-col gap-1 pl-2 border-l-2" style={{ borderColor: '#eee' }}>
                {topic.subtopics.map((sub, si) => {
                  const locked = si > 0 && !topic.subtopics[si - 1].completed;
                  return (
                    <div key={sub.id} className="flex items-center gap-2">
                      {statusIcon(sub.completed, locked)}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: sub.completed ? GREEN : locked ? '#aaa' : sub.aiSuggested ? RED : BLUE,
                        }}
                      >
                        {sub.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CoursePlayer() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate     = useNavigate();
  const [course, setCourse]           = useState<Course | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [syllabusOpen, setSyllabusOpen] = useState(false);
  const [user, setUser]               = useState<any>(null);
  const [activeContent, setActiveContent] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const fetchCourse = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${API}/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourse(res.data);
    } catch (e) {
      setError('Failed to load course. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const markComplete = async (topicId: string, completed: boolean) => {
    const token = localStorage.getItem('token');
    try {
      await axios.patch(
        `${API}/courses/${courseId}/progress/${topicId}`,
        { completed },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      fetchCourse(); // refresh to update colors
    } catch (e) { console.error(e); }
  };

  const openSubtopicArticle = async (sub: SubTopic) => {
    const token = localStorage.getItem('token');

    // Prefer topic-based endpoint: it can resolve article by wikidataId or topic name.
    try {
      const res = await axios.get(`${API}/topics/${sub.id}/content?lang=en`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.content) {
        setActiveContent({
          title: sub.name,
          content: res.data.content,
        });
        return;
      }
    } catch (e) {
      console.error('Failed to load topic content', e);
    }

    // Fallback to direct Wikidata route for legacy entries where wikidataId is available.
    if (sub.wikidataId) {
      try {
        const res = await axios.get(`${API}/wiki/article/${sub.wikidataId}?lang=en`);
        if (res.data?.content) {
          setActiveContent({
            title: res.data.title || sub.name,
            content: res.data.content,
          });
          return;
        }
      } catch (e) {
        console.error('Failed to load wiki article', e);
      }
    }

    if (sub.articleUrl) {
      window.open(sub.articleUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // ── Progress calculation ───────────────────────────────────────────────────
  const calcProgress = (c: Course): number => {
    const allSubs = c.topics.flatMap(t => t.subtopics);
    if (!allSubs.length) return 0;
    const done = allSubs.filter(s => s.completed).length;
    return Math.round((done / allSubs.length) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f6fb' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p style={{ color: '#888', fontSize: 14 }}>Loading your course…</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f6fb' }}>
        <div className="text-center">
          <p style={{ color: RED, fontWeight: 700, marginBottom: 12 }}>{error || 'Course not found'}</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 rounded-xl text-white font-bold" style={{ background: BLUE }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const progressPct = calcProgress(course);

  const sortedTopics = [...course.topics].sort((a, b) => a.order - b.order);


  return (
    <div
      className="min-h-screen"
      style={{ background: '#f0f3fa', fontFamily: 'system-ui, sans-serif' }}
    >
      {/* ── Top bar ── */}
      <div
        className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-2 border-b"
        style={{ background: '#fff', borderColor: '#e5e7eb', height: 52 }}
      >
        {/* Progress bar left */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg" style={{ background: '#f4f6fb' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{progressPct}%</span>
            <div className="w-24 h-2 rounded-full" style={{ background: '#e5e7eb' }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${progressPct}%`, background: YELLOW }}
              />
            </div>
          </div>
        </div>

        {/* Logo center */}
        <button onClick={() => navigate('/dashboard')} className="text-lg font-black tracking-tight" style={{ color: '#111' }}>
          CampNode
        </button>

        {/* Syllabus + user */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSyllabusOpen(true)}
            className="px-4 py-1.5 rounded-lg text-white font-bold text-sm"
            style={{ background: BLUE }}
          >
            SYLLABUS
          </button>
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: BLUE }}
          >
            {(user?.name || user?.email || 'GU').substring(0, 2).toUpperCase()}
          </button>
        </div>
      </div>

      {/* ── Main scroll area ── */}
      <div className="pt-16 pb-20 flex flex-col items-center">
        {/* Welcome */}
        <div className="text-center mt-8 mb-10">
          <h1 style={{ fontWeight: 800, fontSize: 22, color: '#111' }}>
            Welcome, {user?.email || user?.name || 'Student'}
          </h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {course.title}
          </p>
        </div>

        {/* ── Graph ── */}
        <div className="flex flex-col items-center gap-0">
          {sortedTopics.map((topic, topicIdx) => (
            <div key={topic.id} className="flex flex-col items-center">

              {/* Connector line from previous topic */}
              {topicIdx > 0 && (
                <div style={{ width: 2, height: 48, background: YELLOW, margin: '0 auto' }} />
              )}

              {/* Hexagon */}
              <HexagonNode
                label={`${topicIdx + 1}. ${topic.name}`}
                subLabel={`${topic.subtopics.filter(s => s.completed).length}/${topic.subtopics.length}`}
                color={topicHexColor(topic)}
                onClick={() => {
                  if (topic.completed) markComplete(topic.id, false);
                }}
                size={120}
              />

              {/* Subtopics row */}
              {topic.subtopics.length > 0 && (
                <>
                  {/* Connector from hex down to subtopics row */}
                  <div style={{ width: 2, height: 32, background: YELLOW }} />

                  <div className="flex flex-row gap-8 items-start justify-center flex-wrap">
                    {topic.subtopics.map(sub => {
                      const color = subtopicDiamondColor(sub, topic.completed);
                      return (
                        <div key={sub.id} className="flex flex-col items-center">
                          <DiamondNode
                            label={sub.name}
                            color={color}
                            aiSuggested={sub.aiSuggested}
                            onClick={async () => {
                              await openSubtopicArticle(sub);
                              markComplete(sub.id, !sub.completed);
                            }}
                            size={88}
                          />
                          <ResourceRow
                            topic={sub}
                            onArticle={() => openSubtopicArticle(sub)}
                            onQuiz={() => navigate(`/quiz/${sub.quizzes?.[0]?.id}`)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ width: 2, height: 32, background: YELLOW }} />
                </>
              )}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {course.topics.length === 0 && (
          <div className="flex flex-col items-center gap-3 mt-20 p-10 rounded-3xl border-2 border-dashed" style={{ borderColor: '#e5e7eb' }}>
            <LayoutList size={40} style={{ color: '#ccc' }} />
            <p style={{ color: '#aaa', fontWeight: 600 }}>No topics yet</p>
            <p style={{ color: '#bbb', fontSize: 13 }}>Your professor hasn't added any topics yet.</p>
          </div>
        )}
      </div>

      {/* ── Syllabus drawer ── */}
      {syllabusOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            onClick={() => setSyllabusOpen(false)}
          />
          <SyllabusPanel
            course={course}
            progressPct={progressPct}
            onClose={() => setSyllabusOpen(false)}
          />
        </>
      )}

      <TopicAbstractModal
        activeContent={activeContent}
        onClose={() => setActiveContent(null)}
      />
    </div>
  );
}
