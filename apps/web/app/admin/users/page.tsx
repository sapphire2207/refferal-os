'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, UserPlus, ShieldAlert, CheckCircle, Ban, Loader2, RefreshCw } from 'lucide-react';
import { UserRole } from '@heals/types';
import { toast } from 'sonner';

export default function UsersAdminPage() {
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Invite Form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.INTAKE_SPECIALIST);
  const [site, setSite] = useState('SITE-NYC');
  const [state, setState] = useState('NY');

  // Fetch users list
  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: any[];
    total: number;
  }>({
    queryKey: ['users'],
    queryFn: () => apiClient.get<{ items: any[]; total: number }>('/users?limit=50'),
  });

  const users = data?.items || [];

  // Invite User Mutation
  const inviteMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/users/invite', {
        email,
        firstName,
        lastName,
        roles: [selectedRole],
        sites: [site],
        states: [state],
        legalEntities: ['LE-HEALS-NY'],
      }),
    onSuccess: () => {
      toast.success('Invitation Sent with Cryptographic Token!');
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

  return (
    <AppLayout title="User Management & Scopes">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              User Provisioning & Geographic Scoping
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Role assignment, site territorial bounds, and instant session revocation enforcement
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsInviteOpen(!isInviteOpen)}
              className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Invite New Staff</span>
            </Button>
          </div>
        </div>

        {/* Invite Staff Form Drawer */}
        {isInviteOpen && (
          <Card className="border border-border/80 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Invite Healthcare Staff Member</CardTitle>
              <CardDescription className="text-xs">
                Generates secure invite token with role-based and geographic location scopes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invEmail" className="text-xs">Work Email *</Label>
                  <Input
                    id="invEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinician@healsonwheels.com"
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invFirst" className="text-xs">First Name *</Label>
                  <Input
                    id="invFirst"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Sarah"
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invLast" className="text-xs">Last Name *</Label>
                  <Input
                    id="invLast"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Jenkins"
                    className="h-8 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-xs">Assigned Primary Role</Label>
                  <select
                    id="role"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value={UserRole.INTAKE_SPECIALIST}>Intake Specialist</option>
                    <option value={UserRole.CLINICAL_REVIEWER}>Clinical Reviewer</option>
                    <option value={UserRole.SCHEDULER}>Scheduler</option>
                    <option value={UserRole.NURSE_PRACTITIONER}>Nurse Practitioner (NP)</option>
                    <option value={UserRole.CLINICAL_COORDINATOR}>Clinical QA Coordinator</option>
                    <option value={UserRole.BILLING_COORDINATOR}>Billing Coordinator</option>
                    <option value={UserRole.OFFICE_MANAGER}>Office Manager</option>
                    <option value={UserRole.ADMIN}>System Administrator</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invSite" className="text-xs">Geographic Site Scope</Label>
                  <select
                    id="invSite"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="SITE-NYC">SITE-NYC (New York City)</option>
                    <option value="SITE-ALB">SITE-ALB (Albany)</option>
                    <option value="SITE-BUF">SITE-BUF (Buffalo)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invState" className="text-xs">State Jurisdiction</Label>
                  <select
                    id="invState"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="NY">New York (NY)</option>
                    <option value="NJ">New Jersey (NJ)</option>
                    <option value="CT">Connecticut (CT)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsInviteOpen(false)} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => inviteMutation.mutate()}
                  disabled={!email || !firstName || !lastName || inviteMutation.isPending}
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs font-medium"
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        <Card className="border border-border/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">User</th>
                    <th className="py-2.5 px-4 font-semibold">Roles</th>
                    <th className="py-2.5 px-4 font-semibold">Scopes (Sites / States)</th>
                    <th className="py-2.5 px-4 font-semibold">Account Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading staff roster...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        No users returned.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-foreground">
                            {u.firstName} {u.lastName}
                          </span>
                          <div className="text-[11px] text-muted-foreground font-mono">{u.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {u.roles?.map((r: string) => (
                              <Badge key={r} variant="outline" className="text-[9px] font-mono">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                          {u.sites?.join(', ') || 'All'} ({u.states?.join(', ') || 'NY'})
                        </td>
                        <td className="py-3 px-4">
                          {u.isSuspended ? (
                            <Badge variant="destructive" className="text-[10px]">
                              Suspended
                            </Badge>
                          ) : u.isActive ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Pending Invite
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                !u.isSuspended &&
                                !window.confirm(
                                  `Are you sure you want to suspend ${u.firstName} ${u.lastName}? This will immediately terminate all active sessions and revoke access.`,
                                )
                              ) {
                                return;
                              }
                              toggleStatusMutation.mutate({
                                id: u.id,
                                isSuspended: !u.isSuspended,
                              });
                            }}
                            className={`h-6 text-[10px] px-2 ${
                              u.isSuspended ? 'text-emerald-600' : 'text-destructive hover:bg-destructive/10'
                            }`}
                          >
                            {u.isSuspended ? 'Reactivate' : 'Suspend (Kill Sessions)'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
