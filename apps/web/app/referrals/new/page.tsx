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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Priority, UserRole } from '@heals/types';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  PlusCircle,
  Search,
  Check,
  ShieldAlert,
  X,
  AlertTriangle,
  UserCheck,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

// ─── Duplicate Patient Match Result ───────────────────────────────────────────
interface DuplicateMatch {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    medicalRecordNumber?: string;
    phone?: string;
    email?: string;
    city?: string;
    state?: string;
  };
  matchScore: number;
  matchLevel: 'EXACT' | 'HIGH_PROBABILITY' | 'POTENTIAL';
  matchReasons: string[];
}

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

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
    // Show selected patient card
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-primary/25 bg-primary/5 text-xs animate-in fade-in-50 duration-150">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20 shadow-2xs">
            {value.firstName[0]?.toUpperCase()}{value.lastName[0]?.toUpperCase()}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">
                {value.firstName} {value.lastName}
              </span>
              {value.medicalRecordNumber && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                  {value.medicalRecordNumber}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground text-[11px]">
              {value.dateOfBirth && (
                <span>DOB: {new Date(value.dateOfBirth).toLocaleDateString()}</span>
              )}
              {value.phone && <span>Phone: {value.phone}</span>}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          className="h-7 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0 border-border"
        >
          Change Patient
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type patient name, MRN, or phone number to search…"
          className="h-9.5 pl-9 pr-9 text-xs bg-background border-border/80 focus-visible:ring-primary/30"
          autoComplete="off"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {inputVal && !isFetching && (
            <button
              type="button"
              onClick={() => {
                setInputVal('');
                setOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
              aria-label="Clear search input"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && debounced.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {results.length === 0 && !isFetching ? (
            <div className="p-4 text-center space-y-1">
              <p className="text-xs font-medium text-foreground">
                No patients found for &ldquo;{debounced}&rdquo;
              </p>
              <p className="text-[11px] text-muted-foreground">
                Check spelling or switch to &ldquo;New Patient&rdquo; above to register them.
              </p>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y divide-border/40 overscroll-contain">
              <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground bg-muted/40 tracking-wider sticky top-0 backdrop-blur-md">
                Search Results ({results.length})
              </div>
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs hover:bg-accent/80 hover:text-accent-foreground transition-colors text-left group"
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur before click registers
                    handleSelect(p);
                  }}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px] group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {p.firstName[0]?.toUpperCase()}{p.lastName[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground group-hover:text-foreground flex items-center gap-2">
                      <span className="truncate">{p.firstName} {p.lastName}</span>
                      {p.medicalRecordNumber && (
                        <span className="inline-flex px-1.5 py-0.2 rounded text-[9px] font-mono bg-muted text-muted-foreground border border-border">
                          {p.medicalRecordNumber}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {[
                        p.dateOfBirth && `DOB: ${new Date(p.dateOfBirth).toLocaleDateString()}`,
                        p.phone,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Select &rarr;
                  </span>
                </button>
              ))}
            </div>
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

  // Duplicate patient resolution state
  const [detectedDuplicates, setDetectedDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // Preemptive duplicate search while entering demographics
  const debouncedFirst = useDebounce(firstName.trim(), 400);
  const debouncedLast = useDebounce(lastName.trim(), 400);
  const debouncedDob = useDebounce(dateOfBirth, 400);

  const { data: preemptiveDups } = useQuery<DuplicateMatch[]>({
    queryKey: ['check-duplicate-patient', debouncedFirst, debouncedLast, debouncedDob],
    queryFn: async () => {
      if (!debouncedFirst || !debouncedLast || !debouncedDob) return [];
      try {
        return await apiClient.post<DuplicateMatch[]>('/patients/check-duplicates', {
          firstName: debouncedFirst,
          lastName: debouncedLast,
          dateOfBirth: debouncedDob,
          ...(phone.trim() && { phone: phone.trim() }),
          ...(medicalRecordNumber.trim() && { medicalRecordNumber: medicalRecordNumber.trim() }),
        });
      } catch {
        return [];
      }
    },
    enabled: patientMode === 'new' && debouncedFirst.length >= 2 && debouncedLast.length >= 2 && Boolean(debouncedDob),
    staleTime: 30_000,
  });

  const createReferralMutation = useMutation({
    mutationFn: async (params?: { forceCreate?: boolean; overridePatientId?: string }) => {
      let resolvedPatientId: string;

      if (params?.overridePatientId) {
        resolvedPatientId = params.overridePatientId;
      } else if (patientMode === 'new') {
        // Only send fields the CreatePatientDto accepts
        const patientRes = await apiClient.post<{ id: string }>('/patients', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth,
          ...(phone.trim() && { phone: phone.trim() }),
          ...(email.trim() && { email: email.trim() }),
          ...(medicalRecordNumber.trim() && { medicalRecordNumber: medicalRecordNumber.trim() }),
          ...(params?.forceCreate && { forceCreate: true }),
        });
        resolvedPatientId = patientRes.id;
      } else {
        if (!selectedPatient) throw new Error('Please select an existing patient.');
        resolvedPatientId = selectedPatient.id;
      }

      // Resolve user's operational location scope
      const primarySite = user?.sites?.find((s: string) => s !== 'ALL' && s !== '*') || 'Site-A';
      const primaryState = user?.states?.find((s: string) => s !== 'ALL' && s !== '*') || 'CA';
      const primaryLegalEntity = user?.legalEntities?.find((e: string) => e !== 'ALL' && e !== '*') || 'legal-entity-1';

      return apiClient.post<{ id: string }>('/referrals', {
        patientId: resolvedPatientId,
        priority,
        site: primarySite,
        state: primaryState,
        legalEntity: primaryLegalEntity,
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
      queryClient.invalidateQueries({ queryKey: ['referrals-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      router.push(`/referrals/${data.id}`);
    },
    onError: (err: any) => {
      // Catch duplicate conflict and prompt interactive resolution dialog
      if (err.status === 409 && (err.data?.duplicates?.length > 0 || err.message?.includes('duplicate'))) {
        const dups: DuplicateMatch[] = err.data?.duplicates || [];
        setDetectedDuplicates(dups);
        setShowDuplicateDialog(true);
        return;
      }

      toast.error('Failed to Create Referral', {
        description: err.message || 'Please verify that all required fields are provided.',
      });
    },
  });

  const handleLinkExisting = (patient: DuplicateMatch['patient'] | PatientResult) => {
    setShowDuplicateDialog(false);
    setDetectedDuplicates(null);
    setPatientMode('existing');
    setSelectedPatient({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      medicalRecordNumber: patient.medicalRecordNumber,
      phone: patient.phone,
    });
    toast.info(`Selected existing patient: ${patient.firstName} ${patient.lastName}`, {
      description: 'Patient linked. Review classification details and click Submit Referral.',
    });
  };

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
          <Card className="border border-border/80 overflow-visible relative">
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

            <CardContent className="space-y-4 overflow-visible">
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

                  {/* Preemptive Duplicate Alert */}
                  {preemptiveDups && preemptiveDups.length > 0 && (
                    <div className="sm:col-span-2 p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs space-y-2 animate-in fade-in-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>Matching Patient Record Already Exists</span>
                        </div>
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/20 text-amber-900 dark:text-amber-200 text-[10px] font-bold">
                          {Math.round(preemptiveDups[0].matchScore * 100)}% Match • {preemptiveDups[0].matchLevel.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90">
                        A patient named <strong>{preemptiveDups[0].patient.firstName} {preemptiveDups[0].patient.lastName}</strong>
                        {preemptiveDups[0].patient.medicalRecordNumber ? ` (${preemptiveDups[0].patient.medicalRecordNumber})` : ''} born on {new Date(preemptiveDups[0].patient.dateOfBirth || dateOfBirth).toLocaleDateString()} is already registered in the system.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleLinkExisting(preemptiveDups[0].patient)}
                          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-2xs"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Use This Existing Patient</span>
                        </Button>
                        <span className="text-[10px] text-muted-foreground">
                          or continue below to review or force-create
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 min-h-[90px]">
                  <Label className="text-xs font-medium">Search Existing Patient *</Label>
                  <PatientSearchCombobox
                    value={selectedPatient}
                    onChange={setSelectedPatient}
                  />
                  {!selectedPatient && (
                    <p className="text-[11px] text-muted-foreground">
                      Type a patient name, MRN, or phone number to find existing medical records.
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

        {/* Interactive Duplicate Patient Resolution Dialog */}
        <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
          <DialogContent className="sm:max-w-md p-5 space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-full bg-amber-500/15 text-amber-600 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-sm font-bold text-foreground">
                    Potential Duplicate Patient Record
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    The demographics match an existing patient in the database.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] space-y-1">
                <span className="font-semibold text-muted-foreground block text-[10px] uppercase">
                  Candidate Demographics Entered
                </span>
                <div className="font-semibold text-foreground">{firstName} {lastName}</div>
                <div className="text-muted-foreground">
                  DOB: {dateOfBirth} {phone ? `• Phone: ${phone}` : ''} {medicalRecordNumber ? `• MRN: ${medicalRecordNumber}` : ''}
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-foreground text-[11px] block">
                  Existing Registered Patient:
                </span>
                {(detectedDuplicates && detectedDuplicates.length > 0
                  ? detectedDuplicates
                  : preemptiveDups || []
                ).slice(0, 2).map((dup, idx) => (
                  <div
                    key={dup.patient.id || idx}
                    className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">
                        {dup.patient.firstName} {dup.patient.lastName}
                      </span>
                      <Badge variant="outline" className="text-[9px] uppercase font-bold border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        {Math.round(dup.matchScore * 100)}% Match • {dup.matchLevel}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <div>
                        DOB: {dup.patient.dateOfBirth ? new Date(dup.patient.dateOfBirth).toLocaleDateString() : 'N/A'} • MRN: {dup.patient.medicalRecordNumber || 'Pending'}
                      </div>
                      {dup.patient.phone && <div>Phone: {dup.patient.phone}</div>}
                      {dup.matchReasons?.length > 0 && (
                        <div className="text-amber-800 dark:text-amber-300 font-medium text-[10px] pt-0.5">
                          Matched on: {dup.matchReasons.join(', ')}
                        </div>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setShowDuplicateDialog(false);
                        createReferralMutation.mutate({ overridePatientId: dup.patient.id });
                      }}
                      disabled={createReferralMutation.isPending}
                      className="w-full h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-2xs"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Link Referral to {dup.patient.firstName} {dup.patient.lastName} (Recommended)</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDuplicateDialog(false)}
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                Edit Demographics
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDuplicateDialog(false);
                  createReferralMutation.mutate({ forceCreate: true });
                }}
                disabled={createReferralMutation.isPending}
                className="text-xs h-8 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/10 gap-1"
                title="Only use if this is a confirmed separate individual with the same name and DOB"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Create as Separate Patient Record</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
