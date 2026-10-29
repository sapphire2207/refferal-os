'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { PipelineStage } from '@heals/types';

interface RollbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  referral: any | null;
  targetStage: PipelineStage | null;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export function RollbackDialog({
  isOpen,
  onClose,
  referral,
  targetStage,
  onConfirm,
  isLoading,
}: RollbackDialogProps) {
  const [reason, setReason] = useState('');

  if (!referral || !targetStage) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-xl p-6 border border-border shadow-xl bg-card">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <div className="p-2 rounded-lg bg-rose-500/10">
              <RotateCcw className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              Return Referral to {targetStage.replace('_', ' ')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            A mandatory clinical or operational reason is required to return{' '}
            <strong className="text-foreground">
              {referral.patient?.firstName} {referral.patient?.lastName}
            </strong>{' '}
            to an earlier workflow stage. This reason is recorded in the permanent audit trail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Reason for Return / Correction Required:
            </label>
            <Textarea
              required
              placeholder="e.g. Missing required clinical diagnosis codes, need updated face-to-face documentation, patient relocated..."
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              className="text-xs min-h-[90px] resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={!reason.trim() || isLoading}
              className="text-xs h-8 font-semibold gap-1.5"
            >
              <span>Confirm & Return</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
