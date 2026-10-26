'use client';

import React, { useState } from 'react';
import { useAuth } from '@/providers/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, KeyRound, ArrowRight, UserCheck } from 'lucide-react';
import { UserRole } from '@heals/types';

interface DemoPersona {
  label: string;
  role: string;
  email: string;
  workspaceDescription: string;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    label: 'Single-Role: Intake Specialist',
    role: 'INTAKE_SPECIALIST',
    email: 'intake@heals.health',
    workspaceDescription: 'Enters directly into Intake Workspace (no switcher)',
  },
  {
    label: 'Single-Role: Clinical Reviewer',
    role: 'CLINICAL_REVIEWER',
    email: 'reviewer@heals.health',
    workspaceDescription: 'Enters directly into Clinical Review Workspace',
  },
  {
    label: 'Single-Role: Scheduler',
    role: 'SCHEDULER',
    email: 'scheduler@heals.health',
    workspaceDescription: 'Enters directly into Appointment Scheduling Queue',
  },
  {
    label: 'Single-Role: Nurse Practitioner',
    role: 'NURSE_PRACTITIONER',
    email: 'np@heals.health',
    workspaceDescription: 'Enters directly into Mobile Encounters & SOAP Notes',
  },
  {
    label: 'Single-Role: Billing Coordinator',
    role: 'BILLING_COORDINATOR',
    email: 'billing@heals.health',
    workspaceDescription: 'Enters directly into Superbills & Claims Processing',
  },
  {
    label: 'System Administrator (Multi-Role)',
    role: 'ADMIN',
    email: 'admin@heals.health',
    workspaceDescription: 'Full access to all 9 workspaces with top-right switcher',
  },
];

export function LoginForm() {
  const { login, verifyMfa, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isMfaStep, setIsMfaStep] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isMfaStep) {
      if (!mfaCode.trim() || !sessionToken) {
        setErrorMessage('Please enter the 6-digit authentication code.');
        return;
      }
      try {
        await verifyMfa(email, mfaCode, sessionToken);
      } catch (err: any) {
        setErrorMessage(err.message || 'Invalid MFA code. Please try again.');
      }
      return;
    }

    try {
      const res = await login(email, password);
      if (res?.mfaRequired && res?.sessionToken) {
        setIsMfaStep(true);
        setSessionToken(res.sessionToken);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password.');
    }
  };

  const handleSelectPersona = (persona: DemoPersona) => {
    setEmail(persona.email);
    setPassword('Admin@2024!');
    setErrorMessage(null);
  };

  const handleQuickLogin = async (persona: DemoPersona) => {
    setEmail(persona.email);
    setPassword('Admin@2024!');
    setErrorMessage(null);
    try {
      await login(persona.email, 'Admin@2024!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed.');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <Card className="border border-border/80 shadow-md">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white dark:bg-white dark:text-black">
            <span className="font-extrabold text-base tracking-wider">H+W</span>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {isMfaStep ? 'Two-Factor Verification' : 'Clinical Portal Sign In'}
          </CardTitle>
          <CardDescription>
            {isMfaStep
              ? 'Enter the 6-digit verification code from your authenticator app'
              : 'Heals on Wheels Referral Operating System & Clinical Workflow'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isMfaStep ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="staff@heals.health"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      (All test accounts: Admin@2024!)
                    </span>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-10"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="mfaCode">Authenticator Code / TOTP</Label>
                <div className="relative">
                  <Input
                    id="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    maxLength={8}
                    disabled={isLoading}
                    className="h-11 text-center font-mono text-lg tracking-widest pl-10"
                  />
                  <KeyRound className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Or enter an 8-character emergency backup recovery code.
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 font-medium bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : isMfaStep ? (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Confirm & Access Workspace
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {isMfaStep && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => {
                  setIsMfaStep(false);
                  setSessionToken(null);
                }}
              >
                Back to credentials
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Quick 1-Click Role Logins for testing and review */}
      <Card className="border border-border/80 bg-card shadow-sm">
        <CardHeader className="py-3 px-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              ⚡ Quick 1-Click Test Logins
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              PW: Admin@2024!
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-3 space-y-2">
          {DEMO_PERSONAS.map((persona) => (
            <div
              key={persona.email}
              className="p-2.5 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-foreground truncate">
                  {persona.label}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground truncate">
                  {persona.email}
                </span>
                <span className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                  {persona.workspaceDescription}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectPersona(persona)}
                  className="h-7 text-[10px] px-2"
                  disabled={isLoading}
                >
                  Fill
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleQuickLogin(persona)}
                  className="h-7 text-[10px] px-2.5 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black font-semibold"
                  disabled={isLoading}
                >
                  Sign In
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
