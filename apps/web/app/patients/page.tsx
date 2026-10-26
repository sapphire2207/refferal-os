'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, PlusCircle, Users, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

interface PatientRecord {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  gender: string;
  site: string;
  state: string;
  referrals?: any[];
  createdAt: string;
}

export default function PatientsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: PatientRecord[];
    total: number;
  }>({
    queryKey: ['patients', { search: searchQuery }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', '50');
      return apiClient.get<{ items: PatientRecord[]; total: number }>(`/patients?${params.toString()}`);
    },
    staleTime: 60 * 1000,
  });

  const patients = data?.items || [];

  return (
    <AppLayout title="Patients Directory">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Patient Master Directory
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authorized clinical patient profiles and deduplication management
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
            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-xs">
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New Patient & Referral</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by patient name, MRN, phone, DOB..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {isLoading ? 'Loading...' : `${patients.length} patients registered`}
          </span>
        </div>

        {/* Patients Table */}
        <Card className="border border-border/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">MRN</th>
                    <th className="py-2.5 px-4 font-semibold">Full Name</th>
                    <th className="py-2.5 px-4 font-semibold">Date of Birth</th>
                    <th className="py-2.5 px-4 font-semibold">Contact Phone</th>
                    <th className="py-2.5 px-4 font-semibold">Site / State</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading patient records...
                      </td>
                    </tr>
                  ) : patients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-muted-foreground">
                        No patients found. Create a new referral to add patients.
                      </td>
                    </tr>
                  ) : (
                    patients.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium">{p.mrn || 'N/A'}</td>
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {p.firstName} {p.lastName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{p.dateOfBirth}</td>
                        <td className="py-3 px-4 text-muted-foreground">{p.phone || 'N/A'}</td>
                        <td className="py-3 px-4">
                          <span className="text-muted-foreground">{p.site} ({p.state})</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/patients/${p.id}`}>
                            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2">
                              View Profile
                              <ArrowRight className="h-2.5 w-2.5 ml-1" />
                            </Button>
                          </Link>
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
