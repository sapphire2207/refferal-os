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
import { LogOut, User as UserIcon, ShieldAlert, Search, ShieldCheck } from 'lucide-react';

export function SiteHeader({ title }: { title?: string }) {
  const { user, logout } = useAuth();

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'HW'
    : 'HW';

  return (
    <header className="flex h-(--header-height) shrink-0 items-center justify-between border-b border-border/80 bg-background/90 backdrop-blur-md px-4 lg:px-6 z-10 transition-[width,height] ease-linear">
      {/* Left: Sidebar trigger, divider, Title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <SidebarTrigger 
          aria-label="Toggle navigation sidebar"
          className="-ml-1 h-8 w-8 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40" 
        />
        <Separator orientation="vertical" className="h-4 bg-border/60" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {title || 'Heals on Wheels'}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
            ReferralOS
          </span>
        </div>
      </div>

      {/* Center: Command Palette Trigger (Modern SaaS benchmark) */}
      <div className="hidden md:flex items-center">
        <button
          type="button"
          onClick={() => {
            const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            }
          }}
          aria-label="Quick search referrals and patients"
          className="group flex items-center gap-2 rounded-lg border border-border/80 bg-muted/40 hover:bg-muted/70 px-3 py-1.5 text-xs text-muted-foreground transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none w-64 lg:w-80 justify-between"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
            <span className="text-xs">Quick search patients, MRN, tracking…</span>
          </div>
          <kbd className="pointer-events-none inline-flex h-4.5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: HIPAA Live Beacon, Workspace Switcher, Notifications, User Menu */}
      <div className="flex items-center gap-3">
        <div 
          className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
          title="Authoritative End-to-End HIPAA Encrypted Session"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-subtle" aria-hidden="true" />
          <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>HIPAA Encrypted</span>
        </div>

        <WorkspaceSwitcher />

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open staff account menu"
                className="relative h-8 w-8 rounded-full p-0 ring-offset-background hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            }
          >
            <Avatar className="h-8 w-8 border border-border/80 bg-muted">
              <AvatarFallback className="text-xs font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1 shadow-lg">
            <DropdownMenuLabel className="font-normal px-2 py-1.5">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-semibold leading-none text-foreground">
                  {user ? `${user.firstName} ${user.lastName}` : 'Staff Member'}
                </p>
                <p className="text-[11px] leading-none text-muted-foreground font-medium">
                  {user?.email || 'staff@healsonwheels.com'}
                </p>
                {user?.roles && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {user.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded bg-primary/10 border border-primary/20 px-1 py-0.5 text-[9px] font-semibold text-primary"
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
              <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
