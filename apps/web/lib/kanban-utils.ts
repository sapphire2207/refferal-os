import { FilterState, Task, Column } from './kanban-types';

export function filterTasks(
  tasks: Task[],
  query: string,
  filter: FilterState
): Task[] {
  return tasks.filter((task) => {
    // Search query match (title or description)
    if (query.trim() !== '') {
      const q = query.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) {
        return false;
      }
    }

    // Priority filter
    if (filter.priority !== 'all') {
      if (task.priority.toLowerCase() !== filter.priority.toLowerCase()) {
        return false;
      }
    }

    // Status filter
    if (filter.status !== 'all') {
      if (task.status !== filter.status) {
        return false;
      }
    }

    // Assignee filter
    if (filter.assigneeId !== 'all') {
      const hasAssignee = task.assignees.some((a) => a.id === filter.assigneeId);
      if (!hasAssignee) {
        return false;
      }
    }

    return true;
  });
}

export function exportBoardToJson(tasks: Task[], columns: Column[]): void {
  const data = {
    exportedAt: new Date().toISOString(),
    columns,
    tasks,
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(data, null, 2)
  )}`;
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `kanban-export-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
