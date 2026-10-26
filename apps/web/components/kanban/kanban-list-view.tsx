'use client';

import React from 'react';
import { Calendar, Paperclip, MessageSquare } from 'lucide-react';
import { Column, Task } from '@/lib/kanban-types';
import { CollaboratorAvatars } from './collaborator-avatars';
import { ProgressRing } from './progress-ring';

interface KanbanListViewProps {
  columns: Column[];
  tasks: Task[];
  onEditTask: (task: Task) => void;
}

export function KanbanListView({
  columns,
  tasks,
  onEditTask,
}: KanbanListViewProps) {
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

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div className="w-full space-y-6 pt-2 pb-12 max-w-5xl">
      {sortedColumns.map((col) => {
        const colTasks = tasks
          .filter((t) => t.status === col.id)
          .sort((a, b) => a.order - b.order);

        return (
          <div key={col.id} className="space-y-2">
            {/* Column Group Header */}
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {col.title}
              </h3>
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-medium flex items-center justify-center">
                {colTasks.length}
              </span>
            </div>

            {/* List items */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200/80 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-2xs">
              {colTasks.length === 0 ? (
                <div className="p-4 text-xs text-zinc-400 text-center">
                  No tasks in this group
                </div>
              ) : (
                colTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onEditTask(task)}
                    className="p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${getPriorityDot(
                            task.priority
                          )}`}
                        />
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {task.title}
                        </h4>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 pl-4">
                        {task.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 pl-4 sm:pl-0 flex-shrink-0">
                      <CollaboratorAvatars
                        assignees={task.assignees}
                        size="sm"
                      />

                      {task.dueDate && (
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{task.dueDate}</span>
                        </div>
                      )}

                      <ProgressRing progress={task.progress} />

                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span className="flex items-center gap-0.5">
                          <Paperclip className="w-3 h-3" />
                          {task.attachmentsCount}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="w-3 h-3" />
                          {task.commentsCount}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
