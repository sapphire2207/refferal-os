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
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  isPositive,
  subtext,
  className,
  ...props
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        'rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
        {delta && (
          <div
            className={cn(
              'flex items-center gap-1 text-[11px] font-semibold',
              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{delta}</span>
          </div>
        )}
      </div>

      {subtext && (
        <span className="mt-1 block text-[11px] text-muted-foreground">{subtext}</span>
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
