import type { ReactNode } from 'react';
import { cleanTitle } from '../utils/cleanTitle';

interface RetroNodeProps {
  px: number;
  py: number;
  size: number;
  variant: 'main' | 'sub' | 'ai';
  label: string;
  title: string;
  lit: boolean;
  isActive?: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  children?: ReactNode;
}

export default function RetroNode({ px, py, size, variant, label, title, lit, isActive = false, isHighlighted = false, onClick, children }: RetroNodeProps) {
  const tooltipColor =
    variant === 'main'
      ? 'shadow-md border-[#3A9E3F] text-[#3A9E3F] shadow-[0_0_10px_#3A9E3F]'
      : variant === 'sub'
      ? 'shadow-md border-[#3B82F6] text-[#3B82F6] shadow-[0_0_10px_#3B82F6]'
      : 'border-[#EF4444] text-[#EF4444] shadow-[0_0_10px_#EF4444]';
  const tooltipPos = variant === 'ai' ? 'bottom-full mb-3' : 'top-full mt-3';
  const labelSize = variant === 'ai' ? 'text-xs sm:text-sm' : 'text-base sm:text-lg';

  return (
    <div
      className="absolute flex items-center justify-center transition-all duration-300 z-20 hover:z-50"
      style={{ left: px - size / 2, top: py - size / 2, width: size, height: size }}
    >
      <div className="relative group w-full h-full">
        <button
          onClick={onClick}
          className={`w-full h-full flex items-center justify-center rounded-[1.75rem] retro-node transition-transform duration-200 hover:scale-110
            ${lit ? `retro-node-${variant}` : `retro-node-${variant}-dim`}
            ${isActive ? 'scale-125 !bg-[#3A9E3F] !text-white' : ''}
            ${isHighlighted ? 'scale-110 ring-2 ring-white ring-offset-1' : ''}
          `}
                >
                    <span className={`font-bold ${labelSize}`}>{label}</span>
                </button>

                {/* Hover Tooltip for Title */}
                <div
                    className={`absolute ${tooltipPos} left-1/2 -translate-x-1/2 w-max max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity border text-xs sm:text-sm font-bold text-center p-2 rounded-sm pointer-events-none z-50 ${tooltipColor}`}
                    style={{ background: 'var(--cn-page)' }}
                >
                    {variant === 'ai' ? `[AI SYNC] ${cleanTitle(title)}` : cleanTitle(title)}
                </div>

                {children}
            </div>
        </div>
    );
}