import { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import NodeDetailPanel from '../components/NodeDetailPanel';
import { MonitorPlay, BookOpen, Headphones, HelpCircle, ChevronLeft, X } from 'lucide-react';

// --- Types & Interfaces ---
type Status = 'completed' | 'current' | 'locked';

interface Subnode {
  id: string;
  title: string;
  type: 'prof' | 'ai';
  status: Status;
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
  status: Status;
  subnodes: Subnode[];
  progress: { completed: number; total: number };
}

export default function Playground() {
  const { courseId } = useParams(); // URL looks like /playground/course-uuid
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [courseTitle, setCourseTitle] = useState("Loading Course...");
  const [pathData, setPathData] = useState<MainTopic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyllabusOpen, setSyllabusOpen] = useState(false);
  const [selectedSubnode, setSelectedSubnode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // State for AI Article viewer modal
  const [viewingArticle, setViewingArticle] = useState<{isOpen: boolean, title: string, html: string, loading: boolean} | null>(null);

  // 1. Load User
  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) {}
    } else {
      navigate('/login');
    }
  }, [navigate]);

  // 2. Fetch Real Data from Backend
  useEffect(() => {
    const fetchCourseData = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://localhost:3000/api/courses/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const dbCourse = res.data;

        setCourseTitle(dbCourse.title);

        // Map backend data into UI structures
        const transformedData: MainTopic[] = dbCourse.topics.map((topic: any, index: number) => {
          
          let mappedSubtopics: Subnode[] = (topic.subtopics || []).map((sub: any) => {
            const rescs: any[] = [];
            if (sub.videoUrl) rescs.push({ type: 'video', title: 'Video Tutorial', url: sub.videoUrl });
            if (sub.articleUrl) rescs.push({ type: 'article', title: 'Article Reference', url: sub.articleUrl });
            if (sub.podcastUrl) rescs.push({ type: 'podcast', title: 'Podcast Lesson', url: sub.podcastUrl });
            
            return {
              id: sub.id,
              title: sub.name,
              type: sub.aiSuggested ? 'ai' : 'prof',
              status: 'current',
              resources: rescs
            };
          });

          // INJECT MOCK DATA FOR THE UI DEMO (Since the Backend is still empty)
          if (mappedSubtopics.length === 0) {
            mappedSubtopics = [
              {
                id: `mock-1-${topic.id}`,
                title: "Core Introduction",
                type: 'prof',
                status: 'current',
                resources: [
                  { type: 'video', title: 'Introduction Video', url: 'https://youtube.com' },
                  { type: 'podcast', title: 'Audio Summary', url: 'https://spotify.com' }
                ]
              },
              {
                id: `mock-2-${topic.id}`,
                title: "Deep Dive AI Outline",
                type: 'ai',
                status: 'current',
                resources: [
                  { type: 'article', title: 'Wikipedia Entry', url: 'https://wikipedia.org' },
                  { type: 'quiz', title: 'Knowledge Check', url: '#' }
                ]
              }
            ];
          }

          return {
            id: topic.id,
            title: `${index + 1}. ${topic.name}`,
            description: topic.description || "No description provided.",
            content: topic.content,
            status: index === 0 ? 'current' : 'locked', // Logic: first one is open
            progress: { completed: 0, total: Math.max(1, mappedSubtopics.length) },
            subnodes: mappedSubtopics
          };
        });

        // Set active id to first topic automatically if available
        if (transformedData.length > 0) setActiveId(transformedData[0].id);

        setPathData(transformedData);
        setLoading(false);
      } catch (err: any) {
        console.error("Error fetching course:", err);
        if (err.response && err.response.status >= 400) {
            localStorage.removeItem('token');
            navigate('/login');
        }
        setLoading(false);
      }
    };

    if (courseId) fetchCourseData();
  }, [courseId, navigate]);

  // --- Calculations ---
  const totalCompleted = pathData.reduce((sum, topic) => sum + topic.progress.completed, 0);
  const totalNodes = pathData.reduce((sum, topic) => sum + topic.progress.total, 0);
  const overallProgress = totalNodes > 0 ? Math.round((totalCompleted / totalNodes) * 100) : 0;

  if (loading) return <div className="p-20 text-center text-white">Loading your Playground...</div>;

  return (
    <div className="min-h-screen font-sans transition-colors" style={{ background: "var(--cn-page)" }}>

      {/* TOP COMPONENT ROW */}
      <div
        className="sticky top-16 sm:top-20 z-40 px-3 sm:px-6 py-3 border-b flex flex-wrap gap-4 items-center justify-between"
        style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}
      >
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            style={{ color: "var(--cn-muted)" }}
          >
            <ChevronLeft size={16} /> Dashboard
          </button>
          
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--cn-text)" }}>
              {overallProgress}%
            </span>
            <div
              className="w-20 h-2 rounded-full overflow-hidden"
              style={{ background: "var(--cn-border)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${overallProgress}%`, background: "#F5C518" }}
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => setSyllabusOpen(true)}
          className="font-bold text-xs sm:text-sm px-4 sm:px-6 py-1.5 sm:py-2 rounded-lg sm:rounded-xl shadow-md active:scale-95 transition-all text-white tracking-wide"
          style={{ background: "#2563EB" }}
        >
          SYLLABUS
        </button>
      </div>

      {/* MAIN CONTENT */}
      <main className="pb-16 sm:pb-24 flex flex-col items-center px-3 sm:px-4 pt-6">
        <div className="mb-6 text-center">
            <h1
            className="text-xl sm:text-2xl md:text-3xl font-bold mb-1"
            style={{ color: "var(--cn-text)" }}
            >
            Welcome, {user ? (user.name || user.email.split('@')[0] || "Student") : "Student"}
            </h1>
            <p style={{ color: "var(--cn-muted)" }} className="text-sm">
                {courseTitle}
            </p>
        </div>

        {pathData.length === 0 ? (
           <div className="p-10 text-center" style={{ color: "var(--cn-muted)" }}>
              No topics structure found for this course.
           </div>
        ) : pathData.map((node, index) => (
          <div key={node.id} className="flex flex-col items-center w-full max-w-5xl">
            
            {/* MAIN TOPIC HEXAGON */}
            <div className="relative z-20">
              <button
                onClick={() => setActiveId(activeId === node.id ? null : node.id)}
                style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
                className={`w-28 h-24 sm:w-32 sm:h-28 md:w-36 md:h-32 lg:w-40 lg:h-36 flex flex-col items-center justify-center p-2 sm:p-3 text-center transition-all duration-300 shadow-xl
                  bg-green-500 dark:bg-green-600
                  ${activeId === node.id 
                    ? 'scale-110 ring-2 sm:ring-4 ring-yellow-400 brightness-100' 
                    : 'scale-100 hover:scale-105 brightness-75'}
                `}
              >
                <div className="flex flex-col items-center justify-center w-[75%]">
                  <span className="text-white font-black text-[9px] sm:text-[11px] md:text-xs uppercase leading-tight line-clamp-3 break-words">
                    {node.title}
                  </span>
                  {node.progress && (
                    <span className="text-white text-[9px] sm:text-[10px] mt-0.5 sm:mt-1 opacity-90">
                      {node.progress.completed}/{node.progress.total}
                    </span>
                  )}
                  <span className="text-white text-[10px] sm:text-xs mt-0.5 opacity-90">
                    {activeId === node.id ? '▼' : '▶'}
                  </span>
                </div>
              </button>
            </div>

            {/* CONNECTION LINE - active state */}
            {activeId === node.id && (
              <div
                className="w-0.5 sm:w-1 h-6 sm:h-8 md:h-10 z-10"
                style={{ background: "#F5C518" }}
              />
            )}

            {/* MAIN WIKIPEDIA CONTENT OVERVIEW */}
            {activeId === node.id && node.content && (
              <div className="w-full max-w-2xl px-4 z-20 animate-in fade-in slide-in-from-top-2">
                 <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-3xl p-6 shadow-xl relative mt-2 text-center text-gray-700 dark:text-gray-300 text-sm leading-relaxed max-h-48 overflow-y-auto">
                    <p className="font-bold text-[10px] text-blue-600 dark:text-blue-500 uppercase tracking-widest mb-3">Topic Abstract</p>
                    {node.content}
                 </div>
              </div>
            )}

            {/* CONNECTION LINE BELOW ABSTRACT */}
            {activeId === node.id && node.content && (
              <div
                className="w-0.5 sm:w-1 h-6 sm:h-8 md:h-10 z-10"
                style={{ background: "#F5C518" }}
              />
            )}

            {/* SUBTOPICS GRID */}
            {activeId === node.id && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center items-center sm:items-start gap-10 sm:gap-6 md:gap-8 my-2 sm:my-6 px-2 sm:px-4 max-w-4xl w-full">
                {node.subnodes.length === 0 && (
                   <div style={{ color: "var(--cn-muted)", fontSize: 13 }}>No subtopics found</div>
                )}
                {node.subnodes.map((sub, sIdx) => (
                  <div key={sub.id} className="flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-300 relative" style={{ zIndex: 20 - sIdx }}>
                    
                    <div className="relative flex flex-col items-center">
                      <button 
                        onClick={() => {
                          if (sub.resources && sub.resources.length > 0) {
                            setSelectedSubnode({
                              name: sub.title,
                              color: sub.type === 'ai' ? 'red' : 'blue',
                              resources: sub.resources
                            });
                          }
                        }}
                        className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rotate-45 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg md:shadow-xl transition-all hover:scale-110 relative z-20
                        ${sub.type === 'ai' 
                          ? 'bg-red-500 shadow-red-500/30' 
                          : 'bg-blue-500 shadow-blue-500/30'}
                      `}>
                        <div className="-rotate-45 flex items-center justify-center w-[85%] h-[85%]">
                          <span className="text-white font-bold text-[9px] sm:text-[10px] md:text-xs text-center leading-tight line-clamp-3 break-words w-full">
                            {sub.title}
                          </span>
                        </div>
                      </button>

                      {/* Quick resource action bar */}
                      <div
                        className="mt-6 sm:mt-8 flex gap-2 p-1.5 sm:p-2 rounded-lg md:rounded-xl shadow-sm bg-white dark:bg-gray-800 relative z-10 w-[110px] sm:w-[130px] justify-center"
                        style={{ border: "1px solid var(--cn-border)" }}
                      >
                        <button 
                         onClick={() => {
                           const v = sub.resources.find(r => r.type === 'video');
                           if (v && v.url) window.open(v.url, '_blank');
                         }}
                         className={`hover:scale-110 transition-transform ${!sub.resources.some(r => r.type === 'video') ? 'opacity-30' : 'text-blue-500'}`} title="Video">
                           <MonitorPlay size={14} />
                        </button>
                        
                        <button 
                         onClick={async () => {
                           const a = sub.resources.find(r => r.type === 'article');
                           if (sub.type === 'ai') {
                             // Extract the real topic ID from our mock ID 
                             // Usually this would just be sub.id once backend is fully migrated
                             const realTopicId = sub.id.startsWith('mock-2-') ? sub.id.replace('mock-2-', '') : sub.id;
                             
                             setViewingArticle({ isOpen: true, title: sub.title, html: '', loading: true });
                             
                             try {
                               const token = localStorage.getItem('token');
                               const res = await axios.get(`http://localhost:3000/api/topics/${realTopicId}/content`, {
                                 headers: { Authorization: `Bearer ${token}` }
                               });
                               setViewingArticle({ isOpen: true, title: sub.title, html: res.data.content, loading: false });
                             } catch (err) {
                               setViewingArticle({ isOpen: true, title: sub.title, html: '<p class="text-red-500">Failed to load content from AI server.</p>', loading: false });
                             }
                           } else if (a && a.url) {
                             window.open(a.url, '_blank');
                           }
                         }}
                         className={`hover:scale-110 transition-transform ${(!sub.resources.some(r => r.type === 'article') && sub.type !== 'ai') ? 'opacity-30' : 'text-blue-500'}`} title="Article">
                           <BookOpen size={14} />
                        </button>
                        
                        <button 
                         onClick={() => {
                           const p = sub.resources.find(r => r.type === 'podcast');
                           if (p && p.url) window.open(p.url, '_blank');
                         }}
                         className={`hover:scale-110 transition-transform ${!sub.resources.some(r => r.type === 'podcast') ? 'opacity-30' : 'text-blue-500'}`} title="Podcast">
                           <Headphones size={14} />
                        </button>
                        
                        <button 
                          onClick={() => {
                            const q = sub.resources.find(r => r.type === 'quiz');
                            if (q && q.url) window.open(q.url, '_blank');
                          }}
                          className={`hover:scale-110 transition-transform ${!sub.resources.some(r => r.type === 'quiz') ? 'opacity-30' : 'text-red-500 font-bold font-sans text-xs'}`} 
                          title="Quiz"
                        >Q</button>
                      </div>

                      {/* AI Indicator badge */}
                      {sub.type === 'ai' && (
                        <div
                          className="mt-2 sm:mt-3 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-red-200"
                          style={{ background: "#FEF2F2", color: "#EF4444" }}
                        >
                          AI suggested
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BRIDGE CONNECTOR (to next topic) */}
            {index < pathData.length - 1 && (
              <div
                className="w-0.5 sm:w-1 h-10 sm:h-14 md:h-16 my-4 sm:my-6 rounded-full"
                style={{ background: "#F5C51850" }}
              />
            )}
          </div>
        ))}
      </main>

      {/* SYLLABUS SIDE DRAWER */}
      {isSyllabusOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setSyllabusOpen(false)} 
          />
          <div
            className="relative w-full sm:w-96 h-full p-4 sm:p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto"
            style={{ background: "var(--cn-card)", borderLeft: "1px solid var(--cn-border)" }}
          >
            <h2
              className="font-black text-xl sm:text-2xl mb-4 sm:mb-6 uppercase"
              style={{ color: "var(--cn-text)" }}
            >
              Course Syllabus
            </h2>

            <div
              className="mb-6 sm:mb-8 p-3 sm:p-4 rounded-xl"
              style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}
            >
              <p className="text-xs sm:text-sm font-semibold mb-2" style={{ color: "var(--cn-muted)" }}>
                Overall Progress
              </p>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-1 h-2 sm:h-3 rounded-full overflow-hidden" style={{ background: "var(--cn-border)" }}>
                  <div
                    className="h-full transition-all rounded-full"
                    style={{ width: `${overallProgress}%`, background: "#F5C518" }}
                  />
                </div>
                <span className="text-base sm:text-lg font-bold" style={{ color: "var(--cn-text)" }}>
                  {overallProgress}%
                </span>
              </div>
            </div>

            <div className="space-y-5 sm:space-y-6">
              {pathData.map(p => (
                <div
                  key={p.id}
                  className="pb-4 sm:pb-6 border-b"
                  style={{ borderColor: "var(--cn-border)" }}
                >
                  <button
                    onClick={() => { setActiveId(p.id); setSyllabusOpen(false); }}
                    className="text-xs sm:text-sm uppercase transition-all w-full text-left mb-2 font-bold"
                    style={{ color: activeId === p.id ? "#3A9E3F" : "#1E6FFF" }}
                  >
                    {p.title}
                    <span className="ml-2 text-[10px] opacity-75">
                      ({p.progress?.completed}/{p.progress?.total})
                    </span>
                  </button>

                  <p className="text-[10px] sm:text-xs mb-3 leading-relaxed" style={{ color: "var(--cn-muted)" }}>
                    {p.description}
                  </p>

                  <div className="pl-3 sm:pl-4 border-l-2 space-y-2" style={{ borderColor: "var(--cn-border)" }}>
                    {p.subnodes.map(s => (
                      <div key={s.id}>
                        <div className="flex items-center gap-1.5">
                          {s.status === 'completed' && <span className="text-xs" style={{ color: "#3A9E3F" }}>✔️</span>}
                          {s.status === 'current' && <span className="text-xs" style={{ color: "#1E6FFF" }}>⚡</span>}
                          {s.status === 'locked' && <span className="text-xs">🔒</span>}
                          <span
                            className="text-xs sm:text-sm font-bold"
                            style={{ color: s.type === 'ai' ? "#E63027" : "#1E6FFF" }}
                          >
                            {s.title}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend Section */}
            <div
              className="mt-6 sm:mt-8 p-3 sm:p-4 rounded-xl space-y-2 text-xs sm:text-sm"
              style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}
            >
              <p className="font-bold mb-2" style={{ color: "var(--cn-text)" }}>Legend:</p>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded shrink-0"></div>
                <span className="text-[10px] sm:text-xs">Main topics</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded shrink-0" style={{ background: "#1E6FFF" }}></div>
                <span className="text-[10px] sm:text-xs">Professor content</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded shrink-0" style={{ background: "#E63027" }}></div>
                <span className="text-[10px] sm:text-xs">AI suggestions</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ARTICLE VIEWER MODAL */}
      {viewingArticle && viewingArticle.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setViewingArticle(null)} 
          />
          <div className="relative w-full max-w-4xl h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" style={{ border: "1px solid var(--cn-border)" }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b" style={{ borderColor: "var(--cn-border)", background: "var(--cn-card)" }}>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                <BookOpen className="text-blue-500" />
                {viewingArticle.title}
              </h2>
              <button 
                onClick={() => setViewingArticle(null)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
              >
                <X size={24} />
              </button>
            </div>
            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-50 dark:bg-gray-950 prose prose-sm sm:prose-base dark:prose-invert max-w-none">
              {viewingArticle.loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                   <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                   <p className="font-semibold animate-pulse">Fetching AI data...</p>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: viewingArticle.html }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* RESOURCE MODAL PANEL */}
      {selectedSubnode && (
        <NodeDetailPanel
          isOpen={!!selectedSubnode}
          onClose={() => setSelectedSubnode(null)}
          nodeName={selectedSubnode.name}
          nodeColor={selectedSubnode.color}
          resources={selectedSubnode.resources}
        />
      )}
    </div>
  );
}
