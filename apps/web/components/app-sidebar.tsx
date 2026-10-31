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
  SidebarMenuBadge,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { PipelineStage, UserRole } from '@heals/types';
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
import { cn } from '@/lib/utils';

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

  // Live operational metrics for sidebar badge indicators
  const { data: metrics } = useQuery<{
    totalActive: number;
    byStage: Record<PipelineStage, number>;
  }>({
    queryKey: ['dashboard-metrics'],
    queryFn: () => apiClient.get('/referrals/dashboard/metrics'),
    staleTime: 30 * 1000,
  });

  const isClinician =
    userRoles.includes(UserRole.CLINICAL_REVIEWER) ||
    userRoles.includes(UserRole.CLINICAL_COORDINATOR);
  const isIntake = userRoles.includes(UserRole.INTAKE_SPECIALIST);

  const clinicalReviewCount = metrics?.byStage?.[PipelineStage.CLINICAL_REVIEW] ?? 0;
  const intakeCount = metrics?.byStage?.[PipelineStage.INTAKE] ?? 0;
  const schedulingCount = metrics?.byStage?.[PipelineStage.SCHEDULING] ?? 0;
  const npVisitCount = metrics?.byStage?.[PipelineStage.NP_VISIT] ?? 0;
  const notesQaCount = metrics?.byStage?.[PipelineStage.NOTES_QA] ?? 0;
  const billingCount = metrics?.byStage?.[PipelineStage.BILLING] ?? 0;

  // Pipeline badge: prioritize clinical review queue for clinicians, intake for intake staff
  let pipelineBadge: number | undefined;
  let pipelineBadgeClass = 'bg-muted text-muted-foreground border-border/60';

  if (isClinician && clinicalReviewCount > 0) {
    pipelineBadge = clinicalReviewCount;
    pipelineBadgeClass = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold';
  } else if (isIntake && intakeCount > 0) {
    pipelineBadge = intakeCount;
    pipelineBadgeClass = 'bg-primary/10 text-primary border border-primary/20 font-bold';
  } else if (metrics?.totalActive && metrics.totalActive > 0) {
    pipelineBadge = metrics.totalActive;
  }

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
      badge: pipelineBadge,
      badgeClassName: pipelineBadgeClass,
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
      badge: schedulingCount > 0 ? schedulingCount : undefined,
      badgeClassName: 'bg-muted text-muted-foreground border-border/60',
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
      badge: npVisitCount > 0 ? npVisitCount : undefined,
      badgeClassName: 'bg-muted text-muted-foreground border-border/60',
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
      badge: notesQaCount > 0 ? notesQaCount : undefined,
      badgeClassName: notesQaCount > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-bold' : 'bg-muted text-muted-foreground border-border/60',
      show:
        isAdmin ||
        userRoles.includes(UserRole.CLINICAL_COORDINATOR) ||
        userRoles.includes(UserRole.CLINICAL_REVIEWER) ||
        activeWorkspace?.id === 'clinical_qa',
    },
    {
      title: 'Billing & Claims',
      url: '/billing',
      icon: Receipt,
      isActive: pathname.startsWith('/billing'),
      badge: billingCount > 0 ? billingCount : undefined,
      badgeClassName: 'bg-muted text-muted-foreground border-border/60',
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
      <SidebarHeader className="h-(--header-height) justify-center border-b border-border/80 px-3 group-data-[collapsible=icon]:px-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden group group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background shadow-2xs transition-transform duration-150 group-hover:scale-105">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight text-sidebar-foreground truncate">
                Heals on Wheels
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium tracking-tight truncate">
              ReferralOS
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 space-y-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2 group-data-[collapsible=icon]:space-y-2">
        {/* Quick Create Button */}
        <div className="px-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <Link
            href="/referrals/new"
            className="flex items-center justify-between w-full h-9 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:text-primary-foreground text-xs font-semibold shadow-xs transition-all duration-150 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center select-none"
            title="Create New Referral (N)"
          >
            <div className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 shrink-0 text-primary-foreground" aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden text-primary-foreground">
                New Referral
              </span>
            </div>
            <kbd className="hidden lg:group-data-[collapsible=icon]:hidden inline-flex items-center rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[9px] font-mono text-primary-foreground">
              N
            </kbd>
          </Link>
        </div>

        {/* Primary Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 px-2 group-data-[collapsible=icon]:hidden">
            Operational Overview
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={item.isActive}
                    tooltip={item.title}
                    className={cn(
                      'h-8 text-xs font-medium rounded-md transition-colors',
                      item.isActive 
                        ? 'bg-accent text-accent-foreground font-semibold shadow-2xs' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <item.icon className={cn('h-4 w-4 shrink-0', item.isActive ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  </SidebarMenuButton>
                  {item.badge !== undefined && item.badge > 0 && (
                    <SidebarMenuBadge className={cn('text-[10px] font-semibold h-4.5 min-w-4.5 px-1.5 rounded-full border', item.badgeClassName)}>
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Operational Queues */}
        {operationalQueues.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 px-2 group-data-[collapsible=icon]:hidden">
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
                      className={cn(
                        'h-8 text-xs font-medium rounded-md transition-colors',
                        item.isActive 
                          ? 'bg-accent text-accent-foreground font-semibold shadow-2xs' 
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4 shrink-0', item.isActive ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </SidebarMenuButton>
                    {item.badge !== undefined && item.badge > 0 && (
                      <SidebarMenuBadge className={cn('text-[10px] font-semibold h-4.5 min-w-4.5 px-1.5 rounded-full border', item.badgeClassName)}>
                        {item.badge}
                      </SidebarMenuBadge>
                    )}
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
                      className={cn(
                        'h-8 text-xs font-medium rounded-md transition-colors',
                        item.isActive 
                          ? 'bg-accent text-accent-foreground font-semibold shadow-2xs' 
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4 shrink-0', item.isActive ? 'text-foreground' : 'text-muted-foreground')} aria-hidden="true" />
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
      <SidebarFooter className="border-t border-border/80 p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:py-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:items-center">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={userName}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground px-2 py-1.5 group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center"
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
                  <span className="truncate text-[11px] text-muted-foreground font-medium">
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
                      <span className="truncate text-[10px] text-muted-foreground font-medium">
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
