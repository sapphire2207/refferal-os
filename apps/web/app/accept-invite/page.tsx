'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

function AcceptInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error('Invalid invite link', {
        description: 'No invitation token found. Please use the link from your email.',
      });
    }
  }, [token]);

  const passwordStrength = (() => {
    if (!password) return { label: '', color: '' };
    const checks = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /[a-z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ];
    const score = checks.filter(Boolean).length;
    if (score <= 2) return { label: 'Weak', color: 'bg-rose-500' };
    if (score === 3) return { label: 'Fair', color: 'bg-amber-500' };
    if (score === 4) return { label: 'Good', color: 'bg-blue-500' };
    return { label: 'Strong', color: 'bg-emerald-500' };
  })();

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit =
    token &&
    password.length >= 8 &&
    password === confirmPassword &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await apiClient.post<any>('/auth/invitations/accept', {
        token,
        password,
      });

      // Auto-login after accepting — store tokens and redirect
      if (result?.accessToken && result?.user) {
        apiClient.setTokens(result.accessToken, result.refreshToken);
        setDone(true);
        toast.success(`Welcome, ${result.user.firstName}! Your account is active.`);

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.replace('/dashboard');
        }, 1500);
      }
    } catch (err: any) {
      toast.error('Activation Failed', {
        description: err?.message ?? 'Invitation token may be invalid or expired.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <div className="flex justify-center">
              <div className="p-3 rounded-full bg-rose-500/10 text-rose-600">
                <AlertCircle className="h-8 w-8" />
              </div>
            </div>
            <h2 className="text-lg font-bold">Invalid Invitation Link</h2>
            <p className="text-sm text-muted-foreground">
              The invite link appears to be missing or malformed. Please use the exact link from your invitation email.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.replace('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <div className="flex justify-center">
              <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <h2 className="text-lg font-bold">Account Activated!</h2>
            <p className="text-sm text-muted-foreground">Redirecting you to your dashboard…</p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center p-2.5 rounded-xl bg-primary/10 text-primary mb-2">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">NOVA</h1>
          <p className="text-xs text-muted-foreground">International Nurses · Clinical Operations</p>
        </div>

        <Card className="border border-border/80 shadow-md">
          <CardHeader className="pb-4 border-b border-border/40">
            <CardTitle className="text-base font-semibold">Set Your Password</CardTitle>
            <CardDescription className="text-xs">
              Create a secure password to activate your account and start using NOVA.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="h-9 text-sm pr-10"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {password && (
                  <div className="space-y-1">
                    <div className="flex gap-1 h-1">
                      {['Weak', 'Fair', 'Good', 'Strong'].map((level, i) => (
                        <div
                          key={level}
                          className={`flex-1 rounded-full transition-all ${
                            ['Weak', 'Fair', 'Good', 'Strong'].indexOf(passwordStrength.label) >= i
                              ? passwordStrength.color
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Strength: <span className="font-medium text-foreground">{passwordStrength.label}</span>
                      {' '}· Minimum 8 characters
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-medium">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={`h-9 text-sm pr-10 ${
                      confirmPassword && !passwordsMatch
                        ? 'border-rose-500 focus-visible:ring-rose-500'
                        : confirmPassword && passwordsMatch
                        ? 'border-emerald-500 focus-visible:ring-emerald-500'
                        : ''
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-[11px] text-rose-600">Passwords do not match</p>
                )}
                {passwordsMatch && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Passwords match
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-9 text-sm font-semibold mt-2"
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Activating Account…
                  </>
                ) : (
                  'Activate Account & Log In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-primary hover:underline font-medium">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <AcceptInviteInner />
    </Suspense>
  );
}
