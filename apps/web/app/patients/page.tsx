'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient, extractApiList } from '@/lib/api-client';
import { AppLayout } from '@/components/app-layout';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/state-views';
import { Search, PlusCircle, Users, ArrowRight, RefreshCw } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

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
  const debouncedSearch = useDebounce(searchQuery, 350);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<any>({
    queryKey: ['patients', { search: debouncedSearch }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      params.set('limit', '50');
      return apiClient.get<any>(`/patients?${params.toString()}`);
    },
    staleTime: 60 * 1000,
  });

  const patients = extractApiList<PatientRecord>(data);

  return (
    <AppLayout title="Patients Directory">
      <div className="space-y-6">
        <PageHeader>
          <div>
            <PageHeaderHeading>Patient Master Directory</PageHeaderHeading>
            <PageHeaderDescription>
              Authorized clinical patient profiles and deduplication management
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
            <Link href="/referrals/new">
              <Button size="sm" className="h-8 gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium shadow-2xs">
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New Patient & Referral</span>
              </Button>
            </Link>
          </PageHeaderActions>
        </PageHeader>

        {/* Search & Counter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by patient name, MRN, phone, DOB..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-white border-border"
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {isLoading ? 'Querying registry...' : `${patients.length} patient record${patients.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Patients Table */}
        <Card className="border border-border/80 bg-card shadow-2xs">
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message="Loading patient records from registry..." />
            ) : isError ? (
              <ErrorState
                title="Could not load patient registry"
                message="An error occurred while communicating with the patient master database."
                onRetry={() => refetch()}
              />
            ) : patients.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No patients found"
                description={
                  searchQuery
                    ? `No patients match "${searchQuery}". Try searching with a different name or MRN.`
                    : 'No patients have been registered in this site yet. Create a referral to register a patient.'
                }
                actionLabel={searchQuery ? 'Clear Search' : 'New Referral'}
                onAction={searchQuery ? () => setSearchQuery('') : undefined}
                actionElement={
                  !searchQuery ? (
                    <Link href="/referrals/new">
                      <Button size="sm" className="h-8 text-xs">
                        Create New Referral
                      </Button>
                    </Link>
                  ) : null
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground uppercase text-[10px] tracking-wider">
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
                    {patients.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-foreground">{p.mrn || 'N/A'}</td>
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {p.firstName} {p.lastName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{p.dateOfBirth}</td>
                        <td className="py-3 px-4 text-muted-foreground">{p.phone || 'N/A'}</td>
                        <td className="py-3 px-4">
                          <span className="text-muted-foreground font-medium">{p.site} ({p.state})</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/patients/${p.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 hover:bg-zinc-100 font-medium">
                              View Profile
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
