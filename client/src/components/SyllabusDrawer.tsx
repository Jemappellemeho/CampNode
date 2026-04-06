import { X } from 'lucide-react';

// It displays the course syllabus, including topics and subtopics, 
// along with their completion status. Users can click on a topic to navigate 
// to it, and the drawer can be closed by clicking outside of it or on the close button.
interface SyllabusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pathData: any[];
  activeId: string | null;
  onSelectTopic: (id: string) => void;
  completedIds: string[];
  resourceOpenedIds: string[];
  quizCompletedIds: string[];
  overallProgress: number;
}

export default function SyllabusDrawer({ 
  isOpen, 
  onClose, 
  pathData, 
  activeId, 
  onSelectTopic, 
  completedIds, 
  resourceOpenedIds,
  quizCompletedIds,
  overallProgress 
}: SyllabusDrawerProps) {
  if (!isOpen) return null;

  const hasQuizForTopic = (topicId: string) => {
    const match = pathData.find((topic) => topic.id === topicId || (topic.subnodes || []).some((sub: any) => sub.id === topicId));
    if (!match) return false;
    if (match.id === topicId) return Boolean(match.hasQuiz);
    const matchedSub = (match.subnodes || []).find((sub: any) => sub.id === topicId);
    return Boolean(matchedSub?.hasQuiz);
  };

  const isResourceOpened = (topicId: string) => resourceOpenedIds.includes(topicId) || completedIds.includes(topicId);
  const isQuizFinished = (topicId: string) => quizCompletedIds.includes(topicId) || completedIds.includes(topicId);

  const isCoreComplete = (topicId: string) => {
    const requiresQuiz = hasQuizForTopic(topicId);
    return isResourceOpened(topicId) && (!requiresQuiz || isQuizFinished(topicId));
  };

  const getCoreProgress = (topicId: string) => {
    const requiresQuiz = hasQuizForTopic(topicId);
    const completed = (isResourceOpened(topicId) ? 1 : 0) + (requiresQuiz && isQuizFinished(topicId) ? 1 : 0);
    const total = 1 + (requiresQuiz ? 1 : 0);
    return { completed, total };
  };

  const isNodeComplete = (node: any) => {
    if (Array.isArray(node.subnodes) && node.subnodes.length > 0) {
      return node.subnodes.every((sub: any) => isCoreComplete(sub.id));
    }

    return isCoreComplete(node.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:w-96 h-full p-4 sm:p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto"
        style={{ background: 'var(--cn-card)', borderLeft: '1px solid var(--cn-border)' }}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-xl sm:text-2xl uppercase" style={{ color: 'var(--cn-text)' }}>Course Syllabus</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--cn-text)' }}>
            <X size={22} />
          </button>
        </div>

        <div className="mb-6 sm:mb-8 p-3 sm:p-4 rounded-xl" style={{ background: 'var(--cn-bg)', border: '1px solid var(--cn-border)' }}>
          <p className="text-xs sm:text-sm font-semibold mb-2" style={{ color: 'var(--cn-muted)' }}>Overall Progress</p>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 h-2 sm:h-3 rounded-full overflow-hidden" style={{ background: 'var(--cn-border)' }}>
              <div className="h-full transition-all rounded-full" style={{ width: `${overallProgress}%`, background: '#F5C518' }} />
            </div>
            <span className="text-base sm:text-lg font-bold" style={{ color: 'var(--cn-text)' }}>{overallProgress}%</span>
          </div>
        </div>

        <div className="space-y-5 sm:space-y-6">
          {pathData.map(p => (
            <div key={p.id} className="pb-4 sm:pb-6 border-b" style={{ borderColor: 'var(--cn-border)' }}>
              {(() => {
                const mainProgress = getCoreProgress(p.id);
                const subProgress = (p.subnodes || []).reduce(
                  (acc: { completed: number; total: number }, s: any) => {
                    const part = getCoreProgress(s.id);
                    return {
                      completed: acc.completed + part.completed,
                      total: acc.total + part.total,
                    };
                  },
                  { completed: 0, total: 0 }
                );
                const totalItems = mainProgress.total + subProgress.total;
                const completedItems = mainProgress.completed + subProgress.completed;
                const mainTopicDone = isNodeComplete(p);
                const mainTopicQuizDone = Boolean(p.hasQuiz) && (isQuizFinished(p.id) || completedIds.includes(p.id));

                return (
                  <>
                    <button
                      onClick={() => {
                        onSelectTopic(p.id);
                        onClose();
                      }}
                      className="text-xs sm:text-sm uppercase transition-all w-full text-left mb-2 font-bold"
                      style={{ color: activeId === p.id ? '#3A9E3F' : '#1E6FFF' }}
                    >
                      {p.title}
                      <span className="ml-2 text-[10px] opacity-75">({completedItems}/{totalItems})</span>
                    </button>

                    <p className="text-[10px] sm:text-xs mb-3 leading-relaxed" style={{ color: 'var(--cn-muted)' }}>
                      {p.description}
                    </p>

                    <div className="pl-3 sm:pl-4 border-l-2 space-y-2" style={{ borderColor: 'var(--cn-border)' }}>
                      <div className="flex items-center gap-1.5">
                        {mainTopicDone && <span className="text-xs" style={{ color: '#3A9E3F' }}>✔️</span>}
                        {!mainTopicDone && <span className="text-xs" style={{ color: '#1E6FFF' }}>⚡</span>}
                        <span className="text-xs sm:text-sm font-bold" style={{ color: mainTopicDone ? '#3A9E3F' : '#1E6FFF' }}>
                          Main topic
                        </span>
                        {mainTopicQuizDone && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                            +Quiz
                          </span>
                        )}
                      </div>
                      {(p.subnodes || []).map((s: any) => {
                        const coreDone = isCoreComplete(s.id);
                        const quizDone = Boolean(s.hasQuiz) && (isQuizFinished(s.id) || completedIds.includes(s.id));
                        const tone = coreDone ? '#3A9E3F' : s.type === 'ai' ? '#E63027' : '#1E6FFF';

                        return (
                          <div key={s.id} className="flex items-center gap-1.5">
                            {coreDone && <span className="text-xs" style={{ color: '#3A9E3F' }}>✔️</span>}
                            {!coreDone && <span className="text-xs" style={{ color: '#1E6FFF' }}>⚡</span>}
                            <span className="text-xs sm:text-sm font-bold" style={{ color: tone }}>
                              {s.title}
                            </span>
                            {quizDone && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                                +Quiz
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>

        <div className="mt-6 sm:mt-8 p-3 sm:p-4 rounded-xl space-y-2 text-xs sm:text-sm" style={{ background: 'var(--cn-bg)', border: '1px solid var(--cn-border)' }}>
          <p className="font-bold mb-2" style={{ color: 'var(--cn-text)' }}>Legend:</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded shrink-0" />
            <span className="text-[10px] sm:text-xs">Main topics</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded shrink-0" style={{ background: '#1E6FFF' }} />
            <span className="text-[10px] sm:text-xs">Professor content</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded shrink-0" style={{ background: '#E63027' }} />
            <span className="text-[10px] sm:text-xs">AI suggestions</span>
          </div>
        </div>
      </div>
    </div>
  );
}