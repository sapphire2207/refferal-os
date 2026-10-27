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
        "flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white/50 p-8 text-center animate-in fade-in-50",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 mb-3.5 ring-4 ring-zinc-50">
        <Icon className="h-6 w-6 stroke-[1.75]" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-zinc-500 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          variant="outline"
          size="sm"
          className="mt-4 h-8 text-xs font-medium border-zinc-200 shadow-none hover:bg-zinc-50"
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
        "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-zinc-100 bg-white p-8 text-center",
        className
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      <p className="text-xs font-medium text-zinc-500 tracking-tight">{message}</p>
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
        "flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-red-200/80 bg-red-50/30 p-8 text-center",
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
        <AlertCircle className="h-5 w-5 stroke-[2]" />
      </div>
      <h3 className="text-sm font-semibold text-red-950">{title}</h3>
      {message && (
        <p className="mt-1 max-w-md text-xs text-red-700/80 leading-relaxed">
          {message}
        </p>
      )}
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="mt-4 h-8 text-xs border-red-200 text-red-800 hover:bg-red-100/50"
        >
          Try Again
        </Button>
      )}
    </div>
  )
}
