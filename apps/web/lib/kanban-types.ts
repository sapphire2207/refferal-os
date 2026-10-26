export type Priority = 'High' | 'Medium' | 'Low';

export type ColumnId = 'backlog' | 'in-progress' | 'done' | string;

export interface Assignee {
  id: string;
  name: string;
  avatar: string;
  initials: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: ColumnId;
  dueDate?: string; // Formatted date string like "Sep 20"
  progress: number; // 0 to 100
  attachmentsCount: number;
  commentsCount: number;
  assignees: Assignee[];
  order: number;
}

export interface Column {
  id: ColumnId;
  title: string;
  order: number;
}

export type ViewMode = 'board' | 'list' | 'table';

export interface FilterState {
  priority: Priority | 'all';
  status: ColumnId | 'all';
  assigneeId: string | 'all';
}
