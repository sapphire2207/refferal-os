'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { ConfirmDangerDialog } from '@/components/ui/confirm-danger-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ShieldCheck, UserPlus, ShieldAlert, CheckCircle, Ban, Loader2, RefreshCw, Users, Trash2, Send, MapPin } from 'lucide-react';
import { UserRole } from '@heals/types';
import { toast } from 'sonner';

const AVAILABLE_SITES = [
  { value: 'ALL', label: 'All Sites / System-Wide (Unrestricted)' },
  { value: 'main', label: 'main — Primary HQ / Clinic (California)' },
  { value: 'SITE-NYC', label: 'SITE-NYC — New York City' },
  { value: 'SITE-ALB', label: 'SITE-ALB — Albany' },
  { value: 'SITE-BUF', label: 'SITE-BUF — Buffalo' },
  { value: 'SITE-CA-SF', label: 'SITE-CA-SF — San Francisco' },
  { value: 'SITE-CA-LA', label: 'SITE-CA-LA — Los Angeles' },
  { value: 'FL-MIAMI', label: 'FL-MIAMI — Miami' },
  { value: 'FL-ORLANDO', label: 'FL-ORLANDO — Orlando' },
];

const AVAILABLE_STATES = [
  { value: 'ALL', label: 'All States / National (Unrestricted)' },
  { value: 'CA', label: 'California (CA)' },
  { value: 'NY', label: 'New York (NY)' },
  { value: 'FL', label: 'Florida (FL)' },
  { value: 'NJ', label: 'New Jersey (NJ)' },
  { value: 'CT', label: 'Connecticut (CT)' },
  { value: 'TX', label: 'Texas (TX)' },
];

export default function UsersAdminPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes(UserRole.ADMIN);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [userToSuspend, setUserToSuspend] = useState<any | null>(null);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [userToEditScope, setUserToEditScope] = useState<any | null>(null);
  const [editSite, setEditSite] = useState('ALL');
  const [editState, setEditState] = useState('ALL');

  // Invite Form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.INTAKE_SPECIALIST);
  const [site, setSite] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [legalEntity, setLegalEntity] = useState('heals_main');

  // Fetch users list
  const { data, isLoading, refetch, isFetching } = useQuery<any>({
    queryKey: ['users'],
    queryFn: () => apiClient.get<any>('/users?limit=50'),
    enabled: !!isAdmin,
    staleTime: 60 * 1000,
  });

  const users = extractApiList<any>(data);

  // Invite User Mutation
  const inviteMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/users/invite', {
        email,
        firstName,
        lastName,
        roles: [selectedRole],
        scopes: [
          {
            site: site || 'ALL',
            state: state || 'ALL',
            legalEntity: 'heals_main',
          },
        ],
      }),
    onSuccess: () => {
      toast.success('Invitation sent! An email with the setup link has been delivered.');
      setIsInviteOpen(false);
      setEmail('');
      setFirstName('');
      setLastName('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      toast.error('Invitation Failed', { description: err.message });
    },
  });

  // Update Scopes Mutation
  const updateScopeMutation = useMutation({
    mutationFn: ({ id, scopes }: { id: string; scopes: any[] }) =>
      apiClient.patch(`/users/${id}/scopes`, { scopes }),
    onSuccess: () => {
      toast.success('Location and jurisdiction scopes updated successfully.');
      setUserToEditScope(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      toast.error('Scope Update Failed', { description: err.message });
    },
  });

  // Toggle User Suspension Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isSuspended }: { id: string; isSuspended: boolean }) =>
      apiClient.patch(`/users/${id}/status`, {
        isSuspended,
        suspendedReason: isSuspended ? 'Administrative suspension' : undefined,
      }),
    onSuccess: (data, variables) => {
      toast.success(
        variables.isSuspended
          ? 'User suspended. Active sessions and Redis tokens immediately terminated.'
          : 'User access reactivated.',
      );
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      toast.error('Status Update Failed', { description: err.message });
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: (data: any) => {
      toast.success(data?.message || 'User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setUserToDelete(null);
    },
    onError: (err: any) => {
      toast.error('Deletion Failed', { description: err.message });
    },
  });

  // Resend Invite Mutation
  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/users/${id}/resend-invite`, {}),
    onSuccess: () => {
      toast.success('Invitation email resent successfully');
    },
    onError: (err: any) => {
      toast.error('Failed to Resend Invite', { description: err.message });
    },
  });

  if (!isAdmin) {
    return (
      <AppLayout title="Access Restricted">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
          <div className="p-3 bg-rose-500/10 text-rose-600 rounded-full">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Access Restricted to Administrators</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              User provisioning, role assignments, and security configurations require System Administrator privileges.
            </p>
          </div>
          <Link href="/dashboard">
            <Button size="sm" variant="outline" className="text-xs">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="User Management & Scopes">
      <div className="space-y-6">
        <PageHeader>
          <div>
            <PageHeaderHeading>Staff Provisioning & Geographic Scopes</PageHeaderHeading>
            <PageHeaderDescription>
              Role assignment, site territorial bounds, and instant session revocation enforcement
            </PageHeaderDescription>
          </div>
          <PageHeaderActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs font-medium border-border"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsInviteOpen(!isInviteOpen)}
              className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{isInviteOpen ? 'Close Form' : 'Invite'}</span>
            </Button>
          </PageHeaderActions>
        </PageHeader>

        {/* Invite Staff Form Drawer */}
        {isInviteOpen && (
          <Card className="border border-border/80 bg-card shadow-xs animate-in fade-in-50">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold">Invite Healthcare Staff Member</CardTitle>
              <CardDescription className="text-xs">
                Generates secure invite token with role-based and geographic location scopes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invEmail" className="text-xs font-medium text-foreground">Work Email *</Label>
                  <Input
                    id="invEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinician@healsonwheels.com"
                    className="h-8 text-xs bg-background border-border"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invFirst" className="text-xs font-medium text-foreground">First Name *</Label>
                  <Input
                    id="invFirst"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Sarah"
                    className="h-8 text-xs bg-background border-border"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invLast" className="text-xs font-medium text-foreground">Last Name *</Label>
                  <Input
                    id="invLast"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Jenkins"
                    className="h-8 text-xs bg-background border-border"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-xs font-medium text-foreground">Assigned Primary Role</Label>
                  <Select value={selectedRole} onValueChange={(val) => val && setSelectedRole(val as UserRole)}>
                    <SelectTrigger id="role" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UserRole.INTAKE_SPECIALIST}>Intake Specialist</SelectItem>
                      <SelectItem value={UserRole.CLINICAL_REVIEWER}>Clinical Reviewer</SelectItem>
                      <SelectItem value={UserRole.SCHEDULER}>Scheduler</SelectItem>
                      <SelectItem value={UserRole.NURSE_PRACTITIONER}>Nurse Practitioner (NP)</SelectItem>
                      <SelectItem value={UserRole.CLINICAL_COORDINATOR}>Clinical QA Coordinator</SelectItem>
                      <SelectItem value={UserRole.BILLING_COORDINATOR}>Billing Coordinator</SelectItem>
                      <SelectItem value={UserRole.OFFICE_MANAGER}>Office Manager</SelectItem>
                      <SelectItem value={UserRole.ADMIN}>System Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invSite" className="text-xs font-medium text-foreground">Geographic Site Scope</Label>
                  <Select value={site} onValueChange={(val) => setSite(val || 'ALL')}>
                    <SelectTrigger id="invSite" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="Select Site" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_SITES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invState" className="text-xs font-medium text-foreground">State Jurisdiction</Label>
                  <Select value={state} onValueChange={(val) => setState(val || 'ALL')}>
                    <SelectTrigger id="invState" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="Select State" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_STATES.map((st) => (
                        <SelectItem key={st.value} value={st.value}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsInviteOpen(false)} className="h-8 text-xs border-border">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => inviteMutation.mutate()}
                  disabled={!email || !firstName || !lastName || inviteMutation.isPending}
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs font-semibold"
                >
                  {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        <Card className="border border-border/80 bg-card shadow-xs overflow-hidden rounded-xl">
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message="Loading staff directory…" />
            ) : users.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No staff members registered"
                description="Invite healthcare personnel above to provision credentials and site scopes."
                actionLabel="Invite First User"
                onAction={() => setIsInviteOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">User</th>
                      <th className="py-2.5 px-4 font-semibold">Roles</th>
                      <th className="py-2.5 px-4 font-semibold">Scopes (Sites / States)</th>
                      <th className="py-2.5 px-4 font-semibold">Account Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-foreground">
                            {u.firstName} {u.lastName}
                          </span>
                          <div className="text-[11px] text-muted-foreground font-medium">{u.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {u.roles?.map((r: string) => (
                              <Badge key={r} variant="outline" className="text-[9px] font-semibold border-border bg-muted/50 text-foreground">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-medium text-[11px]">
                          {(() => {
                            const uSites = u.scopes?.map((s: any) => s.site).filter(Boolean) || [];
                            const uStates = u.scopes?.map((s: any) => s.state).filter(Boolean) || [];
                            const siteDisplay = uSites.length === 0 || uSites.includes('ALL') ? 'All Sites' : uSites.join(', ');
                            const stateDisplay = uStates.length === 0 || uStates.includes('ALL') ? 'All States' : uStates.join(', ');
                            return `${siteDisplay} (${stateDisplay})`;
                          })()}
                        </td>
                        <td className="py-3 px-4">
                          {u.isSuspended ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium  border border-rose-500/30 text-rose-700 dark:text-rose-400 bg-rose-500/10">
                              Suspended
                            </span>
                          ) : u.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium  border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium  border border-border text-muted-foreground bg-muted/40">
                              Pending Invite
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUserToEditScope(u);
                                const existingSite = u.scopes?.[0]?.site || 'ALL';
                                const existingState = u.scopes?.[0]?.state || 'ALL';
                                setEditSite(existingSite);
                                setEditState(existingState);
                              }}
                              className="h-7 text-xs px-2 font-medium text-foreground hover:bg-muted gap-1"
                              title="Edit user territory scopes"
                            >
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span>Scope</span>
                            </Button>

                            {!u.isActive ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={resendInviteMutation.isPending}
                                  onClick={() => resendInviteMutation.mutate(u.id)}
                                  className="h-7 text-xs px-2 font-medium text-primary hover:bg-primary/10 gap-1"
                                  title="Resend invitation email"
                                >
                                  <Send className="h-3 w-3" />
                                  <span>Resend</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setUserToDelete(u)}
                                  className="h-7 text-xs px-2 font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1"
                                  title="Cancel invitation and remove pending record"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Cancel</span>
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (!u.isSuspended) {
                                      setUserToSuspend(u);
                                    } else {
                                      toggleStatusMutation.mutate({
                                        id: u.id,
                                        isSuspended: false,
                                      });
                                    }
                                  }}
                                  className={`h-7 text-xs px-2.5 font-medium ${u.isSuspended
                                    ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
                                    : 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                                    }`}
                                >
                                  {u.isSuspended ? 'Reactivate' : 'Suspend'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={u.id === user?.id}
                                  onClick={() => setUserToDelete(u)}
                                  className="h-7 text-xs px-2 font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1 disabled:opacity-30"
                                  title={u.id === user?.id ? 'Cannot delete own account' : 'Delete user account'}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Suspension Confirmation Dialog */}
        <ConfirmDangerDialog
          open={!!userToSuspend}
          onOpenChange={(open) => !open && setUserToSuspend(null)}
          title="Suspend User Access"
          description={`Are you sure you want to suspend access for ${userToSuspend?.firstName} ${userToSuspend?.lastName}? This will immediately terminate all active sessions and revoke clinical & operational system access across all assigned sites.`}
          confirmText="Suspend User"
          cancelText="Cancel"
          variant="danger"
          isLoading={toggleStatusMutation.isPending}
          onConfirm={() => {
            if (userToSuspend) {
              toggleStatusMutation.mutate(
                { id: userToSuspend.id, isSuspended: true },
                { onSettled: () => setUserToSuspend(null) }
              );
            }
          }}
        />

        {/* User Deletion Confirmation Dialog */}
        <ConfirmDangerDialog
          open={!!userToDelete}
          onOpenChange={(open) => !open && setUserToDelete(null)}
          title={!userToDelete?.isActive ? "Cancel Invitation" : "Delete Staff Account"}
          description={
            !userToDelete?.isActive
              ? `Are you sure you want to cancel the invitation for ${userToDelete?.firstName} ${userToDelete?.lastName} (${userToDelete?.email})? The invitation link will be invalidated and this pending record will be permanently deleted.`
              : `Are you sure you want to delete ${userToDelete?.firstName} ${userToDelete?.lastName} (${userToDelete?.email})? All active sessions will be terminated immediately. If this staff member has clinical records, their audit history will be archived for HIPAA compliance.`
          }
          confirmText={!userToDelete?.isActive ? "Delete Invitation" : "Delete Account"}
          cancelText="Cancel"
          variant="danger"
          isLoading={deleteUserMutation.isPending}
          onConfirm={() => {
            if (userToDelete) {
              deleteUserMutation.mutate(userToDelete.id);
            }
          }}
        />

        {/* Edit Scope Modal Dialog */}
        <Dialog open={!!userToEditScope} onOpenChange={(open) => !open && setUserToEditScope(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <MapPin className="h-4 w-4 text-primary" />
                Configure Scopes & Territories
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set geographic site scope and state jurisdiction for {userToEditScope?.firstName} {userToEditScope?.lastName} ({userToEditScope?.email}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="editSite" className="text-xs font-medium text-foreground">
                  Geographic Site Scope
                </Label>
                <Select value={editSite} onValueChange={(val) => setEditSite(val || 'ALL')}>
                  <SelectTrigger id="editSite" className="h-8 w-full text-xs bg-background">
                    <SelectValue placeholder="Select Site Scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_SITES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Controls which clinic facilities and referrals this staff member can access.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editState" className="text-xs font-medium text-foreground">
                  State Jurisdiction
                </Label>
                <Select value={editState} onValueChange={(val) => setEditState(val || 'ALL')}>
                  <SelectTrigger id="editState" className="h-8 w-full text-xs bg-background">
                    <SelectValue placeholder="Select State Jurisdiction" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_STATES.map((st) => (
                      <SelectItem key={st.value} value={st.value}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Controls patient residence territory matching. Choose "All States" for national intake.
                </p>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUserToEditScope(null)}
                className="h-8 text-xs border-border"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={updateScopeMutation.isPending}
                onClick={() => {
                  if (userToEditScope) {
                    updateScopeMutation.mutate({
                      id: userToEditScope.id,
                      scopes: [
                        {
                          site: editSite,
                          state: editState,
                          legalEntity: 'heals_main',
                        },
                      ],
                    });
                  }
                }}
                className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs font-semibold"
              >
                {updateScopeMutation.isPending ? 'Saving…' : 'Save Scopes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
