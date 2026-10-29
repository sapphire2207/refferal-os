import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from 'cn';

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  icon?: React.ElementType;
  delta?: string;
  isPositive?: boolean;
  subtext?: string;
  accentColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';
  isLoading?: boolean;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  isPositive,
  subtext,
  accentColor = 'blue',
  isLoading = false,
  className,
  ...props
}: MetricCardProps) {
  const accentClasses = {
    blue: 'hover:border-primary/40 group-hover:text-primary',
    emerald: 'hover:border-emerald-500/40 group-hover:text-emerald-500',
    amber: 'hover:border-amber-500/40 group-hover:text-amber-500',
    rose: 'hover:border-rose-500/40 group-hover:text-rose-500',
    purple: 'hover:border-purple-500/40 group-hover:text-purple-500',
  }[accentColor];

  const iconBgClasses = {
    blue: 'bg-primary/10 text-primary border-primary/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  }[accentColor];

  return (
    <Card
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        accentClasses,
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {Icon && (
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105', iconBgClasses)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="mt-3.5 space-y-2">
          <div className="h-8 w-20 bg-muted/60 animate-pulse rounded-md" />
          <div className="h-3 w-36 bg-muted/40 animate-pulse rounded" />
        </div>
      ) : (
        <>
          <div className="mt-3.5 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">{value}</span>
            {delta && (
              <div
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border tabular-nums',
                  isPositive 
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
                )}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                <span>{delta}</span>
              </div>
            )}
          </div>

          {subtext && (
            <span className="mt-2 block text-[11px] text-muted-foreground/90 font-medium">{subtext}</span>
          )}
        </>
      )}
    </Card>
  );
}

export function MetricGrid({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
