'use client';

import React from 'react';
import { useWorkspace } from '@/providers/workspace-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronsUpDown,
  Check,
  Inbox,
  Stethoscope,
  Calendar,
  UserCheck,
  FileCheck,
  Receipt,
  LayoutGrid,
  Shield,
  ScrollText,
} from 'lucide-react';
import { WorkspaceId } from '@/lib/workspaces';

const ICON_MAP: Record<string, React.ElementType> = {
  Inbox,
  Stethoscope,
  Calendar,
  UserCheck,
  FileCheck,
  Receipt,
  LayoutGrid,
  Shield,
  ScrollText,
};

export function WorkspaceSwitcher() {
  const { activeWorkspace, availableWorkspaces, hasMultipleWorkspaces, switchWorkspace } = useWorkspace();

  if (!activeWorkspace) return null;

  const ActiveIcon = ICON_MAP[activeWorkspace.iconName] || LayoutGrid;

  // Case A: User has exactly one role -> No switcher dropdown, just a clear workspace pill
  if (!hasMultipleWorkspaces) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border/60 bg-muted/30 text-xs">
        <ActiveIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">{activeWorkspace.name}</span>
        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-normal">
          {activeWorkspace.badge}
        </Badge>
      </div>
    );
  }

  // Case B: User has multiple roles -> Top-right workspace switcher dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 border-border/80 bg-background font-medium text-xs hover:bg-accent/60 shadow-xs"
          />
        }
      >
        <ActiveIcon className="h-3.5 w-3.5 text-primary" />
        <span className="max-w-[120px] truncate md:max-w-[160px]">{activeWorkspace.name}</span>
        <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] py-0 px-1.5 h-4 font-normal">
          {activeWorkspace.badge}
        </Badge>
        <ChevronsUpDown className="h-3 w-3 opacity-50 ml-1" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Switch Operational Workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableWorkspaces.map((ws) => {
          const ItemIcon = ICON_MAP[ws.iconName] || LayoutGrid;
          const isSelected = activeWorkspace.id === ws.id;

          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => switchWorkspace(ws.id)}
              className="flex items-start gap-2.5 px-2.5 py-2 cursor-pointer rounded-md"
            >
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground'
                }`}
              >
                <ItemIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col flex-1 leading-tight">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isSelected ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                    {ws.name}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>
                <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {ws.description}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
