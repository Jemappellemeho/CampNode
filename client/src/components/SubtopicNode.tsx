import { MonitorPlay, BookOpen, Headphones } from 'lucide-react';

interface SubtopicProps {
  sub: any;
  isCompleted: boolean;
  onMarkComplete: (id: string) => void;
  onOpenResource: (resource: any) => void;
}

export default function SubtopicNode({ sub, isCompleted, onMarkComplete, onOpenResource }: SubtopicProps) {
  const colorClass = sub.type === 'ai' ? 'bg-red-500' : 'bg-blue-500';
  
  return (
    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
      <button 
        onClick={() => onMarkComplete(sub.id)}
        className={`w-20 h-20 sm:w-24 sm:h-24 rotate-45 rounded-xl flex items-center justify-center shadow-xl transition-all hover:scale-110 relative
          ${colorClass} ${isCompleted ? 'ring-4 ring-green-400 shadow-green-500/50' : 'brightness-90'}`}
      >
        <div className="-rotate-45 flex flex-col items-center px-2">
          {isCompleted && <span className="text-[10px] text-white font-bold mb-1">DONE ✔️</span>}
          <span className="text-white font-bold text-[9px] sm:text-[10px] text-center leading-tight line-clamp-3">
            {sub.title}
          </span>
        </div>
      </button>

      {/* Action Bar */}
      <div className="mt-8 flex gap-3 p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 shadow-sm">
        {sub.resources.map((res: any, i: number) => (
          <button 
            key={i}
            onClick={() => { onOpenResource(res); onMarkComplete(sub.id); }}
            className="hover:scale-125 transition-transform text-blue-500"
          >
            {res.type === 'video' && <MonitorPlay size={14} />}
            {res.type === 'article' && <BookOpen size={14} />}
            {res.type === 'podcast' && <Headphones size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}