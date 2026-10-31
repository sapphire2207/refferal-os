import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  backHref?: string;
  backLabel?: string;
}

export function PageHeader({
  className,
  children,
  backHref,
  backLabel = 'Back',
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-border/80 pb-4 md:flex-row md:items-center md:justify-between min-w-0 max-w-full',
        className,
      )}
      {...props}
    >
      {backHref ? (
        <div className="flex flex-col gap-1 min-w-0">
          <div className="mb-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              nativeButton={false}
              render={<Link href={backHref} />}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>{backLabel}</span>
            </Button>
          </div>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function PageHeaderHeading({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        'text-xl font-bold tracking-tight text-foreground sm:text-2xl',
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

export function PageHeaderDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs text-muted-foreground mt-0.5 leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function PageHeaderActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 self-start md:self-center shrink-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
