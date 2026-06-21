import { X, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { estimateLearningTime, formatLearningTime } from '../utils/learningTime';
import { api } from '../utils/api';

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
  highlightedNodeId?: string | null;
  onSelectTopic: (id: string) => void;
  onOpenNodeDetail?: (node: {
    id: string;
    name: string;
    color: string;
    resources: Resource[];
    completed: boolean;
    quizCompleted: boolean;
  }) => void;
  onOpenResource?: (nodeInfo: any, resource: Resource) => void;
  completedIds: string[];
  resourceOpenedIds: string[];
  quizCompletedIds: string[];
  overallProgress: number;
}

// ============================================================================
// RESOURCE VISUAL HELPERS
// ============================================================================
// These tiny functions just decide what text, icon, and color to show for a resource
// depending on whether it's a video, article, podcast, or quiz.

// Returns a human-friendly label for the resource type
const resourceLabel = (type: string) => {
  switch (type) {
    case 'video': return 'Video Resource';
    case 'article': return 'Reading Material';
    case 'podcast': return 'Audio Resource';
    case 'quiz': return 'Knowledge Check';
    default: return 'Resource';
  }
};

// Returns a fun emoji icon for the resource type
const resourceIcon = (type: string) => {
  switch (type) {
    case 'video': return '🎬';
    case 'article': return '📄';
    case 'podcast': return '🎧';
    case 'quiz': return '❓';
    default: return '📚';
  }
};

// Determines the background color for a resource card based on its type
// Videos are slightly red, articles are blue, podcasts are purple, and quizzes are green.
const resourceCardBg = (type: string) => {
  switch (type) {
    case 'video': return { background: '#FEE2E2' };
    case 'article': return { background: '#DBEAFE' };
    case 'podcast': return { background: '#EDE9FE' };
    case 'quiz': return { background: '#DCFCE7' };
    default: return { background: '#F3F4F6' };
  }
};

// ============================================================================
// RESOURCE ITEM COMPONENT
// ============================================================================
// This component draws a single resource card inside the syllabus list.
// It also does a clever trick: if the resource is an external website link, 
// it tries to fetch the actual website title and domain name to make the card look nicer.
function SyllabusResourceItem({
  resource,
  time,
  isHighlighted,
  onClick
}: {
  resource: Resource;
  time: string | null | undefined;
  isHighlighted: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  // Holds the pretty title and website domain if we can successfully fetch them
  const [metadata, setMetadata] = useState<{title: string, website: string} | null>(null);

  // When the card first appears, see if we can make its title prettier
  useEffect(() => {
    let isMounted = true; // Prevents errors if the user closes the drawer before the fetch finishes
    
    // If it's a real website link (not just a '#' placeholder)
    if (resource.url && resource.url !== '#' && resource.type !== 'quiz') {
      const fetchMeta = async () => {
        try {
          // Ask our backend server to quickly check the website and grab its `<title>` tag
          const res = await api.get(`/metadata?url=${encodeURIComponent(resource.url || '')}`);
          if (res.status === 200) {
            const data = res.data;
            if (isMounted && data.title) {
              // Extract just the domain name (e.g., 'wikipedia.org' instead of 'https://en.wikipedia.org/wiki/...')
              let domain = '';
              try { domain = new URL(resource.url || '').hostname.replace('www.', ''); } catch { }
              
              setMetadata({ title: data.title, website: domain || 'External Resource' });
            }
          }
        } catch (err) {
          console.error('Failed to fetch metadata', err);
        }
      };
      fetchMeta();
    } else if (resource.type === 'quiz') {
      // Quizzes are always internal, so just hardcode their label
      if (isMounted) setMetadata({ title: 'Course Quiz', website: 'Local Activity' });
    } else {
      // If it's an uploaded file, try to extract a clean name from the file path
      const cleanName = resource.url?.split('/').pop()?.split('.')[0] || 'Resource';
      if (isMounted) setMetadata({ title: cleanName, website: 'Local File' });
    }
    return () => { isMounted = false; };
  }, [resource.url, resource.type]);

  // Use the fetched metadata if we have it, otherwise fallback to the raw title
  const displayTitle = metadata?.title || resource.title;
  let displayDomain = metadata?.website ? `${metadata.website} • ` : '';

  return (
    <button
      className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:opacity-80"
      style={{
        ...resourceCardBg(resource.type),
        // Draw a thick green border around the card if the user is hovering over it on the main map
        outline: isHighlighted ? '2px solid #3A9E3F' : undefined,
      }}
      onClick={onClick}
    >
      {/* Icon */}
      <span className="text-xl shrink-0">{resourceIcon(resource.type)}</span>
      
      {/* Text Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-800 break-words whitespace-normal leading-snug">
          {displayTitle}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">{displayDomain}{resourceLabel(resource.type)}</p>
      </div>
      
      {/* Estimated Time Badge (e.g., "5m") */}
      {time && (
        <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-gray-500 bg-white/60 rounded-full px-1.5 py-0.5">
          <Clock size={9} /> {time}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// MAIN SYLLABUS DRAWER COMPONENT
// ============================================================================
// This is the slide-out panel on the right side of the Retro screen.
// It lists all the topics, subtopics, and resources in a neat, expanding list.
export default function SyllabusDrawer({
  isOpen,
  onClose,
  pathData,
  activeId,
  highlightedNodeId,
  onSelectTopic,
  onOpenResource,
  completedIds,
  resourceOpenedIds,
  quizCompletedIds,
  overallProgress,
}: SyllabusDrawerProps) {
  
  // Keeps track of which main topics the user has clicked on to expand and see their subtopics
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  
  // A dictionary of HTML references so we can force the scrollbar to jump to specific topics
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ============================================================================
  // AUTO-SCROLL LOGIC
  // ============================================================================
  // When a user hovers over a node on the main map diagram, we want the syllabus 
  // to automatically expand that topic and scroll down to it so they can see what it is.
  useEffect(() => {
    if (!highlightedNodeId || !isOpen) return;

    // Find which main topic contains the node the user is hovering over
    const parentTopic = pathData.find(
      (t) => t.id === highlightedNodeId || (t.subnodes || []).some((s) => s.id === highlightedNodeId)
    );
    if (!parentTopic) return;

    // Auto-expand the parent topic
    setExpandedIds((prev) =>
      prev.includes(parentTopic.id) ? prev : [...prev, parentTopic.id]
    );

    // Scroll to the specific node after a short delay (to let the expansion animation finish)
    setTimeout(() => {
      const el = nodeRefs.current[highlightedNodeId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [highlightedNodeId, isOpen]);

  // If the drawer is closed, don't render anything to save memory
  if (!isOpen) return null;

  // ============================================================================
  // PROGRESS HELPERS
  // ============================================================================
  
  // Quick checks to see if the user has opened a resource or finished a quiz
  const isResourceOpened = (id: string) =>
    resourceOpenedIds.includes(id) || completedIds.includes(id);
    
  const isQuizFinished = (id: string) =>
    quizCompletedIds.includes(id) || completedIds.includes(id);
    
  // Determines if an entire topic/subtopic is fully complete
  const isCoreComplete = (node: { id: string; hasQuiz: boolean }) => {
    if (!isResourceOpened(node.id)) return false;
    if (node.hasQuiz && !isQuizFinished(node.id)) return false;
    return true;
  };

  // Toggles the expansion state of a topic in the syllabus list
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // Formats the estimated time for a resource, using fallback logic if no exact time is provided
  // Example: If a video doesn't say "5 minutes", it might guess based on the default time.
  const formatTime = (resource: Resource, nodeId: string, index: number) => {
    if (resource.estimatedMinutes) return formatLearningTime(resource.estimatedMinutes);
    if (resource.estimatedTime) return resource.estimatedTime;
    if (resource.duration) return resource.duration;
    return estimateLearningTime(nodeId, resource.type, resource.title, index);
  };

  // ============================================================================
  // NUMBERING GENERATOR
  // ============================================================================
  // This builds a dictionary that gives every topic and subtopic a clean label.
  // Main Topics get "T1", "T2", "T3".
  // Professor Subtopics get "1.1", "1.2".
  // AI Subtopics get "AI.1", "AI.2".
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
    // We don't use a blurry background because this is meant to be used AT THE SAME TIME as the map.
    // It pushes the map over to the left instead of covering it.
    <div className="fixed right-0 top-0 h-full z-[100] flex flex-col"
      style={{
        width: '100%',
        maxWidth: '380px',
        background: 'var(--cn-card)',
        borderLeft: '1px solid var(--cn-border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
      }}
    >
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center px-5 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--cn-border)' }}>
        <h2 className="font-black text-lg uppercase tracking-widest font-mono"
          style={{ color: 'var(--cn-text)' }}>
          Course Syllabus
        </h2>
        {/* Close Button */}
        <button onClick={onClose}
          className="p-1.5 rounded hover:bg-black/10 transition-colors"
          style={{ color: 'var(--cn-text)' }}>
          <X size={20} />
        </button>
      </div>

      {/* OVERALL PROGRESS BAR */}
      <div className="px-5 py-3 shrink-0 border-b" style={{ borderColor: 'var(--cn-border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--cn-border)' }}>
            {/* The yellow bar filling up based on how much is completed */}
            <div className="h-full rounded-full transition-all" style={{ width: `${overallProgress}%`, background: '#F5C518' }} />
          </div>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--cn-text)' }}>{overallProgress}%</span>
        </div>
      </div>

      {/* THE MAIN SCROLLABLE LIST OF TOPICS */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
        {pathData.map((topic) => {
          const topicNumber = numberMap[topic.id];
          const isActiveTopic = activeId === topic.id;
          const isExpanded = expandedIds.includes(topic.id);

          // Calculate how much of THIS specific topic (and its subtopics) the user has finished
          const allNodes = [topic, ...(topic.subnodes || [])];
          const completedCount = allNodes.filter((n) =>
            isCoreComplete({ id: n.id, hasQuiz: (n as any).hasQuiz })
          ).length;
          const totalCount = allNodes.length;

          return (
            <div key={topic.id}
              ref={(el) => { nodeRefs.current[topic.id] = el; }} // Save reference for auto-scrolling
              className="rounded-xl overflow-hidden border transition-all"
              style={{
                // If this is the topic currently active on the map, outline it in green
                borderColor: isActiveTopic ? '#3A9E3F' : 'var(--cn-border)',
                boxShadow: isActiveTopic ? '0 0 0 1px #3A9E3F' : undefined,
              }}>

              {/* MAIN TOPIC BUTTON (Clicking expands/collapses) */}
              <button
                className="w-full flex items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/5"
                style={{ background: isActiveTopic ? 'rgba(58,158,63,0.07)' : 'var(--cn-bg)' }}
                onClick={() => {
                  onSelectTopic(topic.id); // Tell the map to focus on this topic
                  toggleExpand(topic.id);  // Open or close the sub-list
                }}
              >
                <span className="text-xs font-black font-mono w-7 shrink-0"
                  style={{ color: '#3A9E3F' }}>{topicNumber}</span>
                <span className="flex-1 text-xs font-bold uppercase tracking-wide leading-snug"
                  style={{ color: isActiveTopic ? '#3A9E3F' : 'var(--cn-text)' }}>
                  {topic.title}
                </span>
                {/* E.g. "2/5" completed */}
                <span className="text-[10px] font-mono shrink-0"
                  style={{ color: 'var(--cn-muted)' }}>
                  {completedCount}/{totalCount}
                </span>
                <span style={{ color: 'var(--cn-muted)' }}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {/* EXPANDED VIEW: Shows the resources and all subtopics inside this main topic */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: 'var(--cn-border)' }}>

                  {/* Main Topic Resources (Videos, Articles, etc. attached directly to the main topic) */}
                  {topic.resources && topic.resources.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest font-mono px-1"
                        style={{ color: '#3A9E3F' }}>
                        {topicNumber} · Main Topic
                      </p>
                      {topic.resources.map((res, idx) => {
                        const time = formatTime(res, topic.id, idx);
                        const isHighlighted = highlightedNodeId === topic.id;
                        return (
                          <SyllabusResourceItem
                            key={idx}
                            resource={res}
                            time={time}
                            isHighlighted={isHighlighted}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenResource) onOpenResource(topic, res);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* SUBTOPICS LIST */}
                  {(topic.subnodes || []).map((sub) => {
                    const subNumber = numberMap[sub.id];
                    const subComplete = isCoreComplete(sub);
                    const isHighlighted = highlightedNodeId === sub.id;
                    
                    // Determine colors. Red for AI, Blue for regular Professor content.
                    const subColor = sub.type === 'ai' ? '#E63027' : '#1E6FFF';

                    return (
                      <div key={sub.id}
                        ref={(el) => { nodeRefs.current[sub.id] = el; }} // Save reference for auto-scrolling
                        className="rounded-lg border overflow-hidden"
                        style={{
                          borderColor: isHighlighted ? subColor : 'var(--cn-border)',
                          boxShadow: isHighlighted ? `0 0 0 1px ${subColor}` : undefined,
                          background: isHighlighted ? `${subColor}10` : undefined,
                        }}>

                        {/* Subtopic Header */}
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <span className="text-[10px] font-black font-mono shrink-0"
                            style={{ color: subColor }}>{subNumber}</span>
                          <span className="flex-1 text-xs font-bold break-words whitespace-normal leading-snug"
                            style={{ color: subColor }}>
                            {sub.title}
                          </span>
                          
                          {/* Show a green checkmark if this subtopic is 100% finished */}
                          {subComplete && (
                            <span className="text-xs shrink-0" style={{ color: '#3A9E3F' }}>✔</span>
                          )}
                          
                          {/* Add a tiny "AI" badge if this is an AI-generated branch */}
                          {sub.type === 'ai' && (
                            <span className="text-[9px] font-black uppercase font-mono px-1.5 py-0.5 rounded"
                              style={{ background: '#E6302715', color: '#E63027' }}>AI</span>
                          )}
                        </div>

                        {/* Subtopic Resources (The actual things to read/watch) */}
                        {sub.resources && sub.resources.length > 0 && (
                          <div className="px-2 pb-2 space-y-1">
                            {sub.resources.map((res, idx) => {
                              const time = formatTime(res, sub.id, idx);
                              return (
                                <SyllabusResourceItem
                                  key={idx}
                                  resource={res}
                                  time={time}
                                  isHighlighted={false} // Only the wrapper gets highlighted
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenResource) onOpenResource(sub, res);
                                  }}
                                />
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

      {/* BOTTOM LEGEND (Explains what the colors mean) */}
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