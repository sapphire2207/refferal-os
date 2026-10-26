'use client';

import React from 'react';
import { Assignee } from '@/lib/kanban-types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface CollaboratorAvatarsProps {
  assignees: Assignee[];
  size?: 'sm' | 'md';
}

export function CollaboratorAvatars({
  assignees,
  size = 'sm',
}: CollaboratorAvatarsProps) {
  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';

  return (
    <div className="flex items-center -space-x-1.5">
      {assignees.map((assignee) => (
        <Avatar
          key={assignee.id}
          className={`${sizeClasses} ring-2 ring-white dark:ring-zinc-900 transition-transform hover:scale-105 hover:z-10`}
          title={assignee.name}
        >
          <AvatarImage src={assignee.avatar} alt={assignee.name} />
          <AvatarFallback className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold">
            {assignee.initials}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}
