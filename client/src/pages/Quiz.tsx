import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Trophy, GripVertical, CheckCircle2, XCircle } from "lucide-react";

export default function Quiz() {
  const navigate = useNavigate();
  const { topicId } = useParams();
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<any>(null); 
  const [multiSelect, setMultiSelect] = useState<number[]>([]);
  const [reorderList, setReorderList] = useState<any[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // SAFE SHUFFLE: Won't crash if the array is missing or undefined
  const shuffleArray = (array: any[]) => {
    if (!Array.isArray(array)) return [];
    return [...array].sort(() => Math.random() - 0.5);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://localhost:3000/api/topics/quizzes/topic/${topicId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.data && Array.isArray(res.data.questions) && res.data.questions.length > 0) {
          setQuiz(res.data);
          const firstQ = res.data.questions[0];
          if (firstQ?.type === 'reorder') {
            setReorderList(shuffleArray(firstQ.items));
          }
        } else {
          // If backend sends an empty quiz, don't let it crash
          setQuiz({ questions: [] });
        }
      } catch (e) { 
        console.error("API Error:", e); 
      } finally { 
        setLoading(false); 
      }
    };
    if (topicId) load();
  }, [topicId]);

  const q = quiz?.questions?.[currentIdx];

  const isCorrect = () => {
    if (!q) return false;
    if (q.type === "multiple_choice") return selected === q.correctIndex;
    if (q.type === "true_false") return (selected === 0) === q.correctAnswer;
    
    // SAFE STRING CHECK: Prevents .toLowerCase().trim() from crashing on null
    if (q.type === "open_answer") {
      const validAnswers = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [];
      const safeSelected = (selected || "").toString().toLowerCase().trim();
      return validAnswers.map((a: string) => a.toLowerCase()).includes(safeSelected);
    }
    
    if (q.type === "multiple_select") {
      const correct = Array.isArray(q.correctIndices) ? q.correctIndices : [];
      return JSON.stringify([...multiSelect].sort()) === JSON.stringify([...correct].sort());
    }
    
    if (q.type === "reorder") {
      const correctItems = Array.isArray(q.items) ? q.items : [];
      return JSON.stringify(reorderList) === JSON.stringify(correctItems);
    }
    
    return false;
  };

  const handleNext = () => {
    if (isCorrect()) setScore(s => s + 1);
    
    const totalQuestions = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
    
    if (currentIdx < totalQuestions - 1) {
      const nextQ = quiz.questions[currentIdx + 1];
      setCurrentIdx(prev => prev + 1);
      setRevealed(false);
      setSelected(null);
      setMultiSelect([]);
      if (nextQ?.type === 'reorder') setReorderList(shuffleArray(nextQ.items));
    } else {
      setFinished(true);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-xs font-bold uppercase opacity-20">Syncing...</div>;
  
  // Safe fallback if quiz array is empty or malformed
  if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0 || !q) return (
    <div className="h-screen flex flex-col items-center justify-center p-10 text-center">
      <p className="text-red-500 font-bold mb-4 uppercase">Error: Quiz data is missing or empty.</p>
      <button onClick={() => navigate(-1)} className="px-6 py-2 bg-black text-white rounded-full text-xs font-bold">GO BACK</button>
    </div>
  );

  if (finished) return (
    <div className="h-screen w-full flex items-center justify-center p-6 bg-[var(--cn-page)]">
      <div className="text-center p-8 rounded-[32px] border shadow-2xl bg-[var(--cn-card)] border-[var(--cn-border)] max-w-sm w-full">
        <Trophy size={48} className="text-[#F5C518] mx-auto mb-4" />
        <h1 className="text-2xl font-black mb-1" style={{color: "var(--cn-text)"}}>Final Results</h1>
        <p className="text-5xl font-black text-blue-600 mb-6">{score} / {quiz.questions.length}</p>
        <button onClick={() => navigate(-1)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest">Exit</button>
      </div>
    </div>
  );

  // SAFE ARRAY FALLBACKS for rendering
  const optionsToRender = Array.isArray(q.options) ? q.options : ["True", "False"];

  return (
    <div className="h-screen w-full flex flex-col transition-colors px-4 pt-2 pb-6" style={{ background: "var(--cn-page)" }}>
      <div className="max-w-lg mx-auto w-full flex flex-col h-full justify-start mt-1">
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-full mb-3 overflow-hidden shrink-0">
            <div className="h-full bg-[#F5C518] transition-all duration-500" style={{ width: `${((currentIdx + 1) / quiz.questions.length) * 100}%` }} />
        </div>
        
        <div className="flex items-center justify-between mb-2 shrink-0 px-1">
          <button onClick={() => navigate(-1)} className="text-[10px] font-bold uppercase opacity-30 hover:opacity-100 transition-opacity flex items-center gap-1"><ArrowLeft size={12}/> EXIT</button>
          <div className="text-right text-[9px] font-bold opacity-30 uppercase">{currentIdx + 1} of {quiz.questions.length}</div>
        </div>
        
        <div className="bg-[var(--cn-card)] border border-[var(--cn-border)] rounded-[24px] shadow-xl flex flex-col overflow-hidden max-h-[84vh]">
          <div className="overflow-y-auto p-6 sm:p-8 custom-scrollbar">
            <h2 className="text-lg font-bold mb-6 leading-tight" style={{ color: "var(--cn-text)" }}>{q.question || "Missing Question"}</h2>
            
            <div className="space-y-2">
              {(q.type === "multiple_choice" || q.type === "true_false") && optionsToRender.map((opt: any, i: number) => (
                <button key={i} onClick={() => !revealed && setSelected(i)} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all text-[14px] font-semibold ${selected === i ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--cn-border)]'}`} style={{ color: "var(--cn-text)" }}>{opt}</button>
              ))}
              
              {q.type === "multiple_select" && Array.isArray(q.options) && q.options.map((opt: string, i: number) => (
                <button key={i} onClick={() => !revealed && (multiSelect.includes(i) ? setMultiSelect(multiSelect.filter(x => x !== i)) : setMultiSelect([...multiSelect, i]))} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all text-[14px] font-semibold flex items-center justify-between ${multiSelect.includes(i) ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--cn-border)]'}`} style={{ color: "var(--cn-text)" }}>
                  {opt} {multiSelect.includes(i) && <CheckCircle2 size={18} className="text-blue-500" />}
                </button>
              ))}
              
              {q.type === "reorder" && Array.isArray(reorderList) && reorderList.map((item, i) => (
                <div key={item} draggable={!revealed} onDragStart={(e) => {setDraggedIdx(i); e.dataTransfer.effectAllowed = "move";}} onDragOver={(e) => { e.preventDefault(); if (draggedIdx !== null && draggedIdx !== i) { const nl = [...reorderList]; const it = nl[draggedIdx]; nl.splice(draggedIdx, 1); nl.splice(i, 0, it); setDraggedIdx(i); setReorderList(nl); }}} onDragEnd={() => setDraggedIdx(null)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${draggedIdx === i ? 'opacity-20 bg-blue-500/10 border-dashed border-blue-400' : 'opacity-100'}`} style={{ color: "var(--cn-text)", background: "var(--cn-card)", borderColor: "var(--cn-border)" }}
                >
                  <GripVertical size={14} className="opacity-20 shrink-0" />
                  <span className="flex-1 font-semibold text-[13px]">{item}</span>
                </div>
              ))}
              
              {q.type === "open_answer" && (
                <input 
                  type="text" 
                  value={selected || ""} 
                  onChange={(e) => setSelected(e.target.value)} 
                  className="w-full p-4 rounded-xl border-2 bg-transparent outline-none focus:border-blue-500 font-semibold text-[14px]" 
                  style={{ color: "var(--cn-text)", borderColor: "var(--cn-border)" }} 
                  placeholder="Type answer..." 
                  disabled={revealed}
                />
              )}
              
              {revealed && (
                <div className={`mt-4 p-4 rounded-xl border-2 animate-in slide-in-from-top-2 ${isCorrect() ? 'bg-[#F5C518]/10 border-[#F5C518]/40' : 'bg-red-500/10 border-red-500/40'}`}>
                  <div className="flex items-center gap-2 mb-1.5 font-black text-[10px] tracking-widest uppercase">
                    {isCorrect() ? <><CheckCircle2 size={14} className="text-[#F5C518]"/> CORRECT</> : <><XCircle size={14} className="text-red-600"/> INCORRECT</>}
                  </div>
                  <p className="text-[11px] font-medium leading-relaxed opacity-60 italic" style={{ color: "var(--cn-text)" }}>{q.explanation}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="p-4 bg-[var(--cn-card)] border-t shrink-0" style={{ borderColor: "var(--cn-border)" }}>
            <button 
              onClick={revealed ? handleNext : () => setRevealed(true)} 
              disabled={!revealed && selected === null && multiSelect.length === 0 && q.type !== 'reorder'} 
              className={`w-full py-4 rounded-2xl font-bold text-white transition-all text-xs uppercase tracking-widest ${revealed ? 'bg-slate-900' : 'bg-blue-600 shadow-lg'}`}
            >
              {revealed ? "Continue" : "Check Answer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}