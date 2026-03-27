import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import SyllabusDrawer from '../components/SyllabusDrawer';
import TopicAbstractModal from '../components/TopicAbstractModal';
import { MonitorPlay, BookOpen, Headphones, ChevronLeft, Info } from 'lucide-react';

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

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) {}
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    const fetchCourseData = async () => {
      try {
        const token = localStorage.getItem('token');
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

        const transformedData: MainTopic[] = dbCourse.topics.map((topic: any, index: number) => {
          let mappedSubtopics: Subnode[] = (topic.subtopics || []).map((sub: any) => ({
            id: sub.id,
            title: sub.name,
            type: sub.aiSuggested ? 'ai' : 'prof',
            status: backendCompleted.includes(topic.id) ? 'completed' : 'current',
            resources: [
              ...(sub.videoUrl ? [{ type: 'video', title: 'Video', url: sub.videoUrl }] : []),
              ...(sub.articleUrl ? [{ type: 'article', title: 'Article', url: sub.articleUrl }] : []),
              ...(sub.podcastUrl ? [{ type: 'podcast', title: 'Podcast', url: sub.podcastUrl }] : []),
              { type: 'quiz', title: 'Quiz', url: '#' }
            ]
          }));

          return {
            id: topic.id,
            title: `${index + 1}. ${topic.name}`,
            description: topic.description || "No description provided.",
            content: topic.content,
            status: index === 0 ? 'current' : 'locked',
            progress: { completed: backendCompleted.includes(topic.id) ? 1 : 0, total: 1 },
            subnodes: mappedSubtopics
          };
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

  const markComplete = async (topicId: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:3000/api/progress`, { topicId, completed: true }, { headers: { Authorization: `Bearer ${token}` } });
      setCompletedIds(prev => [...prev, topicId]);
    } catch (err) { console.error("Progress failed"); }
  };

  const overallProgress = pathData.length > 0 ? Math.round((completedIds.length / pathData.length) * 100) : 0;

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
        <button onClick={() => setSyllabusOpen(true)} className="font-bold text-xs sm:text-sm px-6 py-2 rounded-xl text-white bg-[#2563EB]">SYLLABUS</button>
      </div>

      <main className="pb-16 sm:pb-24 flex flex-col items-center px-3 sm:px-4 pt-16 sm:pt-20">
        <div className="mb-6 text-center">
            <h1 className="text-xl sm:text-3xl font-bold mb-1" style={{ color: "var(--cn-text)" }}>Welcome, {user?.name || "Student"}</h1>
            <p style={{ color: "var(--cn-muted)" }} className="text-sm">{courseTitle}</p>
        </div>

        {pathData.map((node, index) => (
          <div key={node.id} className="flex flex-col items-center w-full max-w-5xl">
            <div className="relative z-20">
              <button
                onClick={() => setActiveId(activeId === node.id ? null : node.id)}
                style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
                className={`w-28 h-24 sm:w-40 sm:h-36 flex flex-col items-center justify-center p-3 text-center transition-all duration-300 shadow-xl
                  ${activeId === node.id ? 'bg-green-500 scale-110 ring-4 ring-yellow-400' : 'bg-green-600 brightness-75'}
                `}
              >
                <span className="text-white font-black text-[9px] sm:text-xs uppercase px-2">{node.title}</span>
                <span className="text-white text-[9px] mt-1 opacity-90">{completedIds.includes(node.id) ? 1 : 0}/1</span>
              </button>
              {node.content && (
                <button onClick={() => setActivePopupContent({ title: node.title, content: node.content! })} className="absolute top-0 -right-2 bg-white text-blue-500 p-2 rounded-full shadow-lg border z-30"><Info size={16} /></button>
              )}
            </div>

            {/* STICK - PERFECTLY CONTAINED */}
            {activeId === node.id && (
              <div className="w-0.5 sm:w-1 h-6 sm:h-10 z-10" style={{ background: "#F5C518" }} />
            )}

            {activeId === node.id && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center items-center gap-10 sm:gap-12 my-6 w-full animate-in fade-in slide-in-from-bottom-4">
                {node.subnodes.map((sub) => (
                  <div key={sub.id} className="flex flex-col items-center relative">
                    <div className={`w-20 h-20 sm:w-32 sm:h-32 rotate-45 rounded-xl flex items-center justify-center shadow-xl transition-all duration-500 relative z-20
                      ${sub.type === 'ai' ? 'bg-red-500' : 'bg-blue-600'}
                      ${completedIds.includes(node.id) ? 'ring-4 ring-green-400' : ''}
                    `}>
                      <div className="-rotate-45 text-center p-2">
                        {completedIds.includes(node.id) && <span className="text-white text-[8px] font-black mb-1 bg-green-600 px-1 rounded uppercase">DONE ✔️</span>}
                        <span className="text-white font-black text-[9px] sm:text-[11px] leading-tight line-clamp-3 uppercase">{sub.title}</span>
                      </div>
                    </div>

                    <div className="mt-12 flex gap-3 p-2.5 rounded-2xl bg-white dark:bg-gray-800 border shadow-lg z-10">
                      <button onClick={() => { const v = sub.resources.find(r => r.type === 'video'); if(v?.url) window.open(v.url, '_blank'); markComplete(node.id); }} className={`p-1.5 transition-all ${sub.resources.some(r => r.type === 'video') ? 'text-blue-500' : 'text-gray-300'}`}><MonitorPlay size={18} /></button>
                      <button onClick={() => { const a = sub.resources.find(r => r.type === 'article'); if(a?.url) window.open(a.url, '_blank'); markComplete(node.id); }} className={`p-1.5 transition-all ${sub.resources.some(r => r.type === 'article') ? 'text-blue-500' : 'text-gray-300'}`}><BookOpen size={18} /></button>
                      <button onClick={() => { const p = sub.resources.find(r => r.type === 'podcast'); if(p?.url) window.open(p.url, '_blank'); markComplete(node.id); }} className={`p-1.5 transition-all ${sub.resources.some(r => r.type === 'podcast') ? 'text-blue-500' : 'text-gray-300'}`}><Headphones size={18} /></button>
                      {/* Q NOW NAVIGATES TO THE FULL-PAGE QUIZ */}
                      <button 
    onClick={() => navigate(`/quiz/${node.id}`)} 
    className="p-1.5 text-red-500 font-black text-xs hover:scale-125 transition-all"
  >
    Q
  </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {index < pathData.length - 1 && (
              <div className="w-0.5 sm:w-1 h-10 sm:h-16 my-4 opacity-30 rounded-full" style={{ background: "#F5C51850" }} />
            )}
          </div>
        ))}
      </main>

      <SyllabusDrawer isOpen={isSyllabusOpen} onClose={() => setSyllabusOpen(false)} pathData={pathData} activeId={activeId} onSelectTopic={(id) => setActiveId(id)} completedIds={completedIds} overallProgress={overallProgress} />
      <TopicAbstractModal activeContent={activePopupContent} onClose={() => setActivePopupContent(null)} />
    </div>
  );
}