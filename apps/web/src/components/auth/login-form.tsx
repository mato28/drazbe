'use client';

import Link from 'next/link';
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

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = textField(form, 'email');
    const { error } = await authClient.signIn.email({
      email,
      password: textField(form, 'password'),
    });
    setPending(false);

    if (error?.code === 'EMAIL_NOT_VERIFIED') {
      // A new code has been sent on this sign-in attempt.
      router.push(`/potrditev?email=${encodeURIComponent(email)}`);
      return;
    }
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.replace(next ?? DASHBOARD_PATH);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Prijava</CardTitle>
        <CardDescription>Prijavite se s svojim e-poštnim naslovom in geslom.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">E-poštni naslov</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Geslo</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Prijavljanje …' : 'Prijava'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Še nimate računa?{' '}
            <Link href="/registracija" className="text-foreground underline underline-offset-4">
              Registracija dražitelja
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
