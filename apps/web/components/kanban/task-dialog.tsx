'use client';

import React, { useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { Assignee, Column, Priority, Task } from '@/lib/kanban-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TaskDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  taskToEdit?: Task | null;
  defaultStatus?: string;
  columns: Column[];
  assignees: Assignee[];
  onSave: (taskData: Omit<Task, 'id' | 'order'> & { id?: string }) => void;
  onDelete?: (taskId: string) => void;
}

export function TaskDialog({
  isOpen,
  onOpenChange,
  taskToEdit,
  defaultStatus = 'backlog',
  columns,
  assignees,
  onSave,
  onDelete,
}: TaskDialogProps) {
  const isEditing = !!taskToEdit;

  const [title, setTitle] = useState(() => (taskToEdit ? taskToEdit.title : ''));
  const [description, setDescription] = useState(() =>
    taskToEdit ? taskToEdit.description : ''
  );
  const [priority, setPriority] = useState<Priority>(() =>
    taskToEdit ? taskToEdit.priority : 'Medium'
  );
  const [status, setStatus] = useState<string>(() =>
    taskToEdit ? taskToEdit.status : defaultStatus
  );
  const [dueDate, setDueDate] = useState(() =>
    taskToEdit ? taskToEdit.dueDate || '' : 'Sep 20'
  );
  const [progress, setProgress] = useState(() =>
    taskToEdit ? taskToEdit.progress : 0
  );
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(() =>
    taskToEdit
      ? taskToEdit.assignees.map((a) => a.id)
      : assignees.slice(0, 2).map((a) => a.id)
  );
  const [attachmentsCount, setAttachmentsCount] = useState(() =>
    taskToEdit ? taskToEdit.attachmentsCount : 0
  );
  const [commentsCount, setCommentsCount] = useState(() =>
    taskToEdit ? taskToEdit.commentsCount : 0
  );

  const [errors, setErrors] = useState<{ title?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleAssignee = (id: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrors({ title: 'Task title is required' });
      return;
    }

    const selectedAssignees = assignees.filter((a) =>
      selectedAssigneeIds.includes(a.id)
    );

    onSave({
      id: taskToEdit?.id,
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      dueDate: dueDate.trim() || undefined,
      progress,
      attachmentsCount: Number(attachmentsCount) || 0,
      commentsCount: Number(commentsCount) || 0,
      assignees:
        selectedAssignees.length > 0
          ? selectedAssignees
          : assignees.slice(0, 1),
    });

    onOpenChange(false);
  };

  const handleDelete = () => {
    if (taskToEdit && onDelete) {
      onDelete(taskToEdit.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {isEditing ? 'Edit Task' : 'Create New Task'}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {isEditing
              ? 'Make changes to your task details below.'
              : 'Add a new task card to your Kanban board.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Task Title *</span>
              {errors.title && (
                <span className="text-[11px] text-rose-500 flex items-center gap-1 font-normal">
                  <AlertCircle className="w-3 h-3" /> {errors.title}
                </span>
              )}
            </label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors({});
              }}
              placeholder="e.g. Integrate Stripe payment gateway"
              className={errors.title ? 'border-rose-400' : ''}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed explanation of the task..."
              rows={3}
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          {/* Row: Status and Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Column / Status
              </label>
              <Select
                value={status}
                onValueChange={(val) => {
                  if (val) setStatus(val);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Priority
              </label>
              <Select
                value={priority}
                onValueChange={(val) => {
                  if (val) setPriority(val as Priority);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> High
                    </span>
                  </SelectItem>
                  <SelectItem value="Medium">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />{' '}
                      Medium
                    </span>
                  </SelectItem>
                  <SelectItem value="Low">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> Low
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Due Date and Progress Slider */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Due Date
              </label>
              <Input
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="e.g. Sep 20"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                <span>Progress</span>
                <span className="text-zinc-500 tabular-nums">{progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-black dark:accent-white cursor-pointer h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg"
              />
            </div>
          </div>

          {/* Row: Attachments and Comments count */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Attachments Count
              </label>
              <Input
                type="number"
                min="0"
                max="99"
                value={attachmentsCount}
                onChange={(e) => setAttachmentsCount(Number(e.target.value))}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Comments Count
              </label>
              <Input
                type="number"
                min="0"
                max="99"
                value={commentsCount}
                onChange={(e) => setCommentsCount(Number(e.target.value))}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Assignees Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Assignees
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {assignees.map((a) => {
                const isSelected = selectedAssigneeIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAssignee(a.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all border ${
                      isSelected
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900 font-medium'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
                    }`}
                  >
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={a.avatar} alt={a.name} />
                      <AvatarFallback className="text-[8px]">
                        {a.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span>{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delete confirmation or actions */}
          {confirmDelete && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
              <span>Are you sure you want to delete this task?</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  className="h-7 text-xs bg-rose-600 text-white"
                >
                  Yes, Delete
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
            {isEditing && !confirmDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-black hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 text-white font-medium"
              >
                {isEditing ? 'Save Changes' : 'Create Task'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
