import React from 'react';
import { Badge } from '@/components/ui/badge';
import { WorkStatus, Priority, PipelineStage } from '@heals/types';
import { cn } from 'cn';

// ---------------------------------------------------------------------------
// 1. WORK STATUS BADGE (Matching SaaS Benchmark with Status Dot)
// ---------------------------------------------------------------------------
interface WorkStatusBadgeProps {
  status: WorkStatus | string;
  className?: string;
}

export function WorkStatusBadge({ status, className }: WorkStatusBadgeProps) {
  const isDone = status === WorkStatus.IN_PROGRESS;
  const isNeedsInfo = status === WorkStatus.BLOCKED_NEEDS_INFO;
  const isCompleted = status === 'COMPLETED' || status === 'ARCHIVED';

  const containerStyle = isDone
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : isNeedsInfo
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    : isCompleted
    ? 'border-primary/30 bg-primary/10 text-primary dark:text-primary-foreground'
    : 'border-border/80 bg-muted/40 text-muted-foreground';

  const dotColor = isDone
    ? 'bg-emerald-500 animate-pulse-subtle'
    : isNeedsInfo
    ? 'bg-amber-500'
    : isCompleted
    ? 'bg-primary'
    : 'bg-neutral-400';

  const label =
    status === WorkStatus.BLOCKED_NEEDS_INFO
      ? 'Needs Info'
      : status.replace(/_/g, ' ');

  return (
    <span
      role="status"
      aria-label={`Work status: ${label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors select-none shadow-2xs',
        containerStyle,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColor)} aria-hidden="true" />
      <span className="capitalize">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 2. PRIORITY BADGE (Clinical Urgency Hierarchy)
// ---------------------------------------------------------------------------
interface PriorityBadgeProps {
  priority: Priority | string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (priority === Priority.STAT || priority === 'STAT') {
    return (
      <span
        role="status"
        aria-label="Priority: STAT"
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-rose-600 text-white shadow-xs border border-rose-700 animate-pulse-subtle',
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" aria-hidden="true" />
        <span>STAT</span>
      </span>
    );
  }

  if (priority === Priority.URGENT || priority === 'URGENT') {
    return (
      <span
        role="status"
        aria-label="Priority: Urgent"
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400 shadow-2xs',
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
        <span>URGENT</span>
      </span>
    );
  }

  return (
    <span 
      role="status"
      aria-label="Priority: Routine"
      className={cn('text-muted-foreground text-xs font-mono inline-flex items-center gap-1', className)}
    >
      <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden="true" />
      <span>Routine</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3. PIPELINE STAGE BADGE (6-Gate Authoritative Workflow Engine)
// ---------------------------------------------------------------------------
interface PipelineStageBadgeProps {
  stage: PipelineStage | string;
  className?: string;
}

export function PipelineStageBadge({ stage, className }: PipelineStageBadgeProps) {
  const normalized = (stage || '').toUpperCase();

  const config =
    normalized === PipelineStage.INTAKE || normalized === 'INTAKE'
      ? { style: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300 dark:bg-blue-950/40', dot: 'bg-blue-500' }
      : normalized === PipelineStage.CLINICAL_REVIEW || normalized === 'CLINICAL_REVIEW'
      ? { style: 'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300 dark:bg-purple-950/40', dot: 'bg-purple-500' }
      : normalized === PipelineStage.SCHEDULING || normalized === 'SCHEDULING'
      ? { style: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300 dark:bg-amber-950/40', dot: 'bg-amber-500' }
      : normalized === PipelineStage.NP_VISIT || normalized === 'NP_VISIT'
      ? { style: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300 dark:bg-emerald-950/40', dot: 'bg-emerald-500' }
      : normalized === PipelineStage.NOTES_QA || normalized === 'NOTES_QA'
      ? { style: 'bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300 dark:bg-teal-950/40', dot: 'bg-teal-500' }
      : { style: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300 dark:bg-indigo-950/40', dot: 'bg-indigo-500' };

  const label = normalized.replace(/_/g, ' ');

  return (
    <span
      role="status"
      aria-label={`Pipeline gate: ${label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border shadow-2xs transition-colors',
        config.style,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dot)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
