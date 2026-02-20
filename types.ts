
// ==================== USER & AUTH TYPES ====================

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'guest';
export type AccessStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  picture: string;
  role: UserRole;
  status: AccessStatus;
  organizationId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  createdAt: number;
  lastLoginAt?: number;
  invitedBy?: string;
  permissions?: Permission[];
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  isActive: boolean;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  settings: OrganizationSettings;
  members: OrganizationMember[];
  invites: Invite[];
}

export interface OrganizationSettings {
  allowGuestAccess: boolean;
  requireApproval: boolean;
  maxMembers: number;
  maxContactsPerUser: number;
  rateLimitPerMinute: number;
  allowedDomains: string[]; // e.g., ['company.com'] for SSO
}

export interface OrganizationMember {
  userId: string;
  role: UserRole;
  joinedAt: number;
  invitedBy?: string;
}

export interface Invite {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  token: string;
}

// ==================== PERMISSIONS ====================

export type Permission = 
  | 'contacts:read'
  | 'contacts:write'
  | 'contacts:delete'
  | 'contacts:export'
  | 'contacts:import'
  | 'users:read'
  | 'users:invite'
  | 'users:manage'
  | 'settings:read'
  | 'settings:write'
  | 'audit:read'
  | 'admin:full';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'contacts:read', 'contacts:write', 'contacts:delete', 'contacts:export', 'contacts:import',
    'users:read', 'users:invite', 'users:manage',
    'settings:read', 'settings:write',
    'audit:read', 'admin:full'
  ],
  admin: [
    'contacts:read', 'contacts:write', 'contacts:delete', 'contacts:export', 'contacts:import',
    'users:read', 'users:invite', 'users:manage',
    'settings:read',
    'audit:read'
  ],
  editor: [
    'contacts:read', 'contacts:write', 'contacts:delete', 'contacts:export', 'contacts:import',
    'users:read'
  ],
  viewer: [
    'contacts:read', 'contacts:export',
    'users:read'
  ],
  guest: [
    'contacts:read'
  ]
};

// ==================== AUDIT LOG ====================

export type AuditAction = 
  | 'user.login'
  | 'user.logout'
  | 'user.invite'
  | 'user.approve'
  | 'user.reject'
  | 'user.suspend'
  | 'user.role_change'
  | 'contact.create'
  | 'contact.update'
  | 'contact.delete'
  | 'contact.export'
  | 'contact.import'
  | 'settings.update'
  | 'session.revoke';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  targetId?: string;
  targetType?: 'user' | 'contact' | 'settings' | 'session';
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: number;
  // Cryptographic hash chain for immutability
  hash?: string;
  previousHash?: string;
}

// ==================== RATE LIMITING ====================

export interface RateLimitEntry {
  userId: string;
  action: string;
  count: number;
  windowStart: number;
  windowEnd: number;
}

// ==================== CONTACT TYPES ====================

export interface ContactInfo {
  id: string;
  name: string;
  firmName: string;
  jobTitle: string;
  phone: string;
  phone2: string;
  email: string;
  email2: string;
  website: string;
  address: string;
  pincode: string;
  notes: string;
  industry: string;
  createdAt: number;
  imageSource: string;
  status: 'processing' | 'completed' | 'error';
  selected?: boolean;
  // Business compliance fields
  gstin?: string;
  pan?: string;
  // Multi-tenancy fields
  organizationId?: string;
  createdBy?: string;
  updatedAt?: number;
  updatedBy?: string;
  syncStatus?: {
    googleContacts: 'pending' | 'synced' | 'failed';
    googleSheets: 'pending' | 'synced' | 'failed';
  };
}

export interface ExtractionResult {
  name: string;
  firmName: string;
  jobTitle: string;
  phone: string;
  phone2: string;
  email: string;
  email2: string;
  website: string;
  address: string;
  pincode: string;
  notes: string;
  industry: string;
}

export interface AppStats {
  totalScans: number;
  approvedUsers: number;
  industryDiversity: Record<string, number>;
  monthlyGrowth: number;
}
