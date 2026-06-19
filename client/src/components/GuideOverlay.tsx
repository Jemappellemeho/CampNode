import type { ReactNode } from 'react';

interface GuideStep {
  number: number;
  title: string;
  body: ReactNode;
  className: string;
}

interface GuideOverlayProps {
  steps: GuideStep[];
  arrows?: unknown;
  onClose: () => void;
}

export default function GuideOverlay({ steps, onClose }: GuideOverlayProps) {
  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="pointer-events-auto flex h-full flex-col gap-3 overflow-y-auto px-4 py-5 pb-24 sm:hidden">
        {steps.map((step) => (
          <div
            key={`mobile-${step.number}-${step.title}`}
            className="w-full rounded-2xl border border-blue-500 bg-white/95 p-4 text-gray-950 shadow-[0_0_24px_rgba(30,111,255,0.28)] backdrop-blur dark:bg-gray-900/95 dark:text-white"
          >
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-black text-white">
                {step.number}
              </span>
              <h3 className="text-base font-black text-blue-700 dark:text-blue-300">{step.title}</h3>
            </div>
            <div className="space-y-1 text-sm font-medium leading-6 text-gray-800 dark:text-gray-200">
              {step.body}
            </div>
          </div>
        ))}
      </div>

      {steps.map((step) => (
        <div
          key={`desktop-${step.number}-${step.title}`}
          className={`pointer-events-auto absolute hidden w-[22rem] rounded-2xl border border-blue-500 bg-white/95 p-5 text-gray-950 shadow-[0_0_24px_rgba(30,111,255,0.28)] backdrop-blur dark:bg-gray-900/95 dark:text-white sm:block ${step.className}`}
        >
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-black text-white">
              {step.number}
            </span>
            <h3 className="text-lg font-black text-blue-700 dark:text-blue-300">{step.title}</h3>
          </div>
          <div className="space-y-2 text-sm font-medium leading-6 text-gray-800 dark:text-gray-200">
            {step.body}
          </div>
        </div>
      ))}

      <button
        onClick={onClose}
        className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[0_8px_24px_rgba(30,111,255,0.35)] hover:bg-blue-700"
      >
        Got it
      </button>
    </div>
  );
}
