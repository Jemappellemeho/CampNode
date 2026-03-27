import { X, CheckCircle, Zap } from 'lucide-react';

interface SyllabusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pathData: any[];
  activeId: string | null;
  onSelectTopic: (id: string) => void;
  completedIds: string[];
  overallProgress: number;
}

export default function SyllabusDrawer({ 
  isOpen, 
  onClose, 
  pathData, 
  activeId, 
  onSelectTopic, 
  completedIds, 
  overallProgress 
}: SyllabusDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer Content */}
      <div className="relative w-full sm:w-96 h-full p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto" 
           style={{ background: "var(--cn-card)", borderLeft: "1px solid var(--cn-border)" }}>
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-2xl uppercase" style={{ color: "var(--cn-text)" }}>Course Syllabus</h2>
          <button onClick={onClose} style={{ color: "var(--cn-text)" }}><X size={24}/></button>
        </div>

        {/* Overall Progress Card (Antigravity Style) */}
        <div className="mb-8 p-4 rounded-xl" style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--cn-muted)" }}>Overall Progress</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--cn-border)" }}>
              <div className="h-full transition-all duration-1000" style={{ width: `${overallProgress}%`, background: "#F5C518" }} />
            </div>
            <span className="text-lg font-bold" style={{ color: "var(--cn-text)" }}>{overallProgress}%</span>
          </div>
        </div>

        {/* Topic List */}
        <div className="space-y-6">
          {pathData.map(p => (
            <div key={p.id} className="pb-6 border-b" style={{ borderColor: "var(--cn-border)" }}>
              <button 
                onClick={() => { onSelectTopic(p.id); onClose(); }} 
                className={`text-sm uppercase w-full text-left mb-2 font-bold ${activeId === p.id ? 'text-green-500' : 'text-blue-500'}`}
              >
                {p.title}
                <span className="ml-2 text-[10px] opacity-75">
                  ({p.subnodes.filter((s: any) => completedIds.includes(s.id)).length}/{p.subnodes.length})
                </span>
              </button>
              
              <div className="pl-4 border-l-2 space-y-2" style={{ borderColor: "var(--cn-border)" }}>
                {p.subnodes.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    {completedIds.includes(s.id) ? (
                      <CheckCircle size={12} className="text-green-500" />
                    ) : (
                      <Zap size={12} className="text-blue-500 opacity-40" />
                    )}
                    <span style={{ color: "var(--cn-text)" }}>{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Legend Section */}
        <div className="mt-8 p-4 rounded-xl space-y-2 text-xs" style={{ background: "var(--cn-bg)", border: "1px solid var(--cn-border)" }}>
          <p className="font-bold mb-2" style={{ color: "var(--cn-text)" }}>Legend:</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span style={{ color: "var(--cn-text)" }}>Main topics</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-600 rounded" />
            <span style={{ color: "var(--cn-text)" }}>Professor content</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span style={{ color: "var(--cn-text)" }}>AI suggestions</span>
          </div>
        </div>
      </div>
    </div>
  );
}