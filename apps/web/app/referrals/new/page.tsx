'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { canCreateReferrals } from '@/lib/permissions';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Priority, UserRole } from '@heals/types';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, PlusCircle, AlertCircle, ShieldAlert } from 'lucide-react';

export default function NewReferralPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canCreate = canCreateReferrals(user?.roles);

  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('new');

  // Patient Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('UNSPECIFIED');
  const [phone, setPhone] = useState('');
  const [ssn, setSsn] = useState('');
  const [mrn, setMrn] = useState('');
  const [patientId, setPatientId] = useState('');

  // Referral Fields
  const [priority, setPriority] = useState<Priority>(Priority.ROUTINE);
  const [site, setSite] = useState('SITE-NYC');
  const [state, setState] = useState('NY');
  const [legalEntity, setLegalEntity] = useState('LE-HEALS-NY');
  const [referralSource, setReferralSource] = useState('Metro Hospital Care Coordinator');
  const [notes, setNotes] = useState('');

  const createReferralMutation = useMutation({
    mutationFn: async () => {
      let resolvedPatientId = patientId;

      // If new patient mode, create patient first
      if (patientMode === 'new') {
        const patientRes = await apiClient.post<{ id: string }>('/patients', {
          firstName,
          lastName,
          dateOfBirth,
          gender,
          phone,
          ssn: ssn || undefined,
          mrn: mrn || `MRN-${Date.now().toString().slice(-6)}`,
          site,
          state,
          legalEntity,
        });
        resolvedPatientId = patientRes.id;
      }

      // Create referral in INTAKE stage
      return apiClient.post<{ id: string }>('/referrals', {
        patientId: resolvedPatientId,
        priority,
        site,
        state,
        legalEntity,
        referralSource,
        notes,
      });
    },
    onSuccess: (data) => {
      toast.success('Referral Created Successfully', {
        description: 'Referral is now in INTAKE stage awaiting document verification.',
      });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      router.push(`/referrals/${data.id}`);
    },
    onError: (err: any) => {
      toast.error('Failed to Create Referral', {
        description: err.message || 'Please verify that all required fields are provided.',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patientMode === 'new' && (!firstName || !lastName || !dateOfBirth || !phone)) {
      toast.error('Missing Patient Demographics', {
        description: 'First name, last name, date of birth, and phone number are required.',
      });
      return;
    }
    createReferralMutation.mutate();
  };

  if (!canCreate) {
    return (
      <AppLayout title="Access Restricted">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
          <div className="p-3 bg-amber-500/10 text-amber-600 rounded-full">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Intake Creation Restricted</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Initiating and enrolling inbound patient referrals requires Intake Specialist or Office Operations credentials.
            </p>
          </div>
          <Link href="/referrals">
            <Button size="sm" variant="outline" className="text-xs">
              Return to Pipeline
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="New Clinical Referral">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 border-b border-border/60 pb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="h-8 px-2 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Create Inbound Referral
            </h1>
            <p className="text-xs text-muted-foreground">
              Initiates intake workflow in compliance with HIPAA scoping and OCC version tracking
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Information Section */}
          <Card className="border border-border/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    1. Patient Identification
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Demographic profile and MRN tracking
                  </CardDescription>
                </div>
                <div className="flex bg-muted/60 p-0.5 rounded-md text-xs">
                  <button
                    type="button"
                    onClick={() => setPatientMode('new')}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      patientMode === 'new' ? 'bg-background shadow-2xs font-semibold' : 'text-muted-foreground'
                    }`}
                  >
                    New Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientMode('existing')}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      patientMode === 'existing' ? 'bg-background shadow-2xs font-semibold' : 'text-muted-foreground'
                    }`}
                  >
                    Existing ID
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {patientMode === 'new' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs">
                      First Name *
                    </Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs">
                      Last Name *
                    </Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dob" className="text-xs">
                      Date of Birth *
                    </Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs">
                      Phone Number *
                    </Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 234-5678"
                      required
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mrn" className="text-xs">
                      MRN (Medical Record #)
                    </Label>
                    <Input
                      id="mrn"
                      value={mrn}
                      onChange={(e) => setMrn(e.target.value)}
                      placeholder="MRN-8921"
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ssn" className="text-xs">
                      SSN (Last 4 or Full)
                    </Label>
                    <Input
                      id="ssn"
                      value={ssn}
                      onChange={(e) => setSsn(e.target.value)}
                      placeholder="XXX-XX-1234"
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="patientId" className="text-xs">
                    Patient UUID
                  </Label>
                  <Input
                    id="patientId"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="Enter existing patient UUID"
                    required
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clinical & Scoping Details */}
          <Card className="border border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                2. Referral Classification & Scope
              </CardTitle>
              <CardDescription className="text-xs">
                Clinical urgency, assigned location, and source
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="priority" className="text-xs">
                    Clinical Priority
                  </Label>
                  <Select value={priority} onValueChange={(val) => val && setPriority(val as Priority)}>
                    <SelectTrigger id="priority" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="Select Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Priority.ROUTINE}>Routine (Standard)</SelectItem>
                      <SelectItem value={Priority.URGENT}>Urgent (Within 48h)</SelectItem>
                      <SelectItem value={Priority.STAT}>STAT (Immediate)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="site" className="text-xs">
                    Operational Site
                  </Label>
                  <Select value={site} onValueChange={(val) => setSite(val || 'SITE-NYC')}>
                    <SelectTrigger id="site" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="Select Site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SITE-NYC">SITE-NYC (New York City)</SelectItem>
                      <SelectItem value="SITE-ALB">SITE-ALB (Albany)</SelectItem>
                      <SelectItem value="SITE-BUF">SITE-BUF (Buffalo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="state" className="text-xs">
                    State Jurisdiction
                  </Label>
                  <Select value={state} onValueChange={(val) => setState(val || 'NY')}>
                    <SelectTrigger id="state" className="h-8 w-full text-xs bg-background">
                      <SelectValue placeholder="Select State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NY">New York (NY)</SelectItem>
                      <SelectItem value="NJ">New Jersey (NJ)</SelectItem>
                      <SelectItem value="CT">Connecticut (CT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="referralSource" className="text-xs">
                  Referral Source / Coordinator
                </Label>
                <Input
                  id="referralSource"
                  value={referralSource}
                  onChange={(e) => setReferralSource(e.target.value)}
                  placeholder="e.g. Mount Sinai Care Coordination"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Initial Clinical Notes / Reason for Referral
                </Label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Document primary diagnosis, mobility restrictions, homebound reason…"
                  className="w-full rounded-md border border-border/80 bg-background p-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.back()}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createReferralMutation.isPending}
              className="h-9 px-5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold gap-1.5 shadow-xs"
            >
              {createReferralMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                <>
                  <PlusCircle className="h-3.5 w-3.5" />
                  Submit Referral
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
