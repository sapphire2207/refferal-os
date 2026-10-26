'use client';

import React from 'react';
import { Column, Task } from '@/lib/kanban-types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CollaboratorAvatars } from './collaborator-avatars';
import { ProgressRing } from './progress-ring';
import { Badge } from '@/components/ui/badge';

interface KanbanTableViewProps {
  columns: Column[];
  tasks: Task[];
  onEditTask: (task: Task) => void;
}

export function KanbanTableView({
  columns,
  tasks,
  onEditTask,
}: KanbanTableViewProps) {
  const getStatusTitle = (statusId: string) => {
    return columns.find((c) => c.id === statusId)?.title || statusId;
  };

  const getPriorityBadge = (priority: Task['priority']) => {
    switch (priority) {
      case 'High':
        return (
          <Badge
            variant="outline"
            className="text-xs font-normal border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
          >
            ● High
          </Badge>
        );
      case 'Medium':
        return (
          <Badge
            variant="outline"
            className="text-xs font-normal border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
          >
            ● Medium
          </Badge>
        );
      case 'Low':
      default:
        return (
          <Badge
            variant="outline"
            className="text-xs font-normal border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900"
          >
            ● Low
          </Badge>
        );
    }
  };

  return (
    <div className="w-full pt-2 pb-12 overflow-x-auto">
      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50/70 dark:bg-zinc-800/50 hover:bg-zinc-50/70">
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300 w-[300px]">
                Title
              </TableHead>
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300">
                Status
              </TableHead>
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300">
                Priority
              </TableHead>
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300">
                Assignees
              </TableHead>
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300">
                Due Date
              </TableHead>
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300">
                Progress
              </TableHead>
              <TableHead className="font-semibold text-xs text-zinc-600 dark:text-zinc-300 text-right">
                Details
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-28 text-center text-xs text-zinc-400"
                >
                  No tasks matching the current filters.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow
                  key={task.id}
                  onClick={() => onEditTask(task)}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <TableCell className="font-medium text-sm text-zinc-900 dark:text-zinc-100 py-3">
                    <div>
                      <div className="font-semibold line-clamp-1">{task.title}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 font-normal mt-0.5">
                        {task.description}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-700 dark:text-zinc-300 py-3">
                    <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 font-medium">
                      {getStatusTitle(task.status)}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    {getPriorityBadge(task.priority)}
                  </TableCell>
                  <TableCell className="py-3">
                    <CollaboratorAvatars
                      assignees={task.assignees}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-zinc-600 dark:text-zinc-400 py-3">
                    {task.dueDate || '—'}
                  </TableCell>
                  <TableCell className="py-3">
                    <ProgressRing progress={task.progress} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-zinc-400 py-3">
                    <span className="tabular-nums">
                      📎 {task.attachmentsCount} · 💬 {task.commentsCount}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
