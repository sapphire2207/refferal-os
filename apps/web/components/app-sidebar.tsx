'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-context';
import { useWorkspace } from '@/providers/workspace-context';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  Kanban,
  Users,
  Calendar,
  Stethoscope,
  FileCheck2,
  Receipt,
  ShieldCheck,
  ScrollText,
  PlusCircle,
  LogOut,
  ChevronRight,
  Settings,
  HelpCircle,
  Search,
  MoreVertical,
  Activity,
  Layers,
} from 'lucide-react';
import { UserRole } from '@heals/types';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { activeWorkspace, availableWorkspaces, switchWorkspace } = useWorkspace();
  const { isMobile } = useSidebar();

  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes(UserRole.ADMIN);

  const userName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Clinical Staff'
    : 'Clinical Staff';
  const userEmail = user?.email || 'staff@heals.health';
  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'HW'
    : 'HW';

  // Core navigation items
  const mainNav = [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: LayoutDashboard,
      isActive: pathname === '/dashboard',
    },
    {
      title: 'Referrals Pipeline',
      url: '/referrals',
      icon: Kanban,
      isActive: pathname.startsWith('/referrals') && pathname !== '/referrals/new',
    },
    {
      title: 'Patients Directory',
      url: '/patients',
      icon: Users,
      isActive: pathname.startsWith('/patients'),
    },
  ];

  // Clinical & operational queues
  const operationalQueues = [
    {
      title: 'Appointment Schedule',
      url: '/schedule',
      icon: Calendar,
      isActive: pathname.startsWith('/schedule'),
      show:
        isAdmin ||
        userRoles.includes(UserRole.SCHEDULER) ||
        userRoles.includes(UserRole.OFFICE_MANAGER) ||
        activeWorkspace?.id === 'scheduling',
    },
    {
      title: 'NP Mobile Visits',
      url: '/visits',
      icon: Stethoscope,
      isActive: pathname.startsWith('/visits'),
      show:
        isAdmin ||
        userRoles.includes(UserRole.NURSE_PRACTITIONER) ||
        activeWorkspace?.id === 'np_visit',
    },
    {
      title: 'Clinical Notes QA',
      url: '/notes-review',
      icon: FileCheck2,
      isActive: pathname.startsWith('/notes-review'),
      show:
        isAdmin ||
        userRoles.includes(UserRole.CLINICAL_COORDINATOR) ||
        activeWorkspace?.id === 'clinical_qa',
    },
    {
      title: 'Billing & Claims',
      url: '/billing',
      icon: Receipt,
      isActive: pathname.startsWith('/billing'),
      show:
        isAdmin ||
        userRoles.includes(UserRole.BILLING_COORDINATOR) ||
        activeWorkspace?.id === 'billing',
    },
  ].filter((item) => item.show);

  // Administrative tools
  const adminNav = [
    {
      title: 'User Management',
      url: '/admin/users',
      icon: ShieldCheck,
      isActive: pathname.startsWith('/admin/users'),
    },
    {
      title: 'Compliance & Audit',
      url: '/admin/audit',
      icon: ScrollText,
      isActive: pathname.startsWith('/admin/audit'),
    },
  ];

  const showAdmin = isAdmin || userRoles.includes(UserRole.COMPLIANCE);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/80 bg-sidebar" {...props}>
      {/* Header: Company Brand */}
      <SidebarHeader className="border-b border-border/80 px-3 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white dark:bg-white dark:text-black shadow-xs">
            <span className="font-bold text-xs tracking-wider">H+W</span>
          </div>
          <div className="flex flex-col leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sm tracking-tight text-sidebar-foreground truncate">
              Heals on Wheels
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              Referral Operating System
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Quick Create Button */}
        <div className="px-2">
          <Link
            href="/referrals/new"
            className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:text-primary-foreground text-xs font-semibold shadow-xs transition-colors group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:mx-auto select-none"
            title="Create New Referral"
          >
            <PlusCircle className="h-4 w-4 shrink-0 text-primary-foreground" />
            <span className="group-data-[collapsible=icon]:hidden text-primary-foreground">
              New Referral
            </span>
          </Link>
        </div>

        {/* Primary Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 group-data-[collapsible=icon]:hidden">
            Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={item.isActive}
                    tooltip={item.title}
                    className="h-8 text-xs font-medium"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Operational Queues */}
        {operationalQueues.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 group-data-[collapsible=icon]:hidden">
              Clinical Queues
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {operationalQueues.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={item.isActive}
                      tooltip={item.title}
                      className="h-8 text-xs font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administrative Tools */}
        {showAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 group-data-[collapsible=icon]:hidden">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={item.isActive}
                      tooltip={item.title}
                      className="h-8 text-xs font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer: User Profile Card (Matching img1) */}
      <SidebarFooter className="border-t border-border/80 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={userName}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground px-2 py-1.5"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg shrink-0 border border-border/80 bg-muted">
                  <AvatarFallback className="rounded-lg text-xs font-bold text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-xs leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold text-foreground">{userName}</span>
                  <span className="truncate text-[11px] text-muted-foreground font-mono">
                    {userEmail}
                  </span>
                </div>
                <MoreVertical className="ml-auto h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-60 rounded-lg p-1.5 shadow-md"
                side={isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={8}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2.5 px-2 py-2 text-left">
                    <Avatar className="h-9 w-9 rounded-lg border border-border/80 bg-muted">
                      <AvatarFallback className="rounded-lg text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {userName}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground font-mono">
                        {userEmail}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Workspace Switcher in Menu for Multi-Role */}
                {availableWorkspaces.length > 1 && (
                  <>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                        Active Workspace
                      </DropdownMenuLabel>
                      {availableWorkspaces.map((ws) => (
                        <DropdownMenuItem
                          key={ws.id}
                          onClick={() => switchWorkspace(ws.id)}
                          className="text-xs cursor-pointer justify-between"
                        >
                          <span className={activeWorkspace?.id === ws.id ? 'font-semibold' : ''}>
                            {ws.name}
                          </span>
                          {activeWorkspace?.id === ws.id && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem
                  onClick={() => logout()}
                  className="text-xs text-destructive cursor-pointer focus:bg-destructive/10 focus:text-destructive gap-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
