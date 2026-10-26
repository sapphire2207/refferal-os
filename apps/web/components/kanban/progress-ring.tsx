'use client';

import React from 'react';

interface ProgressRingProps {
  progress: number;
}

export function ProgressRing({ progress }: ProgressRingProps) {
  const size = 15;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  const isCompleted = progress === 100;
  const isZero = progress === 0;
  const isHighProgress = progress >= 60;

  // Exact color matching from screenshot
  const strokeColor = isCompleted
    ? '#10b981' // emerald-500
    : isHighProgress
    ? '#f59e0b' // amber-500
    : isZero
    ? '#e4e4e7' // zinc-200
    : '#94a3b8'; // slate-400

  const textColorClass = isCompleted
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-zinc-600 dark:text-zinc-400';

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-zinc-200/90 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 shadow-[0_1px_1px_rgba(0,0,0,0.02)]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform"
      >
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-200 dark:text-zinc-700"
        />
        {/* Progress Arc */}
        {!isZero && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className={`text-[12px] font-medium leading-none tabular-nums ${textColorClass}`}>
        {progress}%
      </span>
    </div>
  );
}
