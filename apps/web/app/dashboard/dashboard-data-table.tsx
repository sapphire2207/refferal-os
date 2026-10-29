'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { flexRender } from '@tanstack/react-table';
import {
  useLegacyTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  LegacyColumnDef,
} from '@tanstack/react-table/legacy';
import {
  ColumnFiltersState,
  SortingState,
  ColumnVisibilityState,
  RowSelectionState,
  PaginationState,
} from '@tanstack/table-core';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { WorkStatusBadge, PriorityBadge, PipelineStageBadge } from '@/components/ui/status-badge';
import {
  Search,
  Plus,
  ArrowUpRight,
  MoreVertical,
  Clock,
  CheckCircle2,
  Columns3,
  GripVertical,
  ChevronDown,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Eye,
  Activity,
  ArrowUpDown,
} from 'lucide-react';
import { PipelineStage, WorkStatus, Priority } from '@heals/types';
import { toast } from 'sonner';

export interface ReferralTableRow {
  id: string;
  trackingNumber: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    medicalRecordNumber?: string;
  };
  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  priority: Priority;
  site: string;
  insurancePayer?: string;
  assignedTo?: string;
  version: number;
}

interface DashboardDataTableProps {
  data: ReferralTableRow[];
  isLoading?: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  counts: {
    total: number;
    intake: number;
    review: number;
    scheduling: number;
    urgent: number;
  };
}

export function DashboardDataTable({
  data,
  isLoading = false,
  activeTab,
  setActiveTab,
  counts,
}: DashboardDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = useMemo<LegacyColumnDef<ReferralTableRow, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="flex items-center gap-1.5 pl-1">
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              indeterminate={
                table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
              }
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all cases"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 pl-1">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing" aria-hidden="true" />
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select case row"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'patient',
        accessorFn: (row) => `${row.patient.firstName} ${row.patient.lastName}`,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 font-semibold text-foreground hover:text-foreground/80 transition-colors"
          >
            <span>Patient Name & MRN</span>
            <ArrowUpDown className="h-3 w-3 opacity-60" aria-hidden="true" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          const initials = `${r.patient?.firstName?.[0] || ''}${r.patient?.lastName?.[0] || ''}`.toUpperCase() || 'PT';
          const mrn = r.patient?.medicalRecordNumber || 'MRN-Pending';
          return (
            <div className="flex items-center gap-2.5 py-1 min-w-0">
              <Avatar className="h-8 w-8 shrink-0 border border-border/80 bg-muted/60">
                <AvatarFallback className="text-[11px] font-bold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <Link
                  href={`/referrals/${r.id}`}
                  className="font-semibold text-foreground hover:text-primary hover:underline text-xs truncate max-w-[200px]"
                >
                  {r.patient?.firstName} {r.patient?.lastName}
                </Link>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mt-0.5 tabular-nums">
                  <span>{mrn}</span>
                  <span>•</span>
                  <span className="text-muted-foreground/80">{r.trackingNumber}</span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'stage',
        accessorKey: 'pipelineStage',
        header: 'Stage',
        cell: ({ row }) => <PipelineStageBadge stage={row.original.pipelineStage} />,
      },
      {
        id: 'workStatus',
        accessorKey: 'workStatus',
        header: 'Status',
        cell: ({ row }) => <WorkStatusBadge status={row.original.workStatus} />,
      },
      {
        id: 'priority',
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'insurancePayer',
        accessorKey: 'insurancePayer',
        header: 'Payer / Insurance',
        cell: ({ row }) => (
          <span className="text-xs text-foreground/80 truncate block max-w-[150px]">
            {row.original.insurancePayer || 'Self-Pay / Pending'}
          </span>
        ),
      },
      {
        id: 'site',
        accessorKey: 'site',
        header: 'Site Scope',
        cell: ({ row }) => (
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            {row.original.site}
          </span>
        ),
      },
      {
        id: 'assignedTo',
        accessorKey: 'assignedTo',
        header: 'Reviewer / Staff',
        cell: ({ row }) => {
          const reviewer = row.original.assignedTo;
          if (reviewer) {
            return (
              <span className="text-xs font-medium text-foreground">
                {reviewer}
              </span>
            );
          }
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors shadow-2xs"
                  />
                }
              >
                <span>Assign reviewer</span>
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44 text-xs">
                <DropdownMenuLabel>Select Clinician</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => toast.success('Assigned to Dr. Sarah Adams')}>
                  Dr. Sarah Adams (NP)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success('Assigned to Jamik Tashpulatov')}>
                  Jamik Tashpulatov (Intake)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success('Assigned to Eddie Lake')}>
                  Eddie Lake (QA Lead)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="text-right block">Action</span>,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    />
                  }
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-xs">
                  <DropdownMenuItem className="cursor-pointer" render={<Link href={`/referrals/${r.id}`} />}>
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" render={<Link href={`/referrals/${r.id}`} />}>
                    <Activity className="mr-2 h-3.5 w-3.5" />
                    Advance Stage
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(r.trackingNumber);
                      toast.success(`Copied tracking # ${r.trackingNumber}`);
                    }}
                  >
                    Copy Tracking Number
                  </DropdownMenuItem>
                  {r.patient?.medicalRecordNumber && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(r.patient.medicalRecordNumber!);
                        toast.success(`Copied MRN ${r.patient.medicalRecordNumber}`);
                      }}
                    >
                      Copy MRN
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        enableHiding: false,
      },
    ],
    [],
  );

  const table = useLegacyTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
      {/* Top Header Bar with Filter Tabs and Column Customizer (Matching img2) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between p-4 border-b border-border/80 gap-3 bg-muted/20">
        {/* Left: Filter Tabs with Clean Badge Counts */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Referral queues">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ALL'}
            onClick={() => setActiveTab('ALL')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'ALL'
                ? 'bg-background text-foreground shadow-xs border border-border font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span>All Cases</span>
            <span className="rounded-full bg-muted/80 px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground tabular-nums">
              {counts.total}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'INTAKE'}
            onClick={() => setActiveTab('INTAKE')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'INTAKE'
                ? 'bg-background text-foreground shadow-xs border border-border font-semibold text-blue-700 dark:text-blue-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
            <span>Intake Queue</span>
            <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
              {counts.intake}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'CLINICAL_REVIEW'}
            onClick={() => setActiveTab('CLINICAL_REVIEW')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'CLINICAL_REVIEW'
                ? 'bg-background text-foreground shadow-xs border border-border font-semibold text-purple-700 dark:text-purple-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" aria-hidden="true" />
            <span>Clinical Review</span>
            <span className="rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
              {counts.review}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SCHEDULING'}
            onClick={() => setActiveTab('SCHEDULING')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'SCHEDULING'
                ? 'bg-background text-foreground shadow-xs border border-border font-semibold text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            <span>Scheduling</span>
            <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
              {counts.scheduling}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'URGENT'}
            onClick={() => setActiveTab('URGENT')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'URGENT'
                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            {counts.urgent > 0 ? (
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse-subtle" aria-hidden="true" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
            )}
            <span>Urgent / STAT</span>
            <span className="rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 px-1.5 py-0.2 text-[10px] font-bold tabular-nums">
              {counts.urgent}
            </span>
          </button>
        </div>

        {/* Right Controls: Search, Customize Columns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Global Search Input */}
          <div className="relative w-full sm:w-auto min-w-0 sm:min-w-[200px] sm:max-w-[260px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Filter cases by patient name, MRN, or tracking number"
              placeholder="Filter cases by name, MRN…"
              value={globalFilter}
              onChange={(e) => {
                const val = e.target.value;
                setGlobalFilter(val);
                table.getColumn('patient')?.setFilterValue(val);
              }}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          {/* Customize Columns Dropdown (matching img2 reference) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 text-xs border-border/80 bg-background font-medium hover:bg-muted/50 shadow-2xs"
                />
              }
            >
              <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Customize Columns</span>
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1.5">
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
                Toggle Columns
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const headerTitle =
                    column.id === 'patient'
                      ? 'Patient Name & MRN'
                      : column.id === 'stage'
                      ? 'Pipeline Stage'
                      : column.id === 'workStatus'
                      ? 'Work Status'
                      : column.id === 'priority'
                      ? 'Priority'
                      : column.id === 'insurancePayer'
                      ? 'Payer / Insurance'
                      : column.id === 'site'
                      ? 'Site Scope'
                      : column.id === 'assignedTo'
                      ? 'Reviewer / Staff'
                      : column.id;

                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize text-xs cursor-pointer"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {headerTitle}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/referrals">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 bg-background">
              <span>View Kanban</span>
              <ArrowUpRight className="h-3 w-3" />
            </Button>
          </Link>

          <Link href="/referrals/new">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Referral</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Table Structure using Shadcn Table Primitives */}
      <div className="overflow-x-auto">
        <Table className="w-full text-xs">
          <TableHeader className="bg-muted/40 border-b border-border/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="py-3 px-3.5 text-muted-foreground font-semibold text-[11px] whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-border/60 bg-card">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="animate-pulse">
                  <TableCell className="py-3 px-3.5 pl-4">
                    <div className="h-4 w-4 bg-muted/70 rounded" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-muted/70 shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 w-32 bg-muted/70 rounded" />
                        <div className="h-2.5 w-24 bg-muted/50 rounded" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="h-5 w-20 bg-muted/60 rounded-full" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="h-5 w-24 bg-muted/60 rounded-full" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="h-5 w-16 bg-muted/60 rounded-full" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="h-3.5 w-28 bg-muted/50 rounded" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="h-3 w-16 bg-muted/40 rounded" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5">
                    <div className="h-6 w-24 bg-muted/40 rounded-md" />
                  </TableCell>
                  <TableCell className="py-3 px-3.5 text-right">
                    <div className="h-7 w-7 bg-muted/50 rounded ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                  <div className="space-y-1">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto opacity-80" />
                    <p className="font-medium text-foreground">No referrals in this filter</p>
                    <p className="text-[11px]">All referrals for this stage are caught up.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest('button') ||
                      target.closest('input') ||
                      target.closest('a') ||
                      target.closest('[role="menuitem"]') ||
                      target.closest('[role="checkbox"]')
                    ) {
                      return;
                    }
                    router.push(`/referrals/${row.original.id}`);
                  }}
                  className="hover:bg-muted/40 transition-colors group cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 px-3.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bottom Pagination Bar (Exact replica of img2 reference) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-t border-border/80 bg-muted/20">
        <div className="text-xs text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-6 self-start sm:self-auto">
          {/* Rows per page selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(val) => {
                table.setPageSize(Number(val));
              }}
            >
              <SelectTrigger className="h-8 w-16 text-xs bg-background">
                <SelectValue placeholder={`${table.getState().pagination.pageSize}`} />
              </SelectTrigger>
              <SelectContent side="top" className="min-w-[70px]">
                {[5, 10, 20, 30, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Page info */}
          <div className="text-xs font-medium text-foreground whitespace-nowrap">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount() || 1}
          </div>

          {/* Pagination Navigation Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="h-8 w-8 p-0 bg-background"
              title="First Page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 w-8 p-0 bg-background"
              title="Previous Page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 w-8 p-0 bg-background"
              title="Next Page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="h-8 w-8 p-0 bg-background"
              title="Last Page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
