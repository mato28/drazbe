'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient, authErrorMessage } from '@/lib/auth-client';
import { textField } from '@/lib/form';
import { FormError } from './form-error';

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = textField(form, 'email');
    const password = textField(form, 'password');
    if (password !== textField(form, 'passwordRepeat')) {
      setError('Gesli se ne ujemata.');
      return;
    }
    setPending(true);
    const { error } = await authClient.signUp.email({
      name: textField(form, 'name'),
      email,
      password,
      phone: textField(form, 'phone'),
    });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    router.push(`/potrditev?email=${encodeURIComponent(email)}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Registracija dražitelja</CardTitle>
        <CardDescription>
          Po registraciji vam pošljemo kodo za potrditev e-poštnega naslova.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Ime in priimek</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">E-poštni naslov</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Telefonska številka</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="041 123 456"
              pattern="[+0-9 /().\-]{8,20}"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Geslo (vsaj 10 znakov)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="passwordRepeat">Ponovite geslo</Label>
            <Input
              id="passwordRepeat"
              name="passwordRepeat"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </div>
          <FormError message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Registracija …' : 'Registracija'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Že imate račun?{' '}
            <Link href="/prijava" className="text-foreground underline underline-offset-4">
              Prijava
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
