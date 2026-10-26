'use client';

import React from 'react';
import { Calendar, Paperclip, MessageSquare } from 'lucide-react';
import { Task } from '@/lib/kanban-types';
import { CollaboratorAvatars } from './collaborator-avatars';
import { ProgressRing } from './progress-ring';

interface KanbanCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
}

export function KanbanCard({ task, onEdit, onDragStart }: KanbanCardProps) {
  const getPriorityDot = (priority: Task['priority']) => {
    switch (priority) {
      case 'High':
        return 'bg-rose-500';
      case 'Medium':
        return 'bg-amber-500';
      case 'Low':
      default:
        return 'bg-blue-500';
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e, task);
    }
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onEdit(task)}
      className="group relative bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-[17px] p-[18px] cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all select-none"
    >
      {/* Title */}
      <h3 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug line-clamp-1 group-hover:text-black dark:group-hover:text-white transition-colors">
        {task.title}
      </h3>

      {/* Description */}
      <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">
        {task.description}
      </p>

      {/* Middle Row: Assignees & Progress Ring */}
      <div className="flex items-center justify-between mt-3.5">
        <CollaboratorAvatars assignees={task.assignees} size="sm" />
        <ProgressRing progress={task.progress} />
      </div>

      {/* Subtle Separator Line */}
      <div className="h-[1px] bg-zinc-100 dark:bg-zinc-800/80 my-3.5" />

      {/* Bottom Metadata Row */}
      <div className="flex items-center justify-between text-xs pt-0.5">
        {/* Left: Priority Badge & Due Date */}
        <div className="flex items-center gap-2">
          {/* Priority Pill Badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11.5px] font-medium text-zinc-700 dark:text-zinc-300 shadow-2xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${getPriorityDot(
                task.priority
              )}`}
            />
            <span>{task.priority}</span>
          </span>

          {/* Due Date */}
          {task.dueDate && (
            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-[12px] font-normal">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span>{task.dueDate}</span>
            </div>
          )}
        </div>

        {/* Right: Attachments & Comments */}
        <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400">
          {/* Attachments */}
          <div className="flex items-center gap-1 text-[12px]">
            <Paperclip className="w-3.5 h-3.5 text-zinc-400 -rotate-45" />
            <span className="tabular-nums font-normal text-zinc-600 dark:text-zinc-400">
              {task.attachmentsCount}
            </span>
          </div>

          {/* Comments */}
          <div className="flex items-center gap-1 text-[12px]">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
            <span className="tabular-nums font-normal text-zinc-600 dark:text-zinc-400">
              {task.commentsCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
