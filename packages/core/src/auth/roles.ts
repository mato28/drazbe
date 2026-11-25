export const ROLES = ['ADMIN', 'TRUSTEE', 'BIDDER'] as const;
export type Role = (typeof ROLES)[number];

/** Protected areas of the application. */
export const AREAS = ['admin', 'trustee', 'bidder'] as const;
export type Area = (typeof AREAS)[number];

/**
 * Which roles may enter which area. Deliberately strict: the platform admin does not act as a
 * trustee or bidder, and a trustee can never bid (excluded person under ZFPPIPP).
 */
const AREA_ROLES: Record<Area, readonly Role[]> = {
  admin: ['ADMIN'],
  trustee: ['TRUSTEE'],
  bidder: ['BIDDER'],
};

const HOME_AREA: Record<Role, Area> = {
  ADMIN: 'admin',
  TRUSTEE: 'trustee',
  BIDDER: 'bidder',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function canAccessArea(role: Role | null | undefined, area: Area): boolean {
  return role !== null && role !== undefined && AREA_ROLES[area].includes(role);
}

export function homeAreaFor(role: Role): Area {
  return HOME_AREA[role];
}
