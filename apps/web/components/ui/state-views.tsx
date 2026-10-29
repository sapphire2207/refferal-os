import * as React from "react"
import { LucideIcon, Inbox, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionElement?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  actionElement,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 p-8 text-center animate-in fade-in-50",
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground mb-3 ring-1 ring-border/60">
        <Icon className="h-5 w-5 stroke-[1.75]" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          variant="outline"
          size="sm"
          className="mt-4 h-8 text-xs font-medium border-border hover:bg-accent"
        >
          {actionLabel}
        </Button>
      )}
      {actionElement && <div className="mt-4">{actionElement}</div>}
    </div>
  )
}

interface LoadingStateProps {
  message?: string
  className?: string
}

export function LoadingState({
  message = "Loading records...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-lg border border-border/60 bg-card/30 p-8 text-center",
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <p className="text-xs font-medium text-muted-foreground tracking-tight">{message}</p>
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = "Failed to load data",
  message = "An error occurred while fetching information from the server.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center",
        className
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive mb-3 ring-1 ring-destructive/20">
        <AlertCircle className="h-4 w-4 stroke-[2]" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {message && (
        <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
          {message}
        </p>
      )}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="mt-4 h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 font-medium"
        >
          Try Again
        </Button>
      )}
    </div>
  )
}
