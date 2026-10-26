'use client';

import React from 'react';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { useAuth } from '@/providers/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LogOut, User as UserIcon, ShieldAlert } from 'lucide-react';

export function SiteHeader({ title }: { title?: string }) {
  const { user, logout } = useAuth();

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'HW'
    : 'HW';

  return (
    <header className="flex h-(--header-height) shrink-0 items-center justify-between border-b border-border/80 bg-background/95 backdrop-blur-xs px-4 lg:px-6 z-10 transition-[width,height] ease-linear">
      {/* Left: Sidebar trigger, divider, Title */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1 h-8 w-8 text-muted-foreground hover:text-foreground" />
        <Separator orientation="vertical" className="mx-1 h-4 bg-border/60" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {title || 'Heals on Wheels'}
          </span>
          <span className="hidden md:inline-flex text-[11px] text-muted-foreground font-mono">
            / ReferralOS
          </span>
        </div>
      </div>

      {/* Right: Workspace Switcher, Notifications, User Menu */}
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher />

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="relative h-8 w-8 rounded-full p-0 ring-offset-background hover:opacity-80"
              />
            }
          >
            <Avatar className="h-8 w-8 border border-border/80 bg-muted">
              <AvatarFallback className="text-xs font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1">
            <DropdownMenuLabel className="font-normal px-2 py-1.5">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-medium leading-none text-foreground">
                  {user ? `${user.firstName} ${user.lastName}` : 'Staff Member'}
                </p>
                <p className="text-[11px] leading-none text-muted-foreground">
                  {user?.email || 'staff@healsonwheels.com'}
                </p>
                {user?.roles && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {user.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              className="text-xs text-destructive cursor-pointer focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
