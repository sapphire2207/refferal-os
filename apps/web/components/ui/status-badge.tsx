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
  const isPending = status === WorkStatus.PENDING || status === 'PENDING';

  const containerStyle = isDone
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : isNeedsInfo
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    : 'border-border/80 bg-muted/40 text-muted-foreground';

  const dotColor = isDone
    ? 'bg-emerald-500'
    : isNeedsInfo
    ? 'bg-amber-500'
    : 'bg-neutral-400';

  const label =
    status === WorkStatus.BLOCKED_NEEDS_INFO
      ? 'Needs Info'
      : status.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
        containerStyle,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColor)} />
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
      <Badge
        variant="destructive"
        className={cn(
          'text-[9px] px-1.5 py-0 font-bold uppercase tracking-wider shadow-2xs',
          className,
        )}
      >
        STAT
      </Badge>
    );
  }

  if (priority === Priority.URGENT || priority === 'URGENT') {
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-[9px] px-1.5 py-0 font-semibold uppercase tracking-wider border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
          className,
        )}
      >
        URGENT
      </Badge>
    );
  }

  return (
    <span className={cn('text-muted-foreground text-xs font-mono', className)}>
      Routine
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

  const style =
    normalized === PipelineStage.INTAKE || normalized === 'INTAKE'
      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
      : normalized === PipelineStage.CLINICAL_REVIEW || normalized === 'CLINICAL_REVIEW'
      ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300'
      : normalized === PipelineStage.SCHEDULING || normalized === 'SCHEDULING'
      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
      : normalized === PipelineStage.NP_VISIT || normalized === 'NP_VISIT'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
      : normalized === PipelineStage.NOTES_QA || normalized === 'NOTES_QA'
      ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300'
      : 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300';

  const label = normalized.replace(/_/g, ' ');

  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-medium transition-colors', style, className)}
    >
      {label}
    </Badge>
  );
}
