'use client';

import React, { useState, useEffect } from 'react';
import {
  Assignee,
  Column,
  FilterState,
  Task,
  ViewMode,
} from '@/lib/kanban-types';
import {
  INITIAL_ASSIGNEES,
  INITIAL_COLUMNS,
  INITIAL_TASKS,
} from '@/lib/kanban-data';
import { exportBoardToJson, filterTasks } from '@/lib/kanban-utils';
import { TopNavbar } from './top-navbar';
import { DashboardHeader } from './dashboard-header';
import { BoardToolbar } from './board-toolbar';
import { KanbanBoard } from './kanban-board';
import { KanbanListView } from './kanban-list-view';
import { KanbanTableView } from './kanban-table-view';
import { TaskDialog } from './task-dialog';

const STORAGE_KEY_TASKS = 'shadcn_kanban_tasks_v1';
const STORAGE_KEY_COLUMNS = 'shadcn_kanban_columns_v1';

export function KanbanDashboard({ showTopNavbar = true }: { showTopNavbar?: boolean }) {
  const [columns, setColumns] = useState<Column[]>(INITIAL_COLUMNS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [assignees] = useState<Assignee[]>(INITIAL_ASSIGNEES);

  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    priority: 'all',
    status: 'all',
    assigneeId: 'all',
  });

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [createDefaultStatus, setCreateDefaultStatus] = useState('backlog');

  // Hydrate from localStorage safely on client
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      try {
        const savedTasks = localStorage.getItem(STORAGE_KEY_TASKS);
        const savedColumns = localStorage.getItem(STORAGE_KEY_COLUMNS);
        if (savedTasks) {
          const parsed = JSON.parse(savedTasks);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTasks(parsed);
          }
        }
        if (savedColumns) {
          const parsedCols = JSON.parse(savedColumns);
          if (Array.isArray(parsedCols) && parsedCols.length > 0) {
            setColumns(parsedCols);
          }
        }
      } catch (e) {
        console.error('Failed to parse saved state from localStorage:', e);
      }
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  // Save changes to localStorage
  const saveTasks = (newTasks: Task[]) => {
    setTasks(newTasks);
    try {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(newTasks));
    } catch (e) {
      console.error('Failed to save tasks to localStorage:', e);
    }
  };

  const saveColumns = (newColumns: Column[]) => {
    setColumns(newColumns);
    try {
      localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(newColumns));
    } catch (e) {
      console.error('Failed to save columns to localStorage:', e);
    }
  };

  // Open Create Task Dialog
  const handleOpenCreateTask = (statusId: string = 'backlog') => {
    setTaskToEdit(null);
    setCreateDefaultStatus(statusId);
    setIsTaskDialogOpen(true);
  };

  // Open Edit Task Dialog
  const handleOpenEditTask = (task: Task) => {
    setTaskToEdit(task);
    setIsTaskDialogOpen(true);
  };

  // Save (Create or Update) Task
  const handleSaveTask = (
    taskData: Omit<Task, 'id' | 'order'> & { id?: string }
  ) => {
    if (taskData.id) {
      // Update existing task
      const updated = tasks.map((t) =>
        t.id === taskData.id ? ({ ...t, ...taskData } as Task) : t
      );
      saveTasks(updated);
    } else {
      // Create new task
      const newTask: Task = {
        ...taskData,
        id: `task-${Date.now()}`,
        order: tasks.filter((t) => t.status === taskData.status).length,
      };
      saveTasks([...tasks, newTask]);
    }
  };

  // Delete Task
  const handleDeleteTask = (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    saveTasks(updated);
  };

  // Drag-and-drop: Task moved to a column
  const handleTaskDrop = (taskId: string, targetColumnId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.status === targetColumnId) return;

    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: targetColumnId,
          order: tasks.filter((item) => item.status === targetColumnId).length,
        };
      }
      return t;
    });

    saveTasks(updated);
  };

  // Drag-and-drop: Column reordered
  const handleColumnReorder = (draggedColId: string, targetColId: string) => {
    if (draggedColId === targetColId) return;

    const sourceCol = columns.find((c) => c.id === draggedColId);
    const targetCol = columns.find((c) => c.id === targetColId);
    if (!sourceCol || !targetCol) return;

    const updatedCols = columns.map((col) => {
      if (col.id === draggedColId) return { ...col, order: targetCol.order };
      if (col.id === targetColId) return { ...col, order: sourceCol.order };
      return col;
    });

    saveColumns(updatedCols);
  };

  // Export board data to JSON
  const handleExport = () => {
    exportBoardToJson(tasks, columns);
  };

  // Filter tasks based on search query & filter criteria
  const visibleTasks = filterTasks(tasks, searchQuery, filters);

  return (
    <div className="min-h-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans">
      {/* 1. Top Navigation Bar */}
      {showTopNavbar && <TopNavbar onExport={handleExport} />}

      {/* 2. Main Dashboard Content */}
      <main className="flex-1 px-5 sm:px-6 pt-6 sm:pt-7 pb-10 flex flex-col">
        {/* Main Header: Title, Collaborators, + Add button */}
        <DashboardHeader onAddTask={() => handleOpenCreateTask('backlog')} />

        {/* View Switcher, Search Input, and Filters */}
        <div className="mt-5 mb-6">
          <BoardToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filters={filters}
            onFilterChange={setFilters}
            assignees={assignees}
          />
        </div>

        {/* Dynamic View: Board, List, or Table */}
        <div className="flex-1">
          {viewMode === 'board' && (
            <KanbanBoard
              columns={columns}
              tasks={visibleTasks}
              onAddTask={(colId) => handleOpenCreateTask(colId)}
              onEditTask={handleOpenEditTask}
              onTaskDrop={handleTaskDrop}
              onColumnReorder={handleColumnReorder}
            />
          )}

          {viewMode === 'list' && (
            <KanbanListView
              columns={columns}
              tasks={visibleTasks}
              onEditTask={handleOpenEditTask}
            />
          )}

          {viewMode === 'table' && (
            <KanbanTableView
              columns={columns}
              tasks={visibleTasks}
              onEditTask={handleOpenEditTask}
            />
          )}
        </div>
      </main>

      {/* Task Creation & Editing Dialog */}
      <TaskDialog
        key={
          isTaskDialogOpen
            ? taskToEdit
              ? taskToEdit.id
              : `create-${createDefaultStatus}`
            : 'closed'
        }
        isOpen={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        taskToEdit={taskToEdit}
        defaultStatus={createDefaultStatus}
        columns={columns}
        assignees={assignees}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />
    </div>
  );
}
