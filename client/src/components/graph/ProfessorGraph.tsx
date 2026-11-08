import { useState, useEffect, useRef } from 'react';
import { findViolations, violationText } from '../../utils/prerequisiteViolations';
import { computeRetroGridLayout } from '../../utils/retroGridLayout';
import RetroNode from '../RetroNode';
import { Eye, EyeOff, ChevronLeft, Plus, Edit3, Trash2, Link2, X, ArrowRightLeft, Loader2 } from 'lucide-react';
import { api } from '../../utils/api';
import { getGraphDropSlots, type GraphDropNode, type GraphDropSlot } from './graphDropSlots';

interface ProfessorGraphProps {
  courseId: string;
  courseTitle: string;
  topics: any[];
  onDashboardClick: () => void;
  performMove: (
    subtopicId: string,
    targetParentId: string,
    targetIndex: number
  ) => Promise<void>;
  movingSubtopicId: string | null;
  onRefreshCourse?: () => void;
}

interface DragPreview {
  subtopicId: string;
  pointerX: number;
  pointerY: number;
}

interface DragGesture {
  pointerId: number;
  startX: number;
  startY: number;
  subtopicId: string;
  started: boolean;
  cancelled: boolean;
}

// Cubic Bezier arrow from the bottom-center of the prerequisite node to the bottom-center of the dependent node
function prereqArrowPath(x1: number, y1: number, x2: number, y2: number) {
  const d = Math.min(120, Math.max(40, 40 + Math.abs(x2 - x1) * 0.15));
  const sameCol = Math.abs(x2 - x1) < 20;
  const shift = sameCol ? 70 : 0;
  return `M ${x1} ${y1} C ${x1 + shift} ${y1 + d}, ${x2 + shift} ${y2 + d}, ${x2} ${y2}`;
}
export default function ProfessorGraph({
  courseId,
  courseTitle,
  topics,
  onDashboardClick,
  performMove,
  movingSubtopicId,
  onRefreshCourse,
}: ProfessorGraphProps) {
  const [showPrerequisites, setShowPrerequisites] = useState(false);
  const [shownPrereqNodes, setShownPrereqNodes] = useState<Set<string>>(new Set());
  const togglePrereqNode = (id: string) => {
    setShownPrereqNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragGestureRef = useRef<DragGesture | null>(null);
  const suppressNextClickRef = useRef(false);

  // Modal State for CRUD / Reglueing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create-topic' | 'edit-topic' | 'create-sub' | 'edit-sub' | 'reglue'>('create-topic');
  const [activeTarget, setActiveTarget] = useState<any>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formArticleUrl, setFormArticleUrl] = useState('');

  const getRawWidth = () => document.documentElement.clientWidth || window.innerWidth;
  const [rawWidth, setRawWidth] = useState(getRawWidth());

  useEffect(() => {
    const onResize = () => setRawWidth(getRawWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const initialMap: Record<string, boolean> = {};
    topics.forEach((t) => {
      initialMap[t.id] = true;
    });
    setExpandedMap(initialMap);
  }, [topics]);

  const isSm = rawWidth < 640;
  const xPadding = isSm ? 20 : 50;
  const availableWidth = rawWidth - xPadding * 2;
  const idealCellWidth = isSm ? 150 : 200;
  const cols = Math.min(6, Math.max(isSm ? 2 : 1, Math.floor(availableWidth / idealCellWidth)));

  const flatNodes: any[] = [];

  let currentIndex = 0;

  topics.forEach((topic, tIdx) => {
    flatNodes.push({
      ...topic,
      name: topic.name || topic.title,
      displayNumber: `T${tIdx + 1}`,
      isMain: true,
      listIndex: currentIndex++,
    });

    const isExpanded = expandedMap[topic.id] ?? true;
    if (isExpanded && Array.isArray(topic.subtopics)) {
      topic.subtopics.forEach((sub: any, sIdx: number) => {
       {
          flatNodes.push({
            ...sub,
            name: sub.name || sub.title,
            displayNumber: `${tIdx + 1}.${sIdx + 1}`,
            isMain: false,
            isAi: !!sub.aiSuggested,
            parentId: topic.id,
            subtopicIndex: sIdx,
            listIndex: currentIndex++,
          });
        }
      });
    }
  });

  // Same positions and flow lines as the student view (Retro)
  const {
    coreCoordsMap: coordsMap,
    corePaths,
    coreNodeSize,
    containerWidth,
    containerHeight,
  } = computeRetroGridLayout(flatNodes, [], cols, availableWidth, xPadding, isSm);

  const visibleFlowNodes: GraphDropNode[] = flatNodes.flatMap((node) => {
    const point = coordsMap[node.id];
    if (!point) return [];
    return [{
      id: node.id,
      kind: node.isMain ? 'topic' : 'subtopic',
      topicId: node.isMain ? node.id : node.parentId,
      index: node.isMain ? -1 : node.subtopicIndex,
      x: point.px,
      y: point.py,
      collapsed: node.isMain && !(expandedMap[node.id] ?? true),
    }];
  });
  const dropSlots = dragPreview
    ? getGraphDropSlots(visibleFlowNodes, dragPreview.subtopicId)
    : [];
  let nearestDropSlot: GraphDropSlot | null = null;
  if (dragPreview) {
    nearestDropSlot = dropSlots.reduce<GraphDropSlot | null>((nearest, slot) => {
      if (!nearest) return slot;
      const currentDistance = Math.hypot(slot.x - dragPreview.pointerX, slot.y - dragPreview.pointerY);
      const nearestDistance = Math.hypot(
        nearest.x - dragPreview.pointerX,
        nearest.y - dragPreview.pointerY
      );
      return currentDistance < nearestDistance ? slot : nearest;
    }, null);
  }
  const draggedNode = dragPreview
    ? flatNodes.find((node) => node.id === dragPreview.subtopicId)
    : null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isModalOpen || !(event.target instanceof HTMLElement)) return;
    const nodeButton = event.target.closest<HTMLElement>('button.retro-node-sub');
    const nodeContainer = nodeButton?.closest<HTMLElement>('[data-graph-node-id]');
    const subtopicId = nodeContainer?.dataset.graphNodeId;
    const node = flatNodes.find((item) => item.id === subtopicId);
    if (!nodeButton || !node || node.isMain || node.isAi) return;

    dragGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      subtopicId: node.id,
      started: false,
      cancelled: false,
    };
    nodeButton.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    if (!gesture.started) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) <= 5) return;
      gesture.started = true;
      suppressNextClickRef.current = true;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setDragPreview({
      subtopicId: gesture.subtopicId,
      pointerX: event.clientX - bounds.left,
      pointerY: event.clientY - bounds.top,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    dragGestureRef.current = null;

    if (!gesture.cancelled && gesture.started) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;
      const slots = getGraphDropSlots(visibleFlowNodes, gesture.subtopicId);
      const target = slots.reduce<GraphDropSlot | null>((nearest, slot) => {
        if (!nearest) return slot;
        return Math.hypot(slot.x - pointerX, slot.y - pointerY) <
          Math.hypot(nearest.x - pointerX, nearest.y - pointerY)
          ? slot
          : nearest;
      }, null);

      if (target) {
        void performMove(
          gesture.subtopicId,
          target.targetTopicId,
          target.targetIndex
        );
      }
      setDragPreview(null);
    }
    if (gesture.started) {
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    }
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    dragGestureRef.current = null;
    setDragPreview(null);
    suppressNextClickRef.current = false;
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const gesture = dragGestureRef.current;
      if (gesture?.started && !gesture.cancelled) {
        gesture.cancelled = true;
        setDragPreview(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A link is wrong if its prerequisite is not earlier than the item that needs it
  const violations = findViolations(topics);
  const flaggedEdges = new Set(violations.map((v) => `${v.prerequisiteId}->${v.itemId}`));
  const warningCounts = new Map<string, number>();
  violations.forEach((v) => warningCounts.set(v.itemId, (warningCounts.get(v.itemId) || 0) + 1));

  const prereqLines: Array<{ key: string; d: string; isViolation: boolean; title?: string }> = [];
  if (showPrerequisites) {
    topics.forEach((topic) => {
      const checkPrereqs = (item: any) => {
        if (Array.isArray(item.prerequisites)) {
          item.prerequisites.forEach((p: any) => {
            const pCoord = coordsMap[p.id];
            const iCoord = coordsMap[item.id];
            if (pCoord && iCoord) {
              const edgeKey = `${p.id}->${item.id}`;
              const isViolation = flaggedEdges.has(edgeKey);
              const touchesToggled = shownPrereqNodes.has(p.id) || shownPrereqNodes.has(item.id);
              const half = coreNodeSize / 2;
              if (isViolation) {
                const violation = violations.find(
                  (entry) => entry.itemId === item.id && entry.prerequisiteId === p.id
                );
                prereqLines.push({
                  key: `prereq-${p.id}-${item.id}`,
                  d: prereqArrowPath(pCoord.px, pCoord.py + half, iCoord.px, iCoord.py + half),
                  isViolation: true,
                  title: violation ? violationText(violation) : undefined,
                });
              } else if (touchesToggled) {
                prereqLines.push({
                  key: `prereq-${p.id}-${item.id}`,
                  d: prereqArrowPath(pCoord.px, pCoord.py + half, iCoord.px, iCoord.py + half),
                  isViolation: false,
                });
              }
            }
          });
        }
      };
      checkPrereqs(topic);
      (topic.subtopics || []).forEach(checkPrereqs);
    });
  }

  const handleSaveModal = async () => {
    try {
      if (modalMode === 'create-topic') {
        await api.post(`/courses/${courseId}/topics`, { name: formName, description: formDesc });
      } else if (modalMode === 'edit-topic' && activeTarget) {
        await api.put(`/topics/${activeTarget.id}`, { name: formName, description: formDesc });
      } else if (modalMode === 'create-sub' && formParentId) {
        await api.post(`/topics/${formParentId}/subtopics`, { name: formName, videoUrl: formVideoUrl, articleUrl: formArticleUrl });
      } else if (modalMode === 'edit-sub' || modalMode === 'reglue') {
        if (activeTarget) {
          await api.put(`/subtopics/${activeTarget.id}`, { 
            name: formName || activeTarget.name, 
            topicId: formParentId, 
            videoUrl: formVideoUrl || activeTarget.videoUrl, 
            articleUrl: formArticleUrl || activeTarget.articleUrl 
          });
        }
      }
      setIsModalOpen(false);
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      console.error('Failed to save node data:', err);
      alert('Operation failed.');
    }
  };

  const handleDeleteNode = async (node: any) => {
    if (!confirm(`Are you sure you want to delete "${node.name}"?`)) return;
    try {
      if (node.isMain) {
        await api.delete(`/topics/${node.id}`);
      } else {
        await api.delete(`/subtopics/${node.id}`);
      }
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Deletion failed.');
    }
  };

  return (
    <div 
      className="min-h-screen font-sans relative" 
      style={{ 
        backgroundColor: 'var(--cn-page)', 
        backgroundImage: 'linear-gradient(var(--cn-border) 1px, transparent 1px), linear-gradient(90deg, var(--cn-border) 1px, transparent 1px)', 
        backgroundSize: '40px 40px',
        width: rawWidth >= 768 ? `${rawWidth}px` : '100%',
        marginLeft: rawWidth >= 768 ? `calc(50% - ${rawWidth / 2}px)` : '0',
      }}
    >
      <style>{`
        @keyframes juiceFlow {
          from { stroke-dashoffset: 40; }
          to { stroke-dashoffset: 0; }
        }
        .juice-line {
          stroke-dasharray: 20 10;
          animation: juiceFlow 0.5s linear infinite;
        }
        .retro-node {
          background: var(--cn-card);
          border: 2px solid;
          text-transform: uppercase;
        }
        .retro-node-main {
          border-color: #3A9E3F;
          color: #3A9E3F;
          box-shadow: 0 0 10px #3A9E3F, inset 0 0 5px #3A9E3F;
        }
        .retro-node-sub {
          border-color: #3B82F6;
          color: #3B82F6;
          box-shadow: 0 0 10px #3B82F6, inset 0 0 5px #3B82F6;
        }
        .retro-node-ai {
          border-color: #EF4444;
          color: #EF4444;
          box-shadow: 0 0 10px #EF4444, inset 0 0 5px #EF4444;
        }
        .graph-node-container > div { pointer-events: auto; }
        .graph-node-container[data-draggable="true"] .retro-node-sub { cursor: grab; touch-action: none; }
        .graph-node-container[data-drag-source="true"] .retro-node { opacity: 0.4; }
        .retro-hud {
          background: var(--cn-card);
          border-bottom: 1px solid var(--cn-border);
          box-shadow: 0 0 12px rgba(0, 0, 0, 0.15);
        }
      `}</style>

      {/* HEADER HUD */}
      <div className="relative z-40 px-4 py-2.5 retro-hud flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={onDashboardClick} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 hover:bg-black/10 border border-transparent rounded transition-colors" style={{ color: "var(--cn-text)" }}>
            <ChevronLeft size={16} /> <span>[DASHBOARD]</span>
          </button>
          <button
            onClick={() => {
              setModalMode('create-topic');
              setFormName('');
              setFormDesc('');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-black uppercase tracking-wider shadow-md transition-all"
          >
            <Plus size={14} /> <span>Add Topic</span>
          </button>
        </div>

        <button
          onClick={() => setShowPrerequisites(!showPrerequisites)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition-all border ${
            showPrerequisites
              ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-[0_0_8px_rgba(245,197,24,0.3)]'
              : 'bg-transparent border-gray-600 text-gray-400'
          }`}
        >
          {showPrerequisites ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>Prerequisites</span>
          {flaggedEdges.size > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-black rounded-full text-[10px] font-black">
              {flaggedEdges.size}
            </span>
          )}
        </button>
      </div>

      <main className="pb-16 flex flex-col items-center pt-3 w-full overflow-hidden">
        <div className="mb-2 text-center pointer-events-none px-4 w-full max-w-4xl mx-auto">
          <h1 className="text-lg sm:text-2xl font-bold tracking-widest drop-shadow-[0_0_6px_rgba(58,158,63,0.8)] uppercase" style={{ color: "var(--cn-text)" }}>
            {courseTitle}
          </h1>
          <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Click main nodes to expand/collapse subtopics • Hover nodes for quick actions</p>
        </div>

        <div className="w-full overflow-auto pb-10">
          <div className="relative shrink-0 mx-auto" style={{ width: containerWidth, height: containerHeight }}>
            <svg className="absolute inset-0 pointer-events-none z-10" width="100%" height="100%">
              {corePaths.map((path) => (
                <polyline
                  key={path.key}
                  points={path.d.replace(/M |L /g, '')}
                  stroke={path.color}
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  className="juice-line"
                  style={{ filter: `drop-shadow(0 0 6px ${path.color})` }}
                />
              ))}
            </svg>

            <svg className="absolute inset-0 pointer-events-none z-[15]" width="100%" height="100%">
              <defs>
                <marker id="arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#FFBF00" />
                </marker>
                <marker id="arrow-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
                </marker>
              </defs>
              {prereqLines.filter((l) => !l.isViolation).map((line) => (
                <path
                  key={line.key}
                  d={line.d}
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="none"
                  markerEnd="url(#arrow-ok)"
                />
              ))}
              {prereqLines.filter((l) => l.isViolation).map((line) => (
                <path
                  key={line.key}
                  d={line.d}
                  stroke="#FFBF00"
                  strokeWidth={3}
                  fill="none"
                  markerEnd="url(#arrow-warn)"
                  style={{ filter: 'drop-shadow(0 0 6px #FFBF00)' }}
                >
                  {line.title && <title>{line.title}</title>}
                </path>
              ))}
            </svg>

            <div
              className="absolute inset-0 pointer-events-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
            {flatNodes.map((node) => {
              const pt = coordsMap[node.id];
              if (!pt) return null;
              const isCollapsedTopic = node.isMain && !(expandedMap[node.id] ?? true);
              const hiddenWarnings = isCollapsedTopic
                ? (node.subtopics || []).reduce((n: number, s: any) => n + (warningCounts.get(s.id) || 0), 0)
                : 0;
              const hasWarnings = (warningCounts.get(node.id) || 0) + hiddenWarnings > 0;
              const nodeViolations = isCollapsedTopic
                ? violations.filter((violation) =>
                    violation.itemId === node.id ||
                    (node.subtopics || []).some((sub: any) => sub.id === violation.itemId)
                  )
                : violations.filter((violation) => violation.itemId === node.id);
              const warningTitle = isCollapsedTopic
                ? `${nodeViolations.length} prerequisite violations:\n${nodeViolations.map(violationText).join('\n')}`
                : nodeViolations.map(violationText).join('\n');
              const isHighlighted = highlightedId === node.id;

              return (
                <div
                  key={node.id}
                  className="graph-node-container absolute inset-0 pointer-events-none"
                  data-graph-node-id={node.id}
                  data-draggable={!node.isMain && !node.isAi ? 'true' : undefined}
                  data-drag-source={dragPreview?.subtopicId === node.id ? 'true' : undefined}
                >
                <RetroNode
                  px={pt.px}
                  py={pt.py}
                  size={coreNodeSize}
                  variant={node.isMain ? 'main' : node.isAi ? 'ai' : 'sub'}
                  label={node.displayNumber}
                  title={node.name}
                  lit={true}
                  isHighlighted={isHighlighted}
                  onClick={() => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    if (node.isMain) {
                      setExpandedMap((prev) => ({ ...prev, [node.id]: !(prev[node.id] ?? true) }));
                    }
                    setHighlightedId(node.id);
                  }}
                >
                  {movingSubtopicId === node.id && (
                    <span className="absolute inset-0 z-40 flex items-center justify-center rounded-[1.75rem] bg-blue-950/60 pointer-events-none">
                      <Loader2 size={28} className="animate-spin text-white drop-shadow-[0_0_6px_#3B82F6]" />
                    </span>
                  )}
                  {hasWarnings && (
                    <span
                      className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-black shadow-lg animate-pulse z-30"
                      title={warningTitle}
                    >
                      !
                    </span>
                  )}

                  {/* Quick Action Toolbar on Hover */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-gray-900 border border-gray-700 px-2.5 py-1 rounded-full shadow-xl z-50">
                    {node.isMain && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalMode('create-sub');
                          setFormParentId(node.id);
                          setFormName('');
                          setFormVideoUrl('');
                          setFormArticleUrl('');
                          setIsModalOpen(true);
                        }}
                        className="text-green-400 hover:text-white p-0.5"
                        title="Add Subtopic"
                      >
                        <Plus size={13} />
                      </button>
                    )}
                    {!node.isMain && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTarget(node);
                          setFormParentId(node.parentId);
                          setModalMode('reglue');
                          setIsModalOpen(true);
                        }}
                        className="text-amber-400 hover:text-white p-0.5"
                        title="Reglue to another topic"
                      >
                        <Link2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePrereqNode(node.id);
                      }}
                      className={`p-0.5 ${shownPrereqNodes.has(node.id) ? 'bg-blue-600 text-white rounded' : 'text-blue-400 hover:text-white'}`}
                      title="Show prerequisite arrows"
                    >
                      <ArrowRightLeft size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTarget(node);
                        setFormName(node.name);
                        setFormDesc(node.description || '');
                        setFormParentId(node.parentId || node.id);
                        setFormVideoUrl(node.videoUrl || '');
                        setFormArticleUrl(node.articleUrl || '');
                        setModalMode(node.isMain ? 'edit-topic' : 'edit-sub');
                        setIsModalOpen(true);
                      }}
                      className="text-blue-400 hover:text-white p-0.5"
                      title="Edit Node"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node);
                      }}
                      className="text-red-400 hover:text-white p-0.5"
                      title="Delete Node"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </RetroNode>
                </div>
              );
            })}
            </div>

            {dragPreview && draggedNode && (
              <div
                className="retro-node retro-node-sub absolute z-[90] flex items-center justify-center rounded-[1.75rem] text-base sm:text-lg font-bold pointer-events-none"
                style={{
                  left: dragPreview.pointerX,
                  top: dragPreview.pointerY,
                  width: coreNodeSize,
                  height: coreNodeSize,
                  opacity: 0.65,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {draggedNode.displayNumber}
              </div>
            )}
            {dragPreview && nearestDropSlot && (
              <>
                <div
                  className="absolute z-[90] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#00A3FF] pointer-events-none shadow-[0_0_14px_5px_rgba(0,163,255,0.9)]"
                  style={{ left: nearestDropSlot.x, top: nearestDropSlot.y }}
                />
                <div
                  className="absolute z-[100] rounded border border-[#00A3FF] bg-gray-950/90 px-2 py-1 text-xs font-bold text-white pointer-events-none whitespace-nowrap shadow-[0_0_10px_rgba(0,163,255,0.65)]"
                  style={{ left: dragPreview.pointerX + 16, top: dragPreview.pointerY + 16 }}
                >
                  Topic {topics.findIndex((topic) => topic.id === nearestDropSlot?.targetTopicId) + 1},
                  {' '}position {nearestDropSlot.targetIndex + 1}
                </div>
              </>
            )}


          </div>
        </div>
  
      </main >

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-[#3A9E3F] bg-[#121212] p-6 shadow-[0_0_25px_rgba(58,158,63,0.3)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#3A9E3F]">
                {modalMode === 'create-topic' && 'Create New Main Topic'}
                {modalMode === 'edit-topic' && 'Edit Main Topic'}
                {modalMode === 'create-sub' && 'Add Subtopic'}
                {modalMode === 'edit-sub' && 'Edit Subtopic'}
                {modalMode === 'reglue' && 'Reglue Subtopic'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {modalMode === 'reglue' ? (
                <div>
                  <p className="text-xs text-gray-300 mb-3">
                    Select a new parent topic for <strong className="text-white">{activeTarget?.name}</strong>:
                  </p>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Target Parent Topic</label>
                  <select
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full rounded bg-black border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-[#3A9E3F]"
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Title / Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Enter topic name..."
                      className="w-full rounded bg-black border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-[#3A9E3F]"
                    />
                  </div>

                  {(modalMode === 'create-topic' || modalMode === 'edit-topic') && (
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Description</label>
                      <textarea
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.target.value)}
                        placeholder="Topic overview..."
                        className="w-full h-20 rounded bg-black border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-[#3A9E3F] resize-none"
                      />
                    </div>
                  )}

                  {modalMode === 'edit-sub' && (
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Parent Topic</label>
                      <select
                        value={formParentId}
                        onChange={(e) => setFormParentId(e.target.value)}
                        className="w-full rounded bg-black border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-[#3A9E3F]"
                      >
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name || t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(modalMode === 'create-sub' || modalMode === 'edit-sub') && (
                    <>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Video URL (Optional)</label>
                        <input
                          type="text"
                          value={formVideoUrl}
                          onChange={(e) => setFormVideoUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded bg-black border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-[#3A9E3F]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Article URL (Optional)</label>
                        <input
                          type="text"
                          value={formArticleUrl}
                          onChange={(e) => setFormArticleUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full rounded bg-black border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-[#3A9E3F]"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold uppercase text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveModal}
                  className="px-5 py-2 bg-[#3A9E3F] hover:bg-[#328b36] text-black text-xs font-black uppercase rounded shadow-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}