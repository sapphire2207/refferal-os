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
} from '@/components/ui/sidebar';
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
  FileText,
  UserCheck,
  Inbox,
  LogOut,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { UserRole } from '@heals/types';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes(UserRole.ADMIN);

  // Common core items visible across workspaces
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

  // Clinical & Operational queues based on role or active workspace
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

  // Administration items
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
      <SidebarHeader className="border-b border-border/80 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white dark:bg-white dark:text-black">
            <span className="font-bold text-xs">H+W</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">
              Heals on Wheels
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Referral Operating System
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 space-y-4">
        {/* Quick Action Button */}
        <div className="px-2">
          <Link
            href="/referrals/new"
            className="flex items-center justify-center gap-2 w-full h-8 px-3 rounded-md bg-black text-white hover:bg-neutral-800 text-xs font-medium dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors shadow-xs"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>New Referral</span>
          </Link>
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2">
            Workspace Overview
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
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Operational Queues */}
        {operationalQueues.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2">
              Operational Queues
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
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administration */}
        {showAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2">
              Compliance & Admin
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
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/80 p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-foreground truncate">
              {user ? `${user.firstName} ${user.lastName}` : 'Staff'}
            </span>
            <span className="text-[10px] text-muted-foreground truncate font-mono">
              {activeWorkspace?.badge || 'Intake'}
            </span>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
