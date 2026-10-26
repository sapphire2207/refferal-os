'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronsUpDown,
  Bell,
  Moon,
  Sun,
  Palette,
  Check,
  Plus,
  Settings,
  User,
  LogOut,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useTheme } from 'next-themes';

interface TopNavbarProps {
  onExport: () => void;
}

export function TopNavbar({ onExport }: TopNavbarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useState('Shadcn Outlet');
  const [notifications, setNotifications] = useState([
    {
      id: '1',
      title: 'CI/CD pipeline deployed',
      desc: 'Automated GitHub Actions workflow completed successfully.',
      time: '10m ago',
      unread: true,
    },
    {
      id: '2',
      title: 'Stripe gateway updated',
      desc: 'Jessica Taylor moved task to Backlog.',
      time: '1h ago',
      unread: true,
    },
    {
      id: '3',
      title: 'New comment on Backups',
      desc: 'David Kim left a comment on automated backups.',
      time: '3h ago',
      unread: false,
    },
  ]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : false;

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const hasUnread = notifications.some((n) => n.unread);

  return (
    <header className="w-full h-14 bg-white dark:bg-zinc-950 border-b border-zinc-200/80 dark:border-zinc-800 px-5 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Left side: Sidebar toggle, Orange logo, Workspace name, Chevron */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer outline-none">
            {/* Orange circle logo */}
            <div className="w-4 h-4 rounded-full bg-[#f97316] flex-shrink-0 shadow-xs" />
            <span className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {currentWorkspace}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 ml-0.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-zinc-500">Workspaces</DropdownMenuLabel>
              <DropdownMenuItem
                className="flex items-center justify-between"
                onClick={() => setCurrentWorkspace('Shadcn Outlet')}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f97316]" />
                  <span className="font-medium text-sm">Shadcn Outlet</span>
                </div>
                {currentWorkspace === 'Shadcn Outlet' && <Check className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center justify-between"
                onClick={() => setCurrentWorkspace('Personal Workspace')}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="font-medium text-sm">Personal Workspace</span>
                </div>
                {currentWorkspace === 'Personal Workspace' && <Check className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center justify-between"
                onClick={() => setCurrentWorkspace('Acme Corp')}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="font-medium text-sm">Acme Corp</span>
                </div>
                {currentWorkspace === 'Acme Corp' && <Check className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-zinc-500 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right side: Download, Bell with red indicator, Theme moon, Palette, Separator, Avatar */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Download action in purple */}
        <button
          type="button"
          onClick={onExport}
          className="text-[#7c3aed] dark:text-[#a78bfa] hover:text-[#6d28d9] dark:hover:text-[#c4b5fd] font-medium text-[13.5px] px-2.5 py-1.5 rounded-md hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
          title="Export current board data as JSON"
        >
          Download
        </button>

        {/* Notifications Popover */}
        <Popover>
          <PopoverTrigger
            aria-label="View notifications"
            className="relative p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer outline-none"
          >
            <Bell className="w-4 h-4 stroke-[1.8]" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-950" />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 shadow-lg">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notifications</h4>
              {hasUnread && (
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 font-medium"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 text-xs ${item.unread ? 'bg-zinc-50/80 dark:bg-zinc-900/40' : ''}`}
                >
                  <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-200">
                    <span>{item.title}</span>
                    <span className="text-[10px] text-zinc-400 font-normal">{item.time}</span>
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Theme Toggle (Moon / Sun) */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 stroke-[1.8]" />
          ) : (
            <Moon className="w-4 h-4 stroke-[1.8]" />
          )}
        </button>

        {/* Appearance Popover (Palette) */}
        <Popover>
          <PopoverTrigger
            aria-label="Appearance settings"
            className="p-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer outline-none"
            title="Appearance settings"
          >
            <Palette className="w-4 h-4 stroke-[1.8]" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-4 shadow-lg">
            <h4 className="text-sm font-semibold mb-3 text-zinc-900 dark:text-zinc-100">Appearance</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1.5 font-medium">Theme Mode</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`py-1.5 px-3 rounded-md border text-center font-medium ${
                      !isDark
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`py-1.5 px-3 rounded-md border text-center font-medium ${
                      isDark
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400">
                Preset: Shadcn Default Modern
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Vertical divider separator */}
        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* User profile avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full ring-2 ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-700 transition-all focus:outline-none cursor-pointer">
            <Avatar className="w-8 h-8">
              <AvatarImage src="/avatars/avatar1.svg" alt="User Profile" />
              <AvatarFallback className="bg-zinc-900 text-white text-xs font-semibold">SO</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 font-normal">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium leading-none text-zinc-900 dark:text-zinc-100">Senior Engineer</p>
                <p className="text-xs leading-none text-zinc-500 mt-1">engineer@outlet.com</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs flex items-center gap-2">
              <User className="w-3.5 h-3.5" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs flex items-center gap-2">
              <Settings className="w-3.5 h-3.5" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-rose-600 flex items-center gap-2">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
