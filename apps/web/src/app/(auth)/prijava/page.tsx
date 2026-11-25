import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { safeNextPath } from '@/lib/areas';

export const metadata: Metadata = { title: 'Prijava' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ naprej?: string }>;
}) {
  const { naprej } = await searchParams;
  return <LoginForm next={safeNextPath(naprej)} />;
}
