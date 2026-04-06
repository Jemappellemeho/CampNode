// This modal renders the cleaned topic content (PDF, scraped article, or Wikidata summary) 
// in a focused reading view.

import { X, Info } from 'lucide-react';

interface ModalProps {
  activeContent: { title: string; content: string } | null;
  onClose: () => void;
}

export default function TopicAbstractModal({ activeContent, onClose }: ModalProps) {
  if (!activeContent) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-4 sm:p-6 animate-in zoom-in-95 border"
           style={{ background: "var(--cn-card)", borderColor: "var(--cn-border)" }}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black flex items-center gap-3" style={{ color: "var(--cn-text)" }}>
            <Info className="text-blue-500"/> {activeContent.title || 'Topic Info'}
          </h2>
          <button onClick={onClose} style={{ color: "var(--cn-text)" }}><X/></button>
        </div>
        <div
          className="mx-auto max-w-3xl rounded-2xl border bg-[#fcfbf7] dark:bg-gray-950/40 px-5 sm:px-8 py-6 sm:py-8 text-sm text-gray-800 dark:text-gray-200 leading-8 max-h-[72vh] overflow-y-auto pr-2 custom-scrollbar wikipedia-article-content"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}
          dangerouslySetInnerHTML={{ __html: activeContent.content }}
        />
      </div>
    </div>
  );
}