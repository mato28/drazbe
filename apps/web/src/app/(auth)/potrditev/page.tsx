import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { VerifyEmailForm } from '@/components/auth/verify-email-form';

export const metadata: Metadata = { title: 'Potrditev e-pošte' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  if (!email) redirect('/prijava');
  return <VerifyEmailForm email={email} />;
}
