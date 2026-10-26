'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface DashboardHeaderProps {
  onAddTask: () => void;
}

export function DashboardHeader({ onAddTask }: DashboardHeaderProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invited, setInvited] = useState(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail) {
      setInvited(true);
      setTimeout(() => {
        setInviteOpen(false);
        setInvited(false);
        setInviteEmail('');
      }, 1200);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
      {/* Title */}
      <h1 className="text-[26px] sm:text-[28px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight leading-none">
        Kanban Board
      </h1>

      {/* Collaborators & Add Task Button */}
      <div className="flex items-center gap-3">
        {/* Collaborators cluster */}
        <div className="flex items-center">
          {/* Overlapping avatars */}
          <div className="flex items-center -space-x-2">
            <Avatar className="w-7 h-7 ring-2 ring-white dark:ring-zinc-950 shadow-xs">
              <AvatarImage src="/avatars/avatar1.svg" alt="Sarah Chen" />
              <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">SC</AvatarFallback>
            </Avatar>
            <Avatar className="w-7 h-7 ring-2 ring-white dark:ring-zinc-950 shadow-xs">
              <AvatarImage src="/avatars/avatar2.svg" alt="Alex Rivera" />
              <AvatarFallback className="text-[10px] bg-rose-100 text-rose-700">AR</AvatarFallback>
            </Avatar>
            <Avatar className="w-7 h-7 ring-2 ring-white dark:ring-zinc-950 shadow-xs">
              <AvatarImage src="/avatars/avatar3.svg" alt="Emily Zhang" />
              <AvatarFallback className="text-[10px] bg-emerald-100 text-emerald-700">EZ</AvatarFallback>
            </Avatar>
          </div>

          {/* +13 badge */}
          <div className="h-7 px-1.5 -ml-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-zinc-950">
            +13
          </div>

          {/* Plus icon button to invite */}
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            aria-label="Add collaborator"
            title="Invite collaborator"
            className="w-7 h-7 ml-1 rounded-full border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Primary + Add Button */}
        <Button
          onClick={onAddTask}
          className="bg-black hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 text-white font-medium text-sm h-9 px-3.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </Button>
      </div>

      {/* Invite Collaborator Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Collaborators</DialogTitle>
            <DialogDescription>
              Invite team members to collaborate on this Kanban board.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Email address
              </label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            {invited && (
              <p className="text-xs text-emerald-600 font-medium">
                Invitation sent successfully!
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!inviteEmail || invited}>
                {invited ? 'Sent' : 'Send Invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
