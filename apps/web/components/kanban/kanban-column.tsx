'use client';

import React, { useState } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { Column, Task } from '@/lib/kanban-types';
import { KanbanCard } from './kanban-card';

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onEditTask: (task: Task) => void;
  onTaskDrop: (taskId: string, targetColumnId: string) => void;
  onColumnDragStart?: (e: React.DragEvent, columnId: string) => void;
  onColumnDrop?: (draggedColId: string, targetColId: string) => void;
}

export function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onEditTask,
  onTaskDrop,
  onColumnDragStart,
  onColumnDrop,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // Check if dragging a column
    const colId = e.dataTransfer.getData('text/column');
    if (colId && onColumnDrop) {
      onColumnDrop(colId, column.id);
      return;
    }

    // Otherwise dropping a task
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onTaskDrop(taskId, column.id);
    }
  };

  const handleHeaderDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/column', column.id);
    e.dataTransfer.effectAllowed = 'move';
    if (onColumnDragStart) {
      onColumnDragStart(e, column.id);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full sm:w-[398px] sm:min-w-[398px] sm:max-w-[398px] bg-[#f4f4f5]/90 dark:bg-zinc-900/60 rounded-[16px] p-[14px] flex flex-col transition-all border ${
        isDragOver
          ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-200/60 dark:bg-zinc-800/80 ring-2 ring-zinc-300 dark:ring-zinc-700'
          : 'border-transparent'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between h-8 mb-2 px-1 select-none">
        {/* Title and Count Badge */}
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {column.title}
          </h2>
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-medium flex items-center justify-center shadow-2xs tabular-nums">
            {tasks.length}
          </span>
        </div>

        {/* Drag handle and Add task button */}
        <div className="flex items-center gap-1">
          <div
            draggable
            onDragStart={handleHeaderDragStart}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reorder column"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <button
            type="button"
            onClick={() => onAddTask(column.id)}
            aria-label={`Add task to ${column.title}`}
            title="Add task"
            className="p-1 rounded-full border border-zinc-300/80 dark:border-zinc-700 hover:border-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-2 min-h-[140px] flex-1">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            onEdit={onEditTask}
          />
        ))}

        {tasks.length === 0 && (
          <div className="h-32 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl flex items-center justify-center text-xs text-zinc-400">
            No tasks in this column
          </div>
        )}
      </div>
    </div>
  );
}
