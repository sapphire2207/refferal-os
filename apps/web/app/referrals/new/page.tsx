'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-context';
import { canCreateReferrals } from '@/lib/permissions';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Priority, UserRole } from '@heals/types';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, PlusCircle, Search, Check, ShieldAlert, X } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

// ─── Patient search combobox ───────────────────────────────────────────────────
interface PatientResult {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  medicalRecordNumber?: string;
  phone?: string;
}

function PatientSearchCombobox({
  value,
  onChange,
}: {
  value: PatientResult | null;
  onChange: (p: PatientResult | null) => void;
}) {
  const [inputVal, setInputVal] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(inputVal, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery<any>({
    queryKey: ['patient-search', debounced],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set('search', debounced.trim());
      params.set('limit', '10');
      return apiClient.get<any>(`/patients?${params.toString()}`);
    },
    enabled: debounced.trim().length >= 1,
    staleTime: 30_000,
  });

  const results: PatientResult[] = extractApiList<PatientResult>(data);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (patient: PatientResult) => {
    onChange(patient);
    setInputVal('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setInputVal('');
  };

  if (value) {
    // Show selected patient pill
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/40 text-xs">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[9px]">
          {value.firstName[0]}{value.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-foreground truncate">{value.firstName} {value.lastName}</span>
          {value.medicalRecordNumber && (
            <span className="ml-2 text-muted-foreground tabular-nums">{value.medicalRecordNumber}</span>
          )}
          {value.dateOfBirth && (
            <span className="ml-2 text-muted-foreground">
              DOB: {new Date(value.dateOfBirth).toLocaleDateString()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear patient selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name, MRN, or phone…"
          className="h-9 pl-8 text-xs"
          autoComplete="off"
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && debounced.trim().length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {results.length === 0 && !isFetching ? (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              No patients found for &ldquo;{debounced}&rdquo;
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y divide-border/60">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-muted/60 transition-colors text-left"
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent blur before select
                      handleSelect(p);
                    }}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[9px]">
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-muted-foreground tabular-nums truncate">
                        {[
                          p.medicalRecordNumber && `MRN: ${p.medicalRecordNumber}`,
                          p.dateOfBirth && `DOB: ${new Date(p.dateOfBirth).toLocaleDateString()}`,
                          p.phone,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <Check className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function NewReferralPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canCreate = canCreateReferrals(user?.roles);

  const [patientMode, setPatientMode] = useState<'existing' | 'new'>('new');

  // New patient fields (only what the API accepts)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [medicalRecordNumber, setMedicalRecordNumber] = useState('');
  const [email, setEmail] = useState('');

  // Existing patient selection
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

  // Referral fields (only what CreateReferralDto accepts)
  const [priority, setPriority] = useState<Priority>(Priority.ROUTINE);
  const [referralSource, setReferralSource] = useState('');
  const [referringProvider, setReferringProvider] = useState('');
  const [referringFacility, setReferringFacility] = useState('');
  const [insurancePayer, setInsurancePayer] = useState('');
  const [notes, setNotes] = useState('');

  const createReferralMutation = useMutation({
    mutationFn: async () => {
      let resolvedPatientId: string;

      if (patientMode === 'new') {
        // Only send fields the CreatePatientDto accepts
        const patientRes = await apiClient.post<{ id: string }>('/patients', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth,
          ...(phone.trim() && { phone: phone.trim() }),
          ...(email.trim() && { email: email.trim() }),
          ...(medicalRecordNumber.trim() && { medicalRecordNumber: medicalRecordNumber.trim() }),
        });
        resolvedPatientId = patientRes.id;
      } else {
        if (!selectedPatient) throw new Error('Please select an existing patient.');
        resolvedPatientId = selectedPatient.id;
      }

      // Only send fields CreateReferralDto accepts — no site/state/legalEntity (those are scoped to user)
      return apiClient.post<{ id: string }>('/referrals', {
        patientId: resolvedPatientId,
        priority,
        ...(referralSource.trim() && { referralSource: referralSource.trim() }),
        ...(referringProvider.trim() && { referringProvider: referringProvider.trim() }),
        ...(referringFacility.trim() && { referringFacility: referringFacility.trim() }),
        ...(insurancePayer.trim() && { insurancePayer: insurancePayer.trim() }),
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
    if (patientMode === 'new') {
      if (!firstName.trim() || !lastName.trim() || !dateOfBirth) {
        toast.error('Missing Patient Demographics', {
          description: 'First name, last name, and date of birth are required.',
        });
        return;
      }
    } else {
      if (!selectedPatient) {
        toast.error('No Patient Selected', {
          description: 'Please search and select an existing patient.',
        });
        return;
      }
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
          {/* ── Patient Identification ─────────────────────────────── */}
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
                {/* Mode toggle */}
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
                    Existing Patient
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {patientMode === 'new' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs">First Name *</Label>
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
                    <Label htmlFor="lastName" className="text-xs">Last Name *</Label>
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
                    <Label htmlFor="dob" className="text-xs">Date of Birth *</Label>
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
                    <Label htmlFor="phone" className="text-xs">Phone Number</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 234-5678"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mrn" className="text-xs">MRN (Medical Record #)</Label>
                    <Input
                      id="mrn"
                      value={medicalRecordNumber}
                      onChange={(e) => setMedicalRecordNumber(e.target.value)}
                      placeholder="MRN-8921"
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs">Patient Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="patient@example.com"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Search Existing Patient *</Label>
                  <PatientSearchCombobox
                    value={selectedPatient}
                    onChange={setSelectedPatient}
                  />
                  {!selectedPatient && (
                    <p className="text-[11px] text-muted-foreground">
                      Type a name, MRN, or phone number to search registered patients.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Referral Classification ────────────────────────────── */}
          <Card className="border border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                2. Referral Classification
              </CardTitle>
              <CardDescription className="text-xs">
                Clinical urgency, referring provider, and insurance details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="priority" className="text-xs">Clinical Priority</Label>
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
                  <Label htmlFor="referralSource" className="text-xs">Referral Source</Label>
                  <Input
                    id="referralSource"
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    placeholder="e.g. Mount Sinai Care Coordination"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="referringProvider" className="text-xs">Referring Provider</Label>
                  <Input
                    id="referringProvider"
                    value={referringProvider}
                    onChange={(e) => setReferringProvider(e.target.value)}
                    placeholder="Dr. John Smith"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="referringFacility" className="text-xs">Referring Facility</Label>
                  <Input
                    id="referringFacility"
                    value={referringFacility}
                    onChange={(e) => setReferringFacility(e.target.value)}
                    placeholder="Metro General Hospital"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="insurancePayer" className="text-xs">Insurance Payer</Label>
                  <Input
                    id="insurancePayer"
                    value={insurancePayer}
                    onChange={(e) => setInsurancePayer(e.target.value)}
                    placeholder="Blue Cross Blue Shield"
                    className="h-8 text-xs"
                  />
                </div>
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
