'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './auth-context';
import { WORKSPACES, WorkspaceConfig, WorkspaceId, getAvailableWorkspaces } from '@/lib/workspaces';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface WorkspaceContextValue {
  activeWorkspace: WorkspaceConfig | null;
  availableWorkspaces: WorkspaceConfig[];
  hasMultipleWorkspaces: boolean;
  switchWorkspace: (id: WorkspaceId) => void;
  isWorkspaceAuthorized: (id: WorkspaceId) => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeWorkspace: null,
  availableWorkspaces: [],
  hasMultipleWorkspaces: false,
  switchWorkspace: () => {},
  isWorkspaceAuthorized: () => false,
});

export const useWorkspace = () => useContext(WorkspaceContext);

const STORAGE_KEY = 'heals_active_workspace';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Compute available workspaces based strictly on backend-verified user.roles
  const availableWorkspaces = useMemo(() => {
    return getAvailableWorkspaces(user?.roles);
  }, [user?.roles]);

  const hasMultipleWorkspaces = availableWorkspaces.length > 1;

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<WorkspaceId | null>(null);

  // Initialize and synchronize active workspace
  useEffect(() => {
    if (availableWorkspaces.length === 0) {
      setActiveWorkspaceId(null);
      return;
    }

    // Single-role user: strictly auto-select the one available workspace
    if (availableWorkspaces.length === 1) {
      setActiveWorkspaceId(availableWorkspaces[0].id);
      return;
    }

    // Multi-role user: check saved preference
    const saved = localStorage.getItem(STORAGE_KEY) as WorkspaceId | null;
    if (saved && availableWorkspaces.some((ws) => ws.id === saved)) {
      setActiveWorkspaceId(saved);
    } else {
      // Default to first valid authorized workspace
      const defaultWs = availableWorkspaces[0].id;
      setActiveWorkspaceId(defaultWs);
      localStorage.setItem(STORAGE_KEY, defaultWs);
    }
  }, [availableWorkspaces]);

  const switchWorkspace = useCallback(
    (id: WorkspaceId) => {
      const target = availableWorkspaces.find((ws) => ws.id === id);
      if (!target) {
        toast.error('Unauthorized Workspace', {
          description: 'You do not have the required role to access this workspace.',
        });
        return;
      }

      setActiveWorkspaceId(target.id);
      try {
        localStorage.setItem(STORAGE_KEY, target.id);
      } catch (e) {
        // Safe fallback if storage unavailable
      }

      // Invalidate queries so previous workspace queue data does not leak into the new view
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });

      toast.info(`Switched to ${target.name}`, {
        description: target.description,
      });

      // Navigate to the new workspace's primary operational queue
      router.push(target.defaultRoute);
    },
    [availableWorkspaces, queryClient, router],
  );

  const isWorkspaceAuthorized = useCallback(
    (id: WorkspaceId) => {
      return availableWorkspaces.some((ws) => ws.id === id);
    },
    [availableWorkspaces],
  );

  const activeWorkspace = activeWorkspaceId ? WORKSPACES[activeWorkspaceId] || null : null;

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        availableWorkspaces,
        hasMultipleWorkspaces,
        switchWorkspace,
        isWorkspaceAuthorized,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
