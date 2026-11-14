'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-context';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/app-layout';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  mrn?: string;
  medicalRecordNumber?: string;
  email: string | null;
  phone: string | null;
  state?: string | null;
  createdAt: string;
}

export default function PatientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<{ data: Patient[]; total: number }>({
    queryKey: ['patients', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '50');
      return apiClient.get(`/patients?${params.toString()}`);
    },
    staleTime: 30000,
  });

  const patients = data?.data || [];

  return (
    <AppLayout title="Patients">
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Patient Directory</h1>
            <p className="text-sm text-muted-foreground">
              Search and manage patient records
            </p>
          </div>
          <Button onClick={() => router.push('/patients/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Patient
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, MRN, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Badge variant="secondary">{patients.length} patients</Badge>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name & Profile</TableHead>
                <TableHead>MRN</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Contact Phone</TableHead>
                <TableHead>Site / Territory</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {search ? 'No patients match your search' : 'No patients found'}
                  </TableCell>
                </TableRow>
              ) : (
                patients.map((patient) => {
                  const mrn = patient.mrn || patient.medicalRecordNumber || 'N/A';
                  return (
                    <TableRow key={patient.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => router.push(`/patients/${patient.id}`)}
                          className="font-semibold text-primary hover:underline text-left cursor-pointer"
                        >
                          {patient.firstName} {patient.lastName}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">{mrn}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(patient.dateOfBirth).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {patient.phone || 'N/A'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0.5">
                          {patient.state || 'CA'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/patients/${patient.id}`)}
                          className="text-xs text-primary hover:text-primary font-medium"
                        >
                          View Chart →
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
