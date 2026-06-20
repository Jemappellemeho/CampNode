import { Clock, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface Resource {
  type: 'video' | 'article' | 'podcast' | 'quiz';
  title: string;
  url?: string;
  duration?: string;
  estimatedTime?: string;
}

interface NodeDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
  nodeColor: string;
  resources: Resource[];
  completed?: boolean;
  quizCompleted?: boolean;
  onOpenResource: (resource: Resource, options?: { markAsSkip?: boolean }) => void | Promise<void>;
}

// ============================================================================
// MAIN PANEL COMPONENT
// ============================================================================
// This sliding panel opens up when the user clicks on a big node in the Retro map.
// It lists out all the videos, articles, and quizzes for that specific topic.
function NodeDetailPanel({
  isOpen,
  onClose,
  nodeName,
  nodeColor,
  resources,
  completed = false,
  quizCompleted = false,
  onOpenResource,
}: NodeDetailPanelProps) {
  // If the panel is meant to be closed, don't draw anything to save memory
  if (!isOpen) return null;
  
  // Find the quiz in the resource list, because we put a special "Take Quiz to Skip" button at the bottom
  const quizResource = resources.find((resource) => resource.type === 'quiz');

  // Returns a fun emoji depending on what type of file/link this is
  const getIcon = (type: string) => {
    switch(type) {
      case 'video': return '📹';
      case 'article': return '📄';
      case 'podcast': return '🎧';
      case 'quiz': return '❓';
      default: return '📚';
    }
  };

  // Gives each resource button a nice distinct background color
  const getBgColor = (type: string) => {
    switch(type) {
      case 'video': return 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50';
      case 'article': return 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50';
      case 'podcast': return 'bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50';
      case 'quiz': return 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50';
      default: return 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600';
    }
  };

  // ============================================================================
  // RESOURCE ITEM SUB-COMPONENT
  // ============================================================================
  // Draws one individual button for a video, article, etc.
  const ResourceItem = ({ resource }: { resource: Resource }) => {
    // If it's a website link, we try to grab the actual `<title>` of the website 
    // to make it look prettier than just a raw URL string.
    const [metadata, setMetadata] = useState<{ title?: string; website?: string } | null>(null);

    useEffect(() => {
      let isMounted = true;
      
      // If it's an external link
      if (resource.url && resource.url !== '#' && !resource.url.includes('/uploads/')) {
        api.get(`/metadata?url=${encodeURIComponent(resource.url)}`)
          .then(res => {
            if (isMounted && res.data) setMetadata(res.data);
          })
          .catch(() => {});
          
      // If it's a file the professor uploaded directly
      } else if (resource.url && resource.url.includes('/uploads/')) {
        const filename = resource.url.split('/').pop()?.split('?')[0] || '';
        // Clean up the weird timestamp numbers that got added to the filename
        const cleanName = decodeURIComponent(filename).replace(/^\d+-/, '').replace(/_/g, ' ');
        if (isMounted) setMetadata({ title: cleanName, website: 'Local File' });
      }
      return () => { isMounted = false; };
    }, [resource.url]);

    // Decide what text to show on the button
    const displayTitle = metadata?.title || resource.title;
    let displayDuration = resource.duration;
    if (metadata?.website) {
      displayDuration = `${metadata.website} • ${resource.duration}`;
    }
    const estimatedTime = resource.estimatedTime;

    return (
      <button
        className={`w-full p-4 rounded-xl ${getBgColor(resource.type)} transition-all text-left flex items-center gap-4 group`}
        onClick={() => onOpenResource(resource)}
      >
        {/* Left Side: Emoji Icon */}
        <span className="text-3xl">{getIcon(resource.type)}</span>
        
        {/* Middle: Title and Duration */}
        <div className="flex-1 overflow-hidden">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white truncate">
            {displayTitle}
          </h3>
          {displayDuration && (
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {displayDuration}
            </p>
          )}
        </div>
        
        {/* Right Side: Arrow and Time Estimate Badge */}
        <span className="flex flex-shrink-0 flex-col items-center gap-1 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
          <span className="text-2xl leading-none">→</span>
          {estimatedTime && (
            <span className="min-w-[3.5rem] rounded-full bg-white/65 px-2 py-0.5 text-center text-xs font-bold leading-5 text-gray-600 shadow-sm dark:bg-gray-900/35 dark:text-gray-300 inline-flex items-center justify-center gap-1">
              <Clock size={12} />
              {estimatedTime}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* -------------------------------------------------------------------------
          BACKDROP (The dark blurry background when the panel is open)
      ------------------------------------------------------------------------- */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* -------------------------------------------------------------------------
          THE SLIDING PANEL ITSELF
      ------------------------------------------------------------------------- */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 transform transition-transform overflow-y-auto no-scrollbar">
        
        {/* PANEL HEADER (Colored to match the node they clicked on) */}
        <div className={`p-6 ${nodeColor === 'green' ? 'bg-green-500' : nodeColor === 'blue' ? 'bg-blue-500' : 'bg-gray-400'}`}>
          <div className="flex items-start justify-between">
            <h2 className="text-2xl font-bold text-white pr-8">
              {nodeName}
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          {/* F5: only invite a modality choice when there is actually more than one resource type. */}
          {resources.length > 1 && (
            <p className="text-white/90 text-sm mt-2">
              Choose how you want to learn
            </p>
          )}
        </div>

        {/* LIST OF RESOURCES (Using our ResourceItem sub-component) */}
        <div className="p-6 space-y-3">
          {resources.map((resource, idx) => (
            <ResourceItem key={idx} resource={resource} />
          ))}
        </div>

        {/* -------------------------------------------------------------------------
            QUICK QUIZ / SKIP OPTION
        ------------------------------------------------------------------------- */}
        <div className="p-6 pt-0">
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Already know this?
            </p>
            {/* The big blue "Skip" button */}
            <button
              onClick={() => {
                // Clicking this tells the app that they want to take the quiz directly to skip
                if (quizResource) onOpenResource(quizResource, { markAsSkip: true });
              }}
              disabled={!quizResource}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-all"
            >
              <span className="flex items-center justify-center gap-3">
                <span>Take Quiz to Skip</span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-xl leading-none">→</span>
                  {quizResource?.estimatedTime && (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold leading-5 inline-flex items-center justify-center gap-1">
                      <Clock size={12} />
                      {quizResource.estimatedTime}
                    </span>
                  )}
                </span>
              </span>
            </button>

            {/* Tiny text at the bottom telling them their exact progress on this node */}
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${completed ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              <span className="text-gray-600 dark:text-gray-300">Resource step: {completed ? 'done' : 'pending'}</span>
            </div>
            {resources.some((res) => res.type === 'quiz') && (
              <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${quizCompleted ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <span className="text-gray-600 dark:text-gray-300">Quiz step: {quizCompleted ? 'done' : 'pending'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default NodeDetailPanel;
