'use client';

import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DASHBOARD_PATH } from '@/lib/areas';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { textField } from '@/lib/form';
import { FormError } from './form-error';

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    const otp = textField(new FormData(e.currentTarget), 'otp').trim();
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.replace(DASHBOARD_PATH);
    router.refresh();
  }

  async function resend() {
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    });
    if (error) setError(authErrorMessage(error));
    else setInfo('Poslali smo vam novo kodo.');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Potrditev e-poštnega naslova</CardTitle>
        <CardDescription>
          Na naslov <span className="font-medium text-foreground">{email}</span> smo poslali
          6-mestno kodo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="otp">Koda</Label>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className="font-mono tracking-[0.5em]"
            />
          </div>
          <FormError message={error} />
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? 'Preverjanje …' : 'Potrdi'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void resend()}>
            Pošlji novo kodo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
