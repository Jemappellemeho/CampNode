import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Plus, Trash2, ChevronLeft, GripVertical,
  BookOpen, X, Users, Globe, Copy, 
  ChevronRight, ChevronDown, Play, Headphones, Sparkles, Lock, Edit2
} from 'lucide-react';

const API = 'http://localhost:3000/api';
const BLUE = '#1E6FFF';

export default function CourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "students" | "nodes">("overview");
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Logic States
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [linkData, setLinkData] = useState({ video: '', article: '', podcast: '' });
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedMainTopics, setExpandedMainTopics] = useState<Record<string, boolean>>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  
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
    if (!newSubName.trim()) return;
    try {
      await axios.post(`${API}/courses/${courseId}/topics`, {
        name: newSubName, parentTopicId: parentId,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewSubName(''); setAddingSubTo(null); fetchCourse();
    } catch (e) { console.error(e); }
  };

  const addTopic = async () => {
    if (!newTopicName.trim()) return;
    try {
      await axios.post(`${API}/courses/${courseId}/topics`, {
        name: newTopicName
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewTopicName(''); setIsAddingTopic(false); fetchCourse();
    } catch (e) { console.error(e); }
  };

  const saveLinks = async (subId: string) => {
    try {
      await axios.put(`${API}/courses/${courseId}/topics/${subId}`, {
        videoUrl: linkData.video, articleUrl: linkData.article, podcastUrl: linkData.podcast
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingSubId(null); fetchCourse();
    } catch (e) { console.error(e); }
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

  if (loading) return <div className="py-20 text-center text-gray-400 text-xs uppercase tracking-widest">Synchronizing...</div>;
  if (!course) return null;

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
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${course.isPublic ? 'bg-green-50 text-green-600 border-green-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}
              >
                {course.isPublic ? 'Public' : 'Private'}
              </button>
            </div>
            <p className="text-gray-500 text-sm font-medium">{course.description || "Course Management"}</p>
          </div>
          <button onClick={async () => { if(window.confirm("Delete?")) { await axios.delete(`${API}/courses/${courseId}`, {headers: {Authorization: `Bearer ${token}`}}); navigate('/dashboard'); } }} className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={14} /> Delete Course</button>
        </div>

        <div className="bg-gray-100/80 dark:bg-gray-900/50 p-1 rounded-xl flex gap-1 mb-8 border dark:border-gray-800 w-full overflow-x-auto sm:w-fit">
          {["overview", "students", "nodes"].map((t) => (
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
                  <button onClick={() => navigator.clipboard.writeText(course.joinCode)} className="p-2.5 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 flex items-center gap-2 text-xs font-bold text-gray-500 w-full justify-center sm:w-auto"><Copy size={18} /> <span className="sm:hidden">COPY</span></button>
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
                course.students.map((s: any) => (
                  <div key={s.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">{s.email?.[0].toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-bold dark:text-white">{s.name || "Student"}</p>
                        <p className="text-[10px] text-gray-500">{s.email}</p>
                      </div>
                    </div>
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
                  <input autoFocus className="flex-1 px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="New Topic Name..." value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} />
                  <button onClick={addTopic} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold uppercase">Add</button>
                  <button onClick={() => setIsAddingTopic(false)} className="p-2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
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
                          <button onClick={() => startEditingName(topic.id, topic.name)} className="opacity-0 group-hover/title:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-1"><Edit2 size={12} /></button>
                          <button onClick={() => deleteTopic(topic.id)} className="opacity-0 group-hover/title:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"><Trash2 size={12} /></button>
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
                  {topic.content && (
                    <div className="ml-6 mb-6 pl-4 border-l-2 border-gray-100 dark:border-gray-800 relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Wikipedia Abstract</p>
                        <button onClick={() => setExpandedTopics(prev => ({...prev, [topic.id]: prev[topic.id] === undefined ? false : !prev[topic.id]}))} className="text-[10px] text-blue-600 font-bold uppercase transition-all hover:text-blue-700">
                          {expandedTopics[topic.id] !== false ? "Collapse" : "Expand"}
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
                                <button onClick={() => startEditingName(sub.id, sub.name)} className="opacity-0 group-hover/subtitle:opacity-100 text-gray-400 hover:text-blue-600 transition-opacity p-1"><Edit2 size={12} /></button>
                                <button onClick={() => deleteTopic(sub.id)} className="opacity-0 group-hover/subtitle:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"><Trash2 size={12} /></button>
                              </div>
                            )}
                            {sub.aiSuggested && <span className="text-[9px] font-black text-red-500 uppercase flex items-center gap-1 mt-1"><Sparkles size={10}/> AI Suggestion</span>}
                          </div>
                          <button onClick={() => {
                            setEditingSubId(editingSubId === sub.id ? null : sub.id);
                            setLinkData({ video: sub.videoUrl || '', article: sub.articleUrl || '', podcast: sub.podcastUrl || '' });
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
                            <div className="flex justify-end mt-2"><button onClick={() => saveLinks(sub.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-md">Save</button></div>
                          </div>
                        )}
                      </div>
                    ))}
                    {addingSubTo === topic.id ? (
                      <div className="mt-3 flex gap-2">
                        <input autoFocus className="flex-1 px-3 py-2 text-sm rounded-lg border dark:bg-gray-900 outline-none dark:text-white" placeholder="Subtopic Name..." value={newSubName} onChange={(e) => setNewSubName(e.target.value)} />
                        <button onClick={() => addSubtopic(topic.id)} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold">Add</button>
                        <button onClick={() => setAddingSubTo(null)} className="p-2 text-gray-400"><X size={16} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingSubTo(topic.id)} className="flex items-center gap-2 text-xs font-bold text-blue-600 mt-2 hover:underline"><Plus size={14} /> Add Subtopic / Links</button>
                    )}
                  </div>
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}