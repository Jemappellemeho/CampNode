import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Plus, Trash2, ChevronLeft, GripVertical,
  Link, BookOpen, Headphones, Play,
  Check, X, ArrowRight, AlertTriangle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import Layout from '../components/Layout';

const API = 'http://localhost:3000/api';

const BLUE   = '#1E6FFF';
const RED    = '#E63027';
const GREEN  = '#3A9E3F';
const DARK   = '#0F1628';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubTopic {
  id: string;
  name: string;
  description?: string;
  order: number;
  aiSuggested?: boolean;
  videoUrl?: string;
  articleUrl?: string;
  podcastUrl?: string;
  quizzes?: { id: string }[];
  prerequisites?: { id: string; name: string }[];
}

interface Topic {
  id: string;
  name: string;
  description?: string;
  order: number;
  subtopics: SubTopic[];
  prerequisites?: { id: string; name: string }[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
  joinCode: string;
  topics: Topic[];
}

// ─── Small reusable components ────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--cn-text)' }}>{title}</h2>
      {action}
    </div>
  );
}

function InputField({
  label, value, onChange, placeholder, textarea = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; textarea?: boolean;
}) {
  const shared: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--cn-border)',
    background: 'var(--cn-bg)',
    color: 'var(--cn-text)',
    fontSize: 13,
    outline: 'none',
  };
  return (
    <div className="flex flex-col gap-1">
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cn-muted)' }}>{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...shared, resize: 'vertical' }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={shared} />
      }
    </div>
  );
}

// ─── Resource URL editor for a single node ───────────────────────────────────
function ResourceEditor({
  topicId, courseId, initialVideo, initialArticle, initialPodcast, onSaved,
}: {
  topicId: string; courseId: string;
  initialVideo?: string; initialArticle?: string; initialPodcast?: string;
  onSaved: () => void;
}) {
  const [video,   setVideo]   = useState(initialVideo   || '');
  const [article, setArticle] = useState(initialArticle || '');
  const [podcast, setPodcast] = useState(initialPodcast || '');
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      await axios.put(`${API}/courses/${courseId}/topics/${topicId}`, {
        videoUrl: video || null,
        articleUrl: article || null,
        podcastUrl: podcast || null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cn-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Resource Links
      </p>
      <div className="flex items-center gap-2">
        <Play size={13} style={{ color: RED, flexShrink: 0 }} />
        <input value={video} onChange={e => setVideo(e.target.value)} placeholder="Video URL (YouTube, etc.)" style={{ flex: 1, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--cn-border)', background: 'var(--cn-bg)', color: 'var(--cn-text)', fontSize: 12 }} />
      </div>
      <div className="flex items-center gap-2">
        <BookOpen size={13} style={{ color: BLUE, flexShrink: 0 }} />
        <input value={article} onChange={e => setArticle(e.target.value)} placeholder="Article URL (Wikipedia, MDN, etc.)" style={{ flex: 1, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--cn-border)', background: 'var(--cn-bg)', color: 'var(--cn-text)', fontSize: 12 }} />
      </div>
      <div className="flex items-center gap-2">
        <Headphones size={13} style={{ color: GREEN, flexShrink: 0 }} />
        <input value={podcast} onChange={e => setPodcast(e.target.value)} placeholder="Podcast URL (Spotify, etc.)" style={{ flex: 1, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--cn-border)', background: 'var(--cn-bg)', color: 'var(--cn-text)', fontSize: 12 }} />
      </div>
      <button onClick={save} disabled={saving} className="self-end px-4 py-1.5 rounded-lg text-white text-sm font-bold transition-all" style={{ background: BLUE }}>
        {saving ? 'Saving…' : 'Save Links'}
      </button>
    </div>
  );
}

// ─── Subtopic Card ────────────────────────────────────────────────────────────
function SubtopicCard({
  sub, courseId, parentId, onDelete, onAcceptAI, onRejectAI, onRefresh,
  dragHandleProps,
}: {
  sub: SubTopic; courseId: string; parentId: string;
  onDelete: () => void; onAcceptAI: () => void; onRejectAI: () => void;
  onRefresh: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: 'var(--cn-card)',
        border: sub.aiSuggested ? `1.5px dashed ${RED}` : '1px solid var(--cn-border)',
        borderRadius: 12,
        padding: '10px 14px',
        marginBottom: 6,
      }}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <div {...dragHandleProps} className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0">
          <GripVertical size={15} />
        </div>

        {/* Color dot */}
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: sub.aiSuggested ? RED : BLUE, transform: 'rotate(45deg)' }} />

        <div className="flex-1 min-w-0">
          <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--cn-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub.name}
          </p>
          {sub.aiSuggested && (
            <span style={{ fontSize: 10, color: RED, fontWeight: 600 }}>AI Suggested</span>
          )}
        </div>

        {/* AI accept/reject */}
        {sub.aiSuggested && (
          <div className="flex gap-1">
            <button onClick={onAcceptAI} className="w-6 h-6 flex items-center justify-center rounded-md" style={{ background: GREEN + '22', color: GREEN }} title="Accept">
              <Check size={12} />
            </button>
            <button onClick={onRejectAI} className="w-6 h-6 flex items-center justify-center rounded-md" style={{ background: RED + '22', color: RED }} title="Reject">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Expand/collapse resources */}
        <button onClick={() => setExpanded(e => !e)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* Delete */}
        <button onClick={onDelete} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50" style={{ color: RED }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Resource editor (expanded) */}
      {expanded && (
        <ResourceEditor
          topicId={sub.id}
          courseId={courseId}
          initialVideo={sub.videoUrl}
          initialArticle={sub.articleUrl}
          initialPodcast={sub.podcastUrl}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

// ─── Topic Card ───────────────────────────────────────────────────────────────
function TopicCard({
  topic, courseId, allTopics, onDelete, onRefresh, index,
  onDragStart, onDragOver, onDrop,
}: {
  topic: Topic; courseId: string; allTopics: Topic[];
  onDelete: () => void; onRefresh: () => void; index: number;
  onDragStart: (e: React.DragEvent, topicId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetTopicId: string) => void;
}) {
  const [addingSubtopic, setAddingSubtopic] = useState(false);
  const [newSubName, setNewSubName]         = useState('');
  const [newSubDesc, setNewSubDesc]         = useState('');
  const [addingPrereq, setAddingPrereq]     = useState(false);
  const [prereqId, setPrereqId]             = useState('');
  const [draggingSubIdx, setDraggingSubIdx] = useState<number | null>(null);
  const [dropSubIdx, setDropSubIdx]         = useState<number | null>(null);
  const [isDragOver, setIsDragOver]         = useState(false);
  const token = localStorage.getItem('token');

  const addSubtopic = async () => {
    if (!newSubName.trim()) return;
    try {
      await axios.post(`${API}/courses/${courseId}/topics`, {
        name: newSubName,
        description: newSubDesc,
        parentTopicId: topic.id,
        order: topic.subtopics.length,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewSubName(''); setNewSubDesc('');
      setAddingSubtopic(false);
      onRefresh();
    } catch (e) { console.error(e); }
  };

  const deleteSubtopic = async (subId: string) => {
    if (!confirm('Delete this subtopic?')) return;
    await axios.delete(`${API}/courses/${courseId}/topics/${subId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    onRefresh();
  };

  const acceptAI = async (sub: SubTopic) => {
    await axios.put(`${API}/courses/${courseId}/topics/${sub.id}`, { aiSuggested: false }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    onRefresh();
  };

  const rejectAI = async (sub: SubTopic) => {
    await axios.delete(`${API}/courses/${courseId}/topics/${sub.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    onRefresh();
  };

  const addPrereq = async () => {
    if (!prereqId) return;
    await axios.post(`${API}/courses/${courseId}/topics/${topic.id}/prereqs`, { prereqId }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setPrereqId(''); setAddingPrereq(false);
    onRefresh();
  };

  const removePrereq = async (pid: string) => {
    await axios.delete(`${API}/courses/${courseId}/topics/${topic.id}/prereqs/${pid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    onRefresh();
  };

  // ── Subtopic drag-to-reorder ─────────────────────────────────────────────
  const handleSubDragStart = (e: React.DragEvent, i: number) => {
    setDraggingSubIdx(i);
    e.dataTransfer.setData('subIdx', String(i));
    e.dataTransfer.setData('parentTopicId', topic.id);
    e.stopPropagation();
  };

  const handleSubDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.stopPropagation();
    const srcIdx = Number(e.dataTransfer.getData('subIdx'));
    const srcParent = e.dataTransfer.getData('parentTopicId');
    if (srcParent !== topic.id || srcIdx === targetIdx) return;

    // Reorder subtopics locally then save order
    const reordered = [...topic.subtopics];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Persist new order
    for (let i = 0; i < reordered.length; i++) {
      await axios.put(`${API}/courses/${courseId}/topics/${reordered[i].id}`, { order: i }, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setDraggingSubIdx(null); setDropSubIdx(null);
    onRefresh();
  };

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, topic.id)}
      onDragOver={e => { e.preventDefault(); onDragOver(e); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { setIsDragOver(false); onDrop(e, topic.id); }}
      style={{
        background: 'var(--cn-card)',
        border: `1.5px solid ${isDragOver ? BLUE : 'var(--cn-border)'}`,
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 12,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: isDragOver ? `0 0 0 3px ${BLUE}33` : '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Topic header ── */}
      <div className="flex items-center gap-3 mb-3">
        <div className="cursor-grab text-gray-400">
          <GripVertical size={18} />
        </div>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
          style={{ background: BLUE }}
        >
          {index + 1}
        </div>
        <div className="flex-1">
          <p style={{ fontWeight: 800, fontSize: 15, color: 'var(--cn-text)' }}>{topic.name}</p>
          {topic.description && (
            <p style={{ fontSize: 12, color: 'var(--cn-muted)', marginTop: 2 }}>{topic.description}</p>
          )}
        </div>
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-50 transition-colors" style={{ color: RED }}>
          <Trash2 size={15} />
        </button>
      </div>

      {/* ── Prerequisites ── */}
      {(topic.prerequisites && topic.prerequisites.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-3">
          {topic.prerequisites.map(p => (
            <div key={p.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: BLUE + '15', color: BLUE }}>
              <ArrowRight size={10} /> {p.name}
              <button onClick={() => removePrereq(p.id)} className="ml-1 hover:text-red-500">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Subtopics ── */}
      <div className="pl-4 border-l-2" style={{ borderColor: 'var(--cn-border)' }}>
        {topic.subtopics.map((sub, si) => (
          <div
            key={sub.id}
            draggable
            onDragStart={e => handleSubDragStart(e, si)}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropSubIdx(si); }}
            onDrop={e => handleSubDrop(e, si)}
            style={{ opacity: draggingSubIdx === si ? 0.4 : 1 }}
          >
            <SubtopicCard
              sub={sub}
              courseId={courseId}
              parentId={topic.id}
              onDelete={() => deleteSubtopic(sub.id)}
              onAcceptAI={() => acceptAI(sub)}
              onRejectAI={() => rejectAI(sub)}
              onRefresh={onRefresh}
            />
          </div>
        ))}

        {/* Add subtopic form */}
        {addingSubtopic ? (
          <div className="mt-2 p-3 rounded-xl" style={{ border: '1px dashed var(--cn-border)' }}>
            <div className="flex flex-col gap-2">
              <InputField label="Subtopic Name" value={newSubName} onChange={setNewSubName} placeholder="e.g. Bytecode" />
              <InputField label="Description (optional)" value={newSubDesc} onChange={setNewSubDesc} placeholder="Short description…" textarea />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAddingSubtopic(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--cn-bg)', color: 'var(--cn-muted)', border: '1px solid var(--cn-border)' }}>
                  Cancel
                </button>
                <button onClick={addSubtopic} className="px-3 py-1.5 rounded-lg text-white text-sm font-bold" style={{ background: BLUE }}>
                  Add
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingSubtopic(true)}
            className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-blue-50"
            style={{ color: BLUE, border: `1px dashed ${BLUE}55` }}
          >
            <Plus size={13} /> Add Subtopic
          </button>
        )}
      </div>

      {/* ── Prerequisite connector ── */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--cn-border)' }}>
        {addingPrereq ? (
          <div className="flex gap-2 items-center">
            <ArrowRight size={14} style={{ color: BLUE, flexShrink: 0 }} />
            <select
              value={prereqId}
              onChange={e => setPrereqId(e.target.value)}
              style={{ flex: 1, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--cn-border)', background: 'var(--cn-bg)', color: 'var(--cn-text)', fontSize: 12 }}
            >
              <option value="">Select prerequisite topic…</option>
              {allTopics
                .filter(t => t.id !== topic.id && !topic.prerequisites?.find(p => p.id === t.id))
                .map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
            <button onClick={addPrereq} className="px-3 py-1 rounded-lg text-white text-xs font-bold" style={{ background: BLUE }}>
              Link
            </button>
            <button onClick={() => setAddingPrereq(false)} className="px-2 py-1 rounded-lg text-xs" style={{ color: 'var(--cn-muted)' }}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingPrereq(true)}
            className="flex items-center gap-1.5 text-xs font-semibold hover:underline"
            style={{ color: 'var(--cn-muted)' }}
          >
            <ArrowRight size={12} /> Add prerequisite link
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate     = useNavigate();
  const [course, setCourse]   = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingTopic, setAddingTopic]   = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [dragTopicId, setDragTopicId]   = useState<string | null>(null);
  const token = localStorage.getItem('token');

  const fetchCourse = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourse(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  // ── Add top-level topic ──────────────────────────────────────────────────
  const addTopic = async () => {
    if (!newTopicName.trim()) return;
    await axios.post(`${API}/courses/${courseId}/topics`, {
      name: newTopicName,
      description: newTopicDesc,
      order: course?.topics.length || 0,
    }, { headers: { Authorization: `Bearer ${token}` } });
    setNewTopicName(''); setNewTopicDesc('');
    setAddingTopic(false);
    fetchCourse();
  };

  const deleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic and all its subtopics?')) return;
    await axios.delete(`${API}/courses/${courseId}/topics/${topicId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchCourse();
  };

  // ── Drag-to-reorder topics ───────────────────────────────────────────────
  const handleTopicDragStart = (e: React.DragEvent, topicId: string) => {
    setDragTopicId(topicId);
    e.dataTransfer.setData('topicId', topicId);
  };

  const handleTopicDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('topicId');
    if (!srcId || srcId === targetId || !course) return;

    const topics = [...course.topics];
    const srcIdx = topics.findIndex(t => t.id === srcId);
    const tgtIdx = topics.findIndex(t => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = topics.splice(srcIdx, 1);
    topics.splice(tgtIdx, 0, moved);

    // Persist order
    for (let i = 0; i < topics.length; i++) {
      await axios.put(`${API}/courses/${courseId}/topics/${topics[i].id}`, { order: i }, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setDragTopicId(null);
    fetchCourse();
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!course) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <AlertTriangle size={40} style={{ color: RED }} />
          <p style={{ color: 'var(--cn-text)', fontWeight: 700 }}>Course not found</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 rounded-xl text-white font-bold" style={{ background: BLUE }}>
            Back to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto pb-20">
        {/* ── Page header ── */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 style={{ fontWeight: 900, fontSize: 24, color: 'var(--cn-text)' }}>{course.title}</h1>
            {course.description && (
              <p style={{ fontSize: 13, color: 'var(--cn-muted)', marginTop: 2 }}>{course.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'var(--cn-card)', border: '1px solid var(--cn-border)' }}>
            <span style={{ fontSize: 11, color: 'var(--cn-muted)', fontWeight: 600 }}>JOIN CODE</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--cn-text)' }}>{course.joinCode}</span>
          </div>
        </div>

        {/* ── Info banner ── */}
        <div className="flex items-start gap-3 p-4 rounded-2xl mb-6" style={{ background: BLUE + '10', border: `1px solid ${BLUE}33` }}>
          <div className="mt-0.5">
            <GripVertical size={16} style={{ color: BLUE }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Drag to reorder</p>
            <p style={{ fontSize: 12, color: 'var(--cn-muted)', marginTop: 2 }}>
              Drag topic cards up/down to reorder them. Drag subtopics within a topic to reorder them. 
              Use "Add prerequisite link" to define which topics must be completed before another.
            </p>
          </div>
        </div>

        {/* ── Topics section ── */}
        <SectionHeader
          title={`Topics (${course.topics.length})`}
          action={
            <button
              onClick={() => setAddingTopic(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
              style={{ background: BLUE }}
            >
              <Plus size={15} /> Add Topic
            </button>
          }
        />

        {/* Add topic form */}
        {addingTopic && (
          <div className="p-4 rounded-2xl mb-4" style={{ background: 'var(--cn-card)', border: `1.5px dashed ${BLUE}55` }}>
            <div className="flex flex-col gap-3">
              <InputField label="Topic Name *" value={newTopicName} onChange={setNewTopicName} placeholder="e.g. JVM Architecture" />
              <InputField label="Description (optional)" value={newTopicDesc} onChange={setNewTopicDesc} placeholder="What students will learn…" textarea />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setAddingTopic(false); setNewTopicName(''); setNewTopicDesc(''); }} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--cn-bg)', color: 'var(--cn-muted)', border: '1px solid var(--cn-border)' }}>
                  Cancel
                </button>
                <button onClick={addTopic} disabled={!newTopicName.trim()} className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: BLUE }}>
                  Create Topic
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Topic list */}
        {course.topics.length === 0 && !addingTopic ? (
          <div className="py-16 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed" style={{ borderColor: 'var(--cn-border)' }}>
            <BookOpen size={36} style={{ color: 'var(--cn-muted)' }} />
            <p style={{ color: 'var(--cn-text)', fontWeight: 700 }}>No topics yet</p>
            <p style={{ color: 'var(--cn-muted)', fontSize: 13 }}>Click "Add Topic" to build your course structure.</p>
            <button onClick={() => setAddingTopic(true)} className="mt-2 px-6 py-2.5 rounded-2xl text-white font-bold" style={{ background: BLUE }}>
              <Plus size={14} className="inline mr-1" />Add First Topic
            </button>
          </div>
        ) : (
          <div>
            {course.topics.map((topic, i) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                index={i}
                courseId={courseId!}
                allTopics={course.topics}
                onDelete={() => deleteTopic(topic.id)}
                onRefresh={fetchCourse}
                onDragStart={handleTopicDragStart}
                onDragOver={e => e.preventDefault()}
                onDrop={handleTopicDrop}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
