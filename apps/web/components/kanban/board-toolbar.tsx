'use client';

import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ViewMode, FilterState, Assignee } from '@/lib/kanban-types';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BoardToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  assignees: Assignee[];
}

export function BoardToolbar({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  filters,
  onFilterChange,
  assignees,
}: BoardToolbarProps) {
  const hasActiveFilters =
    filters.priority !== 'all' ||
    filters.status !== 'all' ||
    filters.assigneeId !== 'all';

  const resetFilters = () => {
    onFilterChange({
      priority: 'all',
      status: 'all',
      assigneeId: 'all',
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
      {/* Left: Segmented Control for Views (Board, List, Table) */}
      <div className="inline-flex items-center p-1 bg-zinc-100/90 dark:bg-zinc-800/80 rounded-lg self-start">
        <button
          type="button"
          onClick={() => onViewModeChange('board')}
          className={`px-3.5 py-1.5 text-[13.5px] font-medium rounded-md transition-all ${
            viewMode === 'board'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          Board
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('list')}
          className={`px-3.5 py-1.5 text-[13.5px] font-medium rounded-md transition-all ${
            viewMode === 'list'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('table')}
          className={`px-3.5 py-1.5 text-[13.5px] font-medium rounded-md transition-all ${
            viewMode === 'table'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          Table
        </button>
      </div>

      {/* Right: Search Input & Filters Button */}
      <div className="flex items-center gap-2.5">
        {/* Search input with exact dimensions */}
        <div className="relative w-full sm:w-[217px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks..."
            className="h-9 pl-9 pr-7 rounded-lg border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[13.5px] placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-400 shadow-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters Popover Button */}
        <Popover>
          <PopoverTrigger className="h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[13.5px] font-medium text-zinc-700 dark:text-zinc-200 shadow-none flex items-center gap-2 cursor-pointer outline-none">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-black dark:bg-white" />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Filter Tasks
              </h4>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Filter by Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Priority
              </label>
              <Select
                value={filters.priority}
                onValueChange={(val) => {
                  if (val) onFilterChange({ ...filters, priority: val as FilterState['priority'] });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Status
              </label>
              <Select
                value={filters.status}
                onValueChange={(val) => {
                  if (val) onFilterChange({ ...filters, status: val as FilterState['status'] });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Assignee */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Assignee
              </label>
              <Select
                value={filters.assigneeId}
                onValueChange={(val) => {
                  if (val) onFilterChange({ ...filters, assigneeId: val as FilterState['assigneeId'] });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
