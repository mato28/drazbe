import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'TRUSTEE', 'BIDDER']);

export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: userRoleSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;
