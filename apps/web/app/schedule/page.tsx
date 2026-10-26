'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, Clock, PlusCircle, CheckCircle, AlertTriangle, ArrowRight, Loader2, User } from 'lucide-react';
import { PipelineStage } from '@heals/types';
import { toast } from 'sonner';

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedReferralId, setSelectedReferralId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [location, setLocation] = useState('Patient Residence (Mobile Visit)');
  const [notes, setNotes] = useState('');

  // Fetch referrals ready for scheduling
  const { data: referralsData } = useQuery<any>({
    queryKey: ['referrals', { stage: PipelineStage.SCHEDULING }],
    queryFn: () => apiClient.get<any>(`/referrals?stage=${PipelineStage.SCHEDULING}&limit=50`),
  });

  // Fetch existing appointments
  const { data: appointments = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['appointments'],
    queryFn: () => apiClient.get<any[]>('/appointments'),
  });

  const schedulingQueue = referralsData?.items || [];

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
      toast.success(`Appointment status: ${variables.status}`);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Provider Dispatch & Appointment Scheduling
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mobile NP visit coordination, territory dispatch, and confirmation gates
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setIsBookingOpen(!isBookingOpen)}
            className="h-8 gap-1.5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black text-xs font-semibold"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Book Mobile Visit</span>
          </Button>
        </div>

        {/* Booking Form Drawer / Card */}
        {isBookingOpen && (
          <Card className="border border-border/80 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Schedule Mobile Nurse Practitioner Visit</CardTitle>
              <CardDescription className="text-xs">
                Matches patient with available clinician in authorized site territory
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="referral" className="text-xs">
                    Select Referral in SCHEDULING Stage *
                  </Label>
                  <select
                    id="referral"
                    value={selectedReferralId}
                    onChange={(e) => setSelectedReferralId(e.target.value)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="">-- Choose referral --</option>
                    {schedulingQueue.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.trackingNumber} - {r.patient?.firstName} {r.patient?.lastName} ({r.site})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="aptDate" className="text-xs">
                    Date & Time *
                  </Label>
                  <Input
                    id="aptDate"
                    type="datetime-local"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="loc" className="text-xs">
                    Visit Location
                  </Label>
                  <Input
                    id="loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs">
                    Scheduling Notes / Instructions
                  </Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Ring buzzer 4B, caregiver present"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsBookingOpen(false)} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => bookMutation.mutate()}
                  disabled={!selectedReferralId || !appointmentDate || bookMutation.isPending}
                  className="h-8 text-xs bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black"
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
          <Card className="border border-border/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Awaiting Dispatch ({schedulingQueue.length})
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  SCHEDULING Stage
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {schedulingQueue.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No referrals currently waiting for scheduling.
                </div>
              ) : (
                <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
                  {schedulingQueue.map((ref: any) => (
                    <div key={ref.id} className="p-3 text-xs hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/referrals/${ref.id}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {ref.patient?.firstName} {ref.patient?.lastName}
                        </Link>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {ref.trackingNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                        <span>Site: {ref.site}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReferralId(ref.id);
                            setIsBookingOpen(true);
                          }}
                          className="h-6 text-[10px] px-2"
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
          <Card className="border border-border/80 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Scheduled Mobile Appointments
              </CardTitle>
              <CardDescription className="text-xs">
                Confirming an appointment advances the referral to NP_VISIT
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                  Loading appointments...
                </div>
              ) : appointments.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No appointments scheduled. Select a referral from the left queue to book.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {appointments.map((apt: any) => (
                    <div key={apt.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between text-xs gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-semibold text-foreground">
                            {new Date(apt.appointmentDate).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {apt.status}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          <span>Location: {apt.location || 'Mobile Visit'}</span>
                          {apt.referral && (
                            <>
                              <span> • </span>
                              <Link href={`/referrals/${apt.referral.id}`} className="hover:underline">
                                Ref: {apt.referral.trackingNumber}
                              </Link>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {apt.status === 'SCHEDULED' && (
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ id: apt.id, status: 'CONFIRMED' })}
                            className="h-7 text-[10px] bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Confirm (NP Visit)
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: apt.id, status: 'NO_SHOW', notes: 'Patient not home' })}
                          className="h-7 text-[10px] text-amber-600"
                        >
                          No Show
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
