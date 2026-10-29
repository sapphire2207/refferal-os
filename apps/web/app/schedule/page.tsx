'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { canManageAppointments } from '@/lib/permissions';
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
import { Calendar, Clock, PlusCircle, CheckCircle, AlertTriangle, ArrowRight, RefreshCw, MapPin, Lock } from 'lucide-react';
import { PipelineStage } from '@heals/types';
import { toast } from 'sonner';

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canSchedule = canManageAppointments(user?.roles);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedReferralId, setSelectedReferralId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [location, setLocation] = useState('Patient Residence (Mobile Visit)');
  const [notes, setNotes] = useState('');
  const [apptToMarkNoShow, setApptToMarkNoShow] = useState<any | null>(null);

  // Fetch referrals ready for scheduling
  const { data: referralsData, isFetching: isFetchingReferrals } = useQuery<any>({
    queryKey: ['referrals', { pipelineStage: PipelineStage.SCHEDULING }],
    queryFn: () => apiClient.get<any>(`/referrals?pipelineStage=${PipelineStage.SCHEDULING}&limit=50`),
  });

  // Fetch existing appointments
  const { data: appointmentsRes, isLoading, refetch, isFetching: isFetchingAppts } = useQuery<any>({
    queryKey: ['appointments'],
    queryFn: () => apiClient.get<any>('/appointments'),
  });

  const schedulingQueue = extractApiList<any>(referralsData);
  const appointments = extractApiList<any>(appointmentsRes);

  // Book Appointment Mutation
  const bookMutation = useMutation({
    mutationFn: async () => {
      const ref = schedulingQueue.find((r: any) => r.id === selectedReferralId);
      if (!ref) throw new Error('Please select a valid referral');

      return apiClient.post('/appointments', {
        referralId: ref.id,
        patientId: ref.patientId,
        appointmentDate,
        location,
        notes,
      });
    },
    onSuccess: () => {
      toast.success('Appointment Booked Successfully');
      setIsBookingOpen(false);
      setSelectedReferralId('');
      setAppointmentDate('');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: (err: any) => {
      toast.error('Booking Failed', { description: err.message });
    },
  });

  // Update Appointment Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiClient.patch(`/appointments/${id}/status`, { status, notes }),
    onSuccess: (data, variables) => {
      toast.success(`Appointment status updated to ${variables.status}`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
    onError: (err: any) => {
      toast.error('Status Update Failed', { description: err.message });
    },
  });

  return (
    <AppLayout title="Appointment Scheduling">
      <div className="space-y-6">
        <PageHeader>
          <div>
            <PageHeaderHeading>Provider Dispatch & Scheduling</PageHeaderHeading>
            <PageHeaderDescription>
              Mobile NP visit coordination, territory dispatch, and confirmation gates
            </PageHeaderDescription>
          </div>
          <PageHeaderActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetch();
                queryClient.invalidateQueries({ queryKey: ['referrals'] });
              }}
              disabled={isFetchingAppts || isFetchingReferrals}
              className="h-8 gap-1.5 text-xs font-medium border-border"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetchingAppts ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            {canSchedule ? (
              <Button
                size="sm"
                onClick={() => setIsBookingOpen(!isBookingOpen)}
                className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isBookingOpen ? 'Close Dispatch Form' : 'Book Mobile Visit'}</span>
              </Button>
            ) : (
              <Badge variant="outline" className="h-8 px-2.5 gap-1.5 text-xs text-muted-foreground border-border bg-muted/30">
                <Lock className="h-3 w-3" />
                <span>View-Only Schedule</span>
              </Badge>
            )}
          </PageHeaderActions>
        </PageHeader>

        {/* Booking Form Drawer / Card */}
        {isBookingOpen && (
          <Card className="border border-border/80 bg-muted/20 shadow-xs animate-in fade-in-50">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold">Schedule Mobile Nurse Practitioner Visit</CardTitle>
              <CardDescription className="text-xs">
                Matches patient with available clinician in authorized site territory
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="referral" className="text-xs font-medium text-foreground">
                    Select Referral in SCHEDULING Stage *
                  </Label>
                  <Select
                    value={selectedReferralId}
                    onValueChange={(val) => setSelectedReferralId(val || '')}
                  >
                    <SelectTrigger id="referral" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="-- Choose referral --" />
                    </SelectTrigger>
                    <SelectContent>
                      {schedulingQueue.map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.trackingNumber} - {r.patient?.firstName} {r.patient?.lastName} ({r.site})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="aptDate" className="text-xs font-medium text-foreground">
                    Date & Time *
                  </Label>
                  <Input
                    id="aptDate"
                    type="datetime-local"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="h-8 text-xs bg-background border-border"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="loc" className="text-xs font-medium text-foreground">
                    Visit Location
                  </Label>
                  <Input
                    id="loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-8 text-xs bg-background border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-medium text-foreground">
                    Scheduling Notes / Instructions
                  </Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Ring buzzer 4B, caregiver present"
                    className="h-8 text-xs bg-background border-border"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsBookingOpen(false)} className="h-8 text-xs border-border">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => bookMutation.mutate()}
                  disabled={!selectedReferralId || !appointmentDate || bookMutation.isPending}
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs font-semibold"
                >
                  Confirm Appointment Booking
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Two-Column Grid: Left: Pending Queue, Right: Scheduled Appointments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Scheduling Queue */}
          <Card className="border border-border/80 bg-card shadow-2xs lg:col-span-1">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Awaiting Dispatch ({schedulingQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-semibold border-primary/20 bg-primary/10 text-primary">
                  SCHEDULING Stage
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {schedulingQueue.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No referrals to dispatch"
                  description="No clinical cases currently waiting for visit dispatch."
                  className="min-h-[220px] border-none bg-transparent"
                />
              ) : (
                <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
                  {schedulingQueue.map((ref: any) => (
                    <div key={ref.id} className="p-3.5 text-xs hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/referrals/${ref.id}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {ref.patient?.firstName} {ref.patient?.lastName}
                        </Link>
                        <span className="font-medium text-[10px] text-muted-foreground">
                          {ref.trackingNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-2 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {ref.site}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReferralId(ref.id);
                            setIsBookingOpen(true);
                          }}
                          className="h-6 text-[10px] px-2 border-border font-medium hover:bg-muted"
                        >
                          Book Visit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Booked Appointments List */}
          <Card className="border border-border/80 bg-card shadow-xs lg:col-span-2">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Scheduled Mobile Appointments
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Confirming an appointment advances the referral to NP_VISIT
                  </CardDescription>
                </div>
                <span className="text-xs text-muted-foreground font-medium tabular-nums">
                  {appointments.length} scheduled
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingState message="Loading scheduled encounters…" />
              ) : appointments.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No scheduled appointments"
                  description="Select a referral from the left dispatch queue to book a mobile encounter."
                  className="min-h-[220px] border-none bg-transparent"
                />
              ) : (
                <div className="divide-y divide-border/60">
                  {appointments.map((apt: any) => (
                    <div key={apt.id} className="p-4 hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          <span className="font-semibold text-foreground tabular-nums">
                            {new Date(apt.appointmentDate).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium  ${
                            apt.status === 'CONFIRMED'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                              : apt.status === 'NO_SHOW'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-muted text-muted-foreground border border-border'
                          }`}>
                            {apt.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1.5">
                          <span>Location: {apt.location || 'Mobile Visit'}</span>
                          {apt.referral && (
                            <>
                              <span> • </span>
                              <Link href={`/referrals/${apt.referral.id}`} className="hover:underline font-semibold text-primary">
                                Ref: {apt.referral.trackingNumber}
                              </Link>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        {canSchedule ? (
                          <>
                            {apt.status === 'SCHEDULED' && (
                              <Button
                                size="sm"
                                onClick={() => updateStatusMutation.mutate({ id: apt.id, status: 'CONFIRMED' })}
                                className="h-7 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs font-semibold"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Confirm (NP Visit)
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setApptToMarkNoShow(apt)}
                              className="h-7 text-[11px] text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 font-medium"
                            >
                              No Show
                            </Button>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic font-medium">
                            Dispatch locked
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Appointment No-Show Confirmation Dialog */}
        <ConfirmDangerDialog
          open={!!apptToMarkNoShow}
          onOpenChange={(open) => !open && setApptToMarkNoShow(null)}
          title="Mark Appointment as No-Show"
          description={`Marking the visit on ${apptToMarkNoShow?.appointmentDate ? new Date(apptToMarkNoShow.appointmentDate).toLocaleString() : 'scheduled date'} as NO_SHOW sets the referral work status to BLOCKED_NEEDS_INFO for patient outreach.`}
          confirmText="Confirm No-Show"
          cancelText="Cancel"
          variant="warning"
          requiresInput={true}
          inputLabel="Outreach Notes / Reason"
          inputPlaceholder="e.g. Patient not home / Unanswered door"
          initialInputValue="Patient not home at scheduled visit time"
          isLoading={updateStatusMutation.isPending}
          onConfirm={(reason) => {
            if (apptToMarkNoShow) {
              updateStatusMutation.mutate(
                {
                  id: apptToMarkNoShow.id,
                  status: 'NO_SHOW',
                  notes: reason || 'Patient not home',
                },
                { onSettled: () => setApptToMarkNoShow(null) }
              );
            }
          }}
        />
      </div>
    </AppLayout>
  );
}
