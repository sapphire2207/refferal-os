'use client';

import React from 'react';
import { Column, Task } from '@/lib/kanban-types';
import { KanbanColumn } from './kanban-column';

interface KanbanBoardProps {
  columns: Column[];
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onEditTask: (task: Task) => void;
  onTaskDrop: (taskId: string, targetColumnId: string) => void;
  onColumnReorder: (draggedColId: string, targetColId: string) => void;
}

export function KanbanBoard({
  columns,
  tasks,
  onAddTask,
  onEditTask,
  onTaskDrop,
  onColumnReorder,
}: KanbanBoardProps) {
  // Sort columns by order
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  return (
    <div className="w-full overflow-x-auto pb-8 pt-1">
      {/* Container: Left-aligned with 18px gap, matching screenshot */}
      <div className="flex items-start gap-[18px] min-w-max">
        {sortedColumns.map((col) => {
          const colTasks = tasks
            .filter((t) => t.status === col.id)
            .sort((a, b) => a.order - b.order);

          return (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={colTasks}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
              onTaskDrop={onTaskDrop}
              onColumnDrop={onColumnReorder}
            />
          );
        })}
      </div>
    </div>
  );
}
