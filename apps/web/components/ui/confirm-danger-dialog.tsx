'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfirmDangerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  requiresInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  initialInputValue?: string;
  isLoading?: boolean;
  onConfirm: (inputValue?: string) => void | Promise<void>;
}

export function ConfirmDangerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm Action',
  cancelText = 'Cancel',
  variant = 'danger',
  requiresInput = false,
  inputLabel,
  inputPlaceholder,
  initialInputValue = '',
  isLoading = false,
  onConfirm,
}: ConfirmDangerDialogProps) {
  const [inputValue, setInputValue] = useState(initialInputValue);

  useEffect(() => {
    if (open) {
      setInputValue(initialInputValue);
    }
  }, [open, initialInputValue]);

  const handleConfirm = async () => {
    if (requiresInput && !inputValue.trim()) {
      return;
    }
    await onConfirm(inputValue.trim());
  };

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 gap-4 rounded-xl border border-border shadow-xl bg-card">
        <DialogHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                isDanger
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : isWarning
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {isDanger ? (
                <AlertTriangle className="h-5 w-5" />
              ) : isWarning ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {title}
              </DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {description}
          </DialogDescription>
        </DialogHeader>

        {requiresInput && (
          <div className="space-y-1.5 pt-1">
            {inputLabel && (
              <Label className="text-xs font-semibold text-foreground">
                {inputLabel}
              </Label>
            )}
            <Input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              disabled={isLoading}
              className="h-8 text-xs bg-background border-border/80"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputValue.trim()) {
                  handleConfirm();
                }
              }}
            />
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="h-8 text-xs font-medium border-border"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading || (requiresInput && !inputValue.trim())}
            className={cn(
              'h-8 text-xs font-semibold gap-1.5 shadow-xs',
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : isWarning
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

