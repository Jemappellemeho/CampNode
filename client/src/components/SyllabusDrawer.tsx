import { X, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface Resource {
  type: 'video' | 'article' | 'podcast' | 'quiz';
  title: string;
  url?: string;
  duration?: string;
  estimatedTime?: string;
  estimatedMinutes?: number | null;
}

interface Subnode {
  id: string;
  title: string;
  type: 'prof' | 'ai';
  hasQuiz: boolean;
  resources: Resource[];
}

interface MainTopic {
  id: string;
  title: string;
  description: string;
  hasQuiz: boolean;
  resources: Resource[];
  subnodes: Subnode[];
}

interface SyllabusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pathData: MainTopic[];
  activeId: string | null;
  highlightedNodeId: string | null;
  onSelectTopic: (id: string) => void;
  onOpenNodeDetail: (node: {
    id: string;
    name: string;
    color: string;
    resources: Resource[];
    completed: boolean;
    quizCompleted: boolean;
  }) => void;
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
  highlightedNodeId,
  onSelectTopic,
  onOpenNodeDetail,
  completedIds,
  resourceOpenedIds,
  quizCompletedIds,
  overallProgress,
}: SyllabusDrawerProps) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // When a node is highlighted from the map: auto-expand its parent topic and scroll to it
  useEffect(() => {
    if (!highlightedNodeId || !isOpen) return;

    // Find which topic contains this node (could be the topic itself or a subnode)
    const parentTopic = pathData.find(
      (t) => t.id === highlightedNodeId || (t.subnodes || []).some((s) => s.id === highlightedNodeId)
    );
    if (!parentTopic) return;

    // Expand the parent topic
    setExpandedIds((prev) =>
      prev.includes(parentTopic.id) ? prev : [...prev, parentTopic.id]
    );

    // Scroll to the node after a short delay to let expansion render
    setTimeout(() => {
      const el = nodeRefs.current[highlightedNodeId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [highlightedNodeId, isOpen]);

  if (!isOpen) return null;

  // --- helpers ---
  const isResourceOpened = (id: string) =>
    resourceOpenedIds.includes(id) || completedIds.includes(id);
  const isQuizFinished = (id: string) =>
    quizCompletedIds.includes(id) || completedIds.includes(id);
  const isCoreComplete = (node: { id: string; hasQuiz: boolean }) => {
    if (!isResourceOpened(node.id)) return false;
    if (node.hasQuiz && !isQuizFinished(node.id)) return false;
    return true;
  };

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // --- resource display helpers ---
  const resourceLabel = (type: string) => {
    switch (type) {
      case 'video': return 'Video Resource';
      case 'article': return 'Reading Material';
      case 'podcast': return 'Audio Resource';
      case 'quiz': return 'Knowledge Check';
      default: return 'Resource';
    }
  };

  const resourceIcon = (type: string) => {
    switch (type) {
      case 'video': return '🎬';
      case 'article': return '📄';
      case 'podcast': return '🎧';
      case 'quiz': return '❓';
      default: return '📚';
    }
  };

  const resourceCardBg = (type: string) => {
    switch (type) {
      case 'video': return { background: '#FEE2E2' };
      case 'article': return { background: '#DBEAFE' };
      case 'podcast': return { background: '#EDE9FE' };
      case 'quiz': return { background: '#DCFCE7' };
      default: return { background: '#F3F4F6' };
    }
  };

  const formatTime = (resource: Resource) => {
    if (resource.estimatedMinutes) return `${resource.estimatedMinutes} min`;
    if (resource.estimatedTime) return resource.estimatedTime;
    if (resource.duration) return resource.duration;
    return null;
  };

  // Build flat numbering map matching the map nodes
  // T1, T2... for main topics; 1.1, 1.2... for prof subnodes; AI.1... for ai subnodes
  const buildNumberMap = () => {
    const map: Record<string, string> = {};
    pathData.forEach((topic, topicIdx) => {
      map[topic.id] = `T${topicIdx + 1}`;
      let profCount = 0;
      let aiCount = 0;
      (topic.subnodes || []).forEach((sub) => {
        if (sub.type === 'ai') {
          aiCount++;
          map[sub.id] = `AI.${aiCount}`;
        } else {
          profCount++;
          map[sub.id] = `${topicIdx + 1}.${profCount}`;
        }
      });
    });
    return map;
  };
  const numberMap = buildNumberMap();

  return (
    // No backdrop blur — just a side panel that pushes/overlaps
    <div className="fixed right-0 top-0 h-full z-[100] flex flex-col"
      style={{
        width: '100%',
        maxWidth: '380px',
        background: 'var(--cn-card)',
        borderLeft: '1px solid var(--cn-border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--cn-border)' }}>
        <h2 className="font-black text-lg uppercase tracking-widest font-mono"
          style={{ color: 'var(--cn-text)' }}>
          Course Syllabus
        </h2>
        <button onClick={onClose}
          className="p-1.5 rounded hover:bg-black/10 transition-colors"
          style={{ color: 'var(--cn-text)' }}>
          <X size={20} />
        </button>
      </div>

      {/* Progress */}
      <div className="px-5 py-3 shrink-0 border-b" style={{ borderColor: 'var(--cn-border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--cn-border)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${overallProgress}%`, background: '#F5C518' }} />
          </div>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--cn-text)' }}>{overallProgress}%</span>
        </div>
      </div>

      {/* Topic list — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {pathData.map((topic, topicIdx) => {
          const topicNumber = numberMap[topic.id];
          const topicComplete = isCoreComplete(topic);
          const isActiveTopic = activeId === topic.id;
          const isExpanded = expandedIds.includes(topic.id);

          // Count progress across topic + subnodes
          const allNodes = [topic, ...(topic.subnodes || [])];
          const completedCount = allNodes.filter((n) =>
            isCoreComplete({ id: n.id, hasQuiz: (n as any).hasQuiz })
          ).length;
          const totalCount = allNodes.length;

          return (
            <div key={topic.id}
              ref={(el) => { nodeRefs.current[topic.id] = el; }}
              className="rounded-xl overflow-hidden border transition-all"
              style={{
                borderColor: isActiveTopic ? '#3A9E3F' : 'var(--cn-border)',
                boxShadow: isActiveTopic ? '0 0 0 1px #3A9E3F' : undefined,
              }}>

              {/* Topic header row */}
              <button
                className="w-full flex items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/5"
                style={{ background: isActiveTopic ? 'rgba(58,158,63,0.07)' : 'var(--cn-bg)' }}
                onClick={() => {
                  onSelectTopic(topic.id);
                  toggleExpand(topic.id);
                }}
              >
                <span className="text-xs font-black font-mono w-7 shrink-0"
                  style={{ color: '#3A9E3F' }}>{topicNumber}</span>
                <span className="flex-1 text-xs font-bold uppercase tracking-wide leading-snug"
                  style={{ color: isActiveTopic ? '#3A9E3F' : 'var(--cn-text)' }}>
                  {topic.title}
                </span>
                <span className="text-[10px] font-mono shrink-0"
                  style={{ color: 'var(--cn-muted)' }}>
                  {completedCount}/{totalCount}
                </span>
                <span style={{ color: 'var(--cn-muted)' }}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {/* Expanded: main topic resources + subnodes */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: 'var(--cn-border)' }}>

                  {/* Main topic resource cards */}
                  {topic.resources && topic.resources.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest font-mono px-1"
                        style={{ color: '#3A9E3F' }}>
                        {topicNumber} · Main Topic
                      </p>
                      {topic.resources.map((res, idx) => {
                        const time = formatTime(res);
                        const isHighlighted = highlightedNodeId === topic.id;
                        return (
                          <button
                            key={idx}
                            className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:opacity-80"
                            style={{
                              ...resourceCardBg(res.type),
                              outline: isHighlighted ? '2px solid #3A9E3F' : undefined,
                            }}
                            onClick={() => onOpenNodeDetail({
                              id: topic.id,
                              name: topic.title,
                              color: 'green',
                              resources: topic.resources,
                              completed: isResourceOpened(topic.id),
                              quizCompleted: isQuizFinished(topic.id),
                            })}
                          >
                            <span className="text-xl shrink-0">{resourceIcon(res.type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-800 break-words whitespace-normal leading-snug">
                                {res.title}
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{resourceLabel(res.type)}</p>
                            </div>
                            {time && (
                              <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-gray-500 bg-white/60 rounded-full px-1.5 py-0.5">
                                <Clock size={9} /> {time}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Subnodes */}
                  {(topic.subnodes || []).map((sub, subIdx) => {
                    const subNumber = numberMap[sub.id];
                    const subComplete = isCoreComplete(sub);
                    const isHighlighted = highlightedNodeId === sub.id;
                    const subColor = sub.type === 'ai' ? '#E63027' : '#1E6FFF';

                    return (
                      <div key={sub.id}
                        ref={(el) => { nodeRefs.current[sub.id] = el; }}
                        className="rounded-lg border overflow-hidden"
                        style={{
                          borderColor: isHighlighted ? subColor : 'var(--cn-border)',
                          boxShadow: isHighlighted ? `0 0 0 1px ${subColor}` : undefined,
                          background: isHighlighted ? `${subColor}10` : undefined,
                        }}>

                        {/* Subnode label */}
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <span className="text-[10px] font-black font-mono shrink-0"
                            style={{ color: subColor }}>{subNumber}</span>
                          <span className="flex-1 text-xs font-bold break-words whitespace-normal leading-snug"
                            style={{ color: subColor }}>
                            {sub.title}
                          </span>
                          {subComplete && (
                            <span className="text-xs shrink-0" style={{ color: '#3A9E3F' }}>✔</span>
                          )}
                          {sub.type === 'ai' && (
                            <span className="text-[9px] font-black uppercase font-mono px-1.5 py-0.5 rounded"
                              style={{ background: '#E6302715', color: '#E63027' }}>AI</span>
                          )}
                        </div>

                        {/* Subnode resource cards */}
                        {sub.resources && sub.resources.length > 0 && (
                          <div className="px-2 pb-2 space-y-1">
                            {sub.resources.map((res, idx) => {
                              const time = formatTime(res);
                              return (
                                <button
                                  key={idx}
                                  className="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all hover:opacity-80"
                                  style={resourceCardBg(res.type)}
                                  onClick={() => onOpenNodeDetail({
                                    id: sub.id,
                                    name: sub.title,
                                    color: sub.type === 'ai' ? 'red' : 'blue',
                                    resources: sub.resources,
                                    completed: isResourceOpened(sub.id),
                                    quizCompleted: isQuizFinished(sub.id),
                                  })}
                                >
                                  <span className="text-base shrink-0">{resourceIcon(res.type)}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-semibold text-gray-800 break-words whitespace-normal leading-snug">
                                      {res.title}
                                    </p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">{resourceLabel(res.type)}</p>
                                  </div>
                                  {time && (
                                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-gray-500 bg-white/60 rounded-full px-1.5 py-0.5">
                                      <Clock size={9} /> {time}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t shrink-0 flex items-center gap-4"
        style={{ borderColor: 'var(--cn-border)' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
          <span className="text-[10px] font-mono" style={{ color: 'var(--cn-muted)' }}>Main</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#1E6FFF' }} />
          <span className="text-[10px] font-mono" style={{ color: 'var(--cn-muted)' }}>Prof</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#E63027' }} />
          <span className="text-[10px] font-mono" style={{ color: 'var(--cn-muted)' }}>AI</span>
        </div>
      </div>
    </div>
  );
}