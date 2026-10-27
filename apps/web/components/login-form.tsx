'use client';

import React, { useState } from 'react';
import { useAuth } from '@/providers/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  UserCheck,
  Copy,
  Check,
  Sparkles,
  Stethoscope,
  Calendar,
  Activity,
  CreditCard,
  Lock,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface DemoPersona {
  name: string;
  roleTitle: string;
  roleCode: string;
  email: string;
  workspaceDescription: string;
  icon: React.ComponentType<{ className?: string }>;
  tag: string;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    name: 'System Administrator',
    roleTitle: 'Full Administrator',
    roleCode: 'ADMIN',
    email: 'admin@heals.health',
    workspaceDescription: 'Full access to all 9 workspaces with top-right switcher',
    icon: ShieldCheck,
    tag: 'Multi-Role',
  },
  {
    name: 'Sarah Johnson',
    roleTitle: 'Intake Specialist',
    roleCode: 'INTAKE_SPECIALIST',
    email: 'intake@heals.health',
    workspaceDescription: 'Enters directly into Intake & Screening Workspace',
    icon: UserCheck,
    tag: 'Single-Role',
  },
  {
    name: 'Dr. Michael Chen',
    roleTitle: 'Clinical Reviewer',
    roleCode: 'CLINICAL_REVIEWER',
    email: 'reviewer@heals.health',
    workspaceDescription: 'Enters directly into Clinical Review & Approval Queue',
    icon: Stethoscope,
    tag: 'Single-Role',
  },
  {
    name: 'Emily Rodriguez',
    roleTitle: 'Scheduler',
    roleCode: 'SCHEDULER',
    email: 'scheduler@heals.health',
    workspaceDescription: 'Enters directly into Visit Dispatch & Scheduling Queue',
    icon: Calendar,
    tag: 'Single-Role',
  },
  {
    name: 'NP Jessica Williams',
    roleTitle: 'Nurse Practitioner',
    roleCode: 'NURSE_PRACTITIONER',
    email: 'np@heals.health',
    workspaceDescription: 'Enters directly into Mobile Encounters & SOAP Notes',
    icon: Activity,
    tag: 'Single-Role',
  },
  {
    name: 'David Martinez',
    roleTitle: 'Billing Coordinator',
    roleCode: 'BILLING_COORDINATOR',
    email: 'billing@heals.health',
    workspaceDescription: 'Enters directly into Superbills & Claims Adjudication',
    icon: CreditCard,
    tag: 'Single-Role',
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
  const [activeSigningEmail, setActiveSigningEmail] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const copyPasswordToClipboard = () => {
    navigator.clipboard.writeText('Admin@2024!');
    setCopiedPassword(true);
    toast.success('Password copied: Admin@2024!');
    setTimeout(() => setCopiedPassword(false), 2000);
  };

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
    toast.info(`Filled credentials for ${persona.name}`);
  };

  const handleQuickLogin = async (persona: DemoPersona) => {
    setEmail(persona.email);
    setPassword('Admin@2024!');
    setErrorMessage(null);
    setActiveSigningEmail(persona.email);

    try {
      await login(persona.email, 'Admin@2024!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check backend connection.');
    } finally {
      setActiveSigningEmail(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Clinical Sign-In Card */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="border border-border/80 shadow-md bg-card">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white dark:bg-white dark:text-black shadow-sm">
              <span className="font-extrabold text-base tracking-wider">H+W</span>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {isMfaStep ? 'Two-Factor Verification' : 'Clinical Portal Sign In'}
            </CardTitle>
            <CardDescription className="text-xs">
              {isMfaStep
                ? 'Enter the 6-digit verification code from your authenticator app'
                : 'Heals on Wheels Referral Operating System'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isMfaStep ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold">
                      Work Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="staff@heals.health"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading || !!activeSigningEmail}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-semibold">
                        Password
                      </Label>
                      <button
                        type="button"
                        onClick={copyPasswordToClipboard}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono transition-colors"
                      >
                        {copiedPassword ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        Admin@2024!
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading || !!activeSigningEmail}
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="mfaCode" className="text-xs font-semibold">
                    Authenticator Code / TOTP
                  </Label>
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
                      className="h-10 text-center font-mono text-lg tracking-widest pl-10"
                    />
                    <KeyRound className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Enter the 6-digit code or an 8-character emergency backup recovery code.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-10 font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors"
                disabled={isLoading || !!activeSigningEmail}
              >
                {isLoading && !activeSigningEmail ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
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

            <div className="pt-2 border-t border-border/50 text-center">
              <span className="text-[11px] text-muted-foreground">
                All accounts share password:{' '}
                <strong className="font-mono text-foreground">Admin@2024!</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: ⚡ 1-Click Persona Quick Logins */}
      <div className="lg:col-span-7 space-y-3">
        <Card className="border border-border/80 shadow-md bg-card">
          <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                  <Zap className="h-3.5 w-3.5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    ⚡ Instant 1-Click Test Logins
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Click any role below to enter its workspace instantly
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyPasswordToClipboard}
                className="h-7 text-[11px] font-mono gap-1.5 px-2.5 bg-background shadow-xs hover:bg-muted"
              >
                {copiedPassword ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>PW: Admin@2024!</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {DEMO_PERSONAS.map((persona) => {
              const Icon = persona.icon;
              const isCurrentSigning = activeSigningEmail === persona.email;
              const isOtherSigning = !!activeSigningEmail && !isCurrentSigning;

              return (
                <div
                  key={persona.email}
                  className="group relative p-2.5 rounded-lg border border-border/70 bg-card hover:bg-muted/40 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background text-foreground group-hover:border-foreground/40 transition-colors">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {persona.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 font-medium ${
                            persona.tag === 'Multi-Role'
                              ? 'border-indigo-500/40 bg-indigo-50/50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                              : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                          }`}
                        >
                          {persona.roleTitle}
                        </Badge>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate">
                        {persona.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                        {persona.workspaceDescription}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectPersona(persona)}
                      className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                      disabled={isLoading || isCurrentSigning || isOtherSigning}
                    >
                      Fill
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleQuickLogin(persona)}
                      className="h-7 text-[11px] px-2.5 font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                      disabled={isLoading || isCurrentSigning || isOtherSigning}
                    >
                      {isCurrentSigning ? (
                        <>
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Quick Hint Card */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <strong className="text-foreground font-semibold">Testing tip:</strong> Single-role users
            (Intake, Reviewer, Scheduler, NP, Billing) auto-load directly into their dedicated
            workspace. The <strong className="text-foreground">System Administrator</strong> account activates the
            top-right workspace switcher for all 9 operational queues.
          </div>
        </div>
      </div>
    </div>
  );
}
