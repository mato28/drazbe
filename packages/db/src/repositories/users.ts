import { eq } from 'drizzle-orm';
import { type Executor } from '../client';
import { users } from '../schema';

export type UserRow = typeof users.$inferSelect;
export type UserRole = UserRow['role'];

export function usersRepository(db: Executor) {
  return {
    async findById(id: string): Promise<UserRow | undefined> {
      return db.query.users.findFirst({ where: eq(users.id, id) });
    },
    async findByEmail(email: string): Promise<UserRow | undefined> {
      return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
    },
    async setPhone(id: string, phone: string): Promise<void> {
      await db.update(users).set({ phone }).where(eq(users.id, id));
    },
    async setRole(id: string, role: UserRole): Promise<UserRow | undefined> {
      const [row] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
      return row;
    },
  };
}
