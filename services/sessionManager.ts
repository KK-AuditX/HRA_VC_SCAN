/**
 * Session & Permission Management Service
 * Handles RBAC, session validation, and user management
 */

import { 
  AppUser, Session, Permission, UserRole, 
  ROLE_PERMISSIONS, AccessStatus, Organization,
  OrganizationMember, Invite
} from '../types';

const SESSIONS_KEY = 'kksmartscan_sessions';
const USERS_KEY = 'kksmartscan_users';
const ORGS_KEY = 'kksmartscan_organizations';
const INVITES_KEY = 'kksmartscan_invites';

// Session timeout (24 hours)
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
// Session activity timeout (30 minutes of inactivity)
const ACTIVITY_TIMEOUT = 30 * 60 * 1000;

// ==================== PERMISSION CHECKING ====================

/**
 * Check if user has a specific permission
 */
export function hasPermission(user: AppUser | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.status !== 'approved') return false;
  
  // Check explicit permissions first
  if (user.permissions?.includes(permission)) return true;
  
  // Fall back to role-based permissions
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check if user has any of the given permissions
 */
export function hasAnyPermission(user: AppUser | null, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(user, p));
}

/**
 * Check if user has all of the given permissions
 */
export function hasAllPermissions(user: AppUser | null, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(user, p));
}

/**
 * Get all permissions for a user
 */
export function getUserPermissions(user: AppUser): Permission[] {
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  const explicitPermissions = user.permissions || [];
  
  // Combine and deduplicate
  return [...new Set([...rolePermissions, ...explicitPermissions])];
}

/**
 * Permission check decorator/guard
 */
export function requirePermission(permission: Permission): (user: AppUser | null) => void {
  return (user: AppUser | null) => {
    if (!hasPermission(user, permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  };
}

// ==================== SESSION MANAGEMENT ====================

/**
 * Get all sessions
 */
export function getAllSessions(): Session[] {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save sessions
 */
function saveSessions(sessions: Session[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/**
 * Get sessions for a specific user
 */
export function getUserSessions(userId: string): Session[] {
  return getAllSessions().filter(s => s.userId === userId && s.isActive);
}

/**
 * Get active sessions count
 */
export function getActiveSessionCount(userId: string): number {
  return getUserSessions(userId).length;
}

/**
 * Validate session
 */
export function validateSession(sessionId: string): Session | null {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) return null;
  if (!session.isActive) return null;
  if (session.expiresAt < Date.now()) {
    // Mark as inactive
    session.isActive = false;
    saveSessions(sessions);
    return null;
  }
  
  // Check activity timeout
  if (Date.now() - session.lastActiveAt > ACTIVITY_TIMEOUT) {
    session.isActive = false;
    saveSessions(sessions);
    return null;
  }
  
  return session;
}

/**
 * Update session activity
 */
export function updateSessionActivity(sessionId: string): void {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (session && session.isActive) {
    session.lastActiveAt = Date.now();
    saveSessions(sessions);
  }
}

/**
 * Revoke a session
 */
export function revokeSession(sessionId: string): boolean {
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (session) {
    session.isActive = false;
    saveSessions(sessions);
    return true;
  }
  
  return false;
}

/**
 * Revoke all sessions for a user
 */
export function revokeAllUserSessions(userId: string): number {
  const sessions = getAllSessions();
  let count = 0;
  
  sessions.forEach(s => {
    if (s.userId === userId && s.isActive) {
      s.isActive = false;
      count++;
    }
  });
  
  saveSessions(sessions);
  return count;
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const sessions = getAllSessions();
  const now = Date.now();
  let count = 0;
  
  sessions.forEach(s => {
    if (s.isActive && (s.expiresAt < now || now - s.lastActiveAt > ACTIVITY_TIMEOUT)) {
      s.isActive = false;
      count++;
    }
  });
  
  saveSessions(sessions);
  return count;
}

// ==================== USER MANAGEMENT ====================

/**
 * Get all users
 */
export function getAllUsersDb(): AppUser[] {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save users
 */
function saveUsers(users: AppUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Get user by ID
 */
export function getUserById(userId: string): AppUser | null {
  const users = getAllUsersDb();
  return users.find(u => u.id === userId) || null;
}

/**
 * Get user by email
 */
export function getUserByEmail(email: string): AppUser | null {
  const users = getAllUsersDb();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

/**
 * Update user
 */
export function updateUser(userId: string, updates: Partial<AppUser>): AppUser | null {
  const users = getAllUsersDb();
  const index = users.findIndex(u => u.id === userId);
  
  if (index === -1) return null;
  
  users[index] = { ...users[index], ...updates };
  saveUsers(users);
  
  return users[index];
}

/**
 * Update user role
 */
export function updateUserRole(userId: string, newRole: UserRole): AppUser | null {
  return updateUser(userId, { role: newRole });
}

/**
 * Update user status (approve, reject, suspend)
 */
export function updateUserStatus(userId: string, status: AccessStatus): AppUser | null {
  const user = updateUser(userId, { status });
  
  // If suspended or rejected, revoke all sessions
  if (status === 'suspended' || status === 'rejected') {
    revokeAllUserSessions(userId);
  }
  
  return user;
}

/**
 * Get pending users (awaiting approval)
 */
export function getPendingUsers(): AppUser[] {
  return getAllUsersDb().filter(u => u.status === 'pending');
}

/**
 * Get approved users
 */
export function getApprovedUsers(): AppUser[] {
  return getAllUsersDb().filter(u => u.status === 'approved');
}

/**
 * Delete user
 */
export function deleteUser(userId: string): boolean {
  const users = getAllUsersDb();
  const index = users.findIndex(u => u.id === userId);
  
  if (index === -1) return false;
  
  // Don't allow deleting owner
  if (users[index].role === 'owner') return false;
  
  // Revoke all sessions
  revokeAllUserSessions(userId);
  
  // Remove user
  users.splice(index, 1);
  saveUsers(users);
  
  return true;
}

// ==================== ORGANIZATION MANAGEMENT ====================

/**
 * Get all organizations
 */
export function getAllOrganizations(): Organization[] {
  try {
    const data = localStorage.getItem(ORGS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save organizations
 */
function saveOrganizations(orgs: Organization[]): void {
  localStorage.setItem(ORGS_KEY, JSON.stringify(orgs));
}

/**
 * Get organization by ID
 */
export function getOrganization(orgId: string): Organization | null {
  const orgs = getAllOrganizations();
  return orgs.find(o => o.id === orgId) || null;
}

/**
 * Create organization
 */
export function createOrganization(name: string, ownerId: string): Organization {
  const orgs = getAllOrganizations();
  
  const org: Organization = {
    id: `org_${crypto.randomUUID()}`,
    name,
    ownerId,
    createdAt: Date.now(),
    settings: {
      allowGuestAccess: false,
      requireApproval: true,
      maxMembers: 50,
      maxContactsPerUser: 10000,
      rateLimitPerMinute: 60,
      allowedDomains: []
    },
    members: [{
      userId: ownerId,
      role: 'owner',
      joinedAt: Date.now()
    }],
    invites: []
  };
  
  orgs.push(org);
  saveOrganizations(orgs);
  
  // Update user's organizationId
  updateUser(ownerId, { organizationId: org.id });
  
  return org;
}

/**
 * Update organization settings
 */
export function updateOrganizationSettings(
  orgId: string, 
  settings: Partial<Organization['settings']>
): Organization | null {
  const orgs = getAllOrganizations();
  const org = orgs.find(o => o.id === orgId);
  
  if (!org) return null;
  
  org.settings = { ...org.settings, ...settings };
  saveOrganizations(orgs);
  
  return org;
}

/**
 * Add member to organization
 */
export function addOrgMember(
  orgId: string, 
  userId: string, 
  role: UserRole,
  invitedBy?: string
): boolean {
  const orgs = getAllOrganizations();
  const org = orgs.find(o => o.id === orgId);
  
  if (!org) return false;
  
  // Check if already a member
  if (org.members.some(m => m.userId === userId)) return false;
  
  // Check member limit
  if (org.members.length >= org.settings.maxMembers) return false;
  
  org.members.push({
    userId,
    role,
    joinedAt: Date.now(),
    invitedBy
  });
  
  saveOrganizations(orgs);
  
  // Update user's organizationId
  updateUser(userId, { organizationId: orgId, role });
  
  return true;
}

/**
 * Remove member from organization
 */
export function removeOrgMember(orgId: string, userId: string): boolean {
  const orgs = getAllOrganizations();
  const org = orgs.find(o => o.id === orgId);
  
  if (!org) return false;
  
  // Can't remove owner
  if (org.ownerId === userId) return false;
  
  const index = org.members.findIndex(m => m.userId === userId);
  if (index === -1) return false;
  
  org.members.splice(index, 1);
  saveOrganizations(orgs);
  
  // Clear user's organizationId
  updateUser(userId, { organizationId: undefined });
  
  return true;
}

/**
 * Get user's organization
 */
export function getUserOrganization(userId: string): Organization | null {
  const user = getUserById(userId);
  if (!user?.organizationId) return null;
  
  return getOrganization(user.organizationId);
}

// ==================== INVITE MANAGEMENT ====================

/**
 * Create invite
 */
export function createInvite(
  orgId: string,
  email: string,
  role: UserRole,
  invitedBy: string,
  expiresInHours: number = 72
): Invite | null {
  const orgs = getAllOrganizations();
  const org = orgs.find(o => o.id === orgId);
  
  if (!org) return null;
  
  // Check if email already invited
  const existingInvite = org.invites.find(
    i => i.email.toLowerCase() === email.toLowerCase() && i.status === 'pending'
  );
  if (existingInvite) return null;
  
  // Check if user already exists and is a member
  const existingUser = getUserByEmail(email);
  if (existingUser && org.members.some(m => m.userId === existingUser.id)) {
    return null;
  }
  
  const invite: Invite = {
    id: `invite_${crypto.randomUUID()}`,
    email: email.toLowerCase(),
    role,
    invitedBy,
    createdAt: Date.now(),
    expiresAt: Date.now() + (expiresInHours * 60 * 60 * 1000),
    status: 'pending',
    token: crypto.randomUUID()
  };
  
  org.invites.push(invite);
  saveOrganizations(orgs);
  
  return invite;
}

/**
 * Get all invites for an organization or all invites
 */
export function getInvites(orgId?: string): Invite[] {
  const orgs = getAllOrganizations();
  
  if (orgId) {
    const org = orgs.find(o => o.id === orgId);
    return org ? org.invites : [];
  }
  
  // Return all invites from all organizations
  return orgs.flatMap(org => org.invites);
}

/**
 * Accept invite
 */
export function acceptInvite(token: string, userId: string): boolean {
  const orgs = getAllOrganizations();
  
  for (const org of orgs) {
    const invite = org.invites.find(i => i.token === token);
    
    if (invite) {
      if (invite.status !== 'pending') return false;
      if (invite.expiresAt < Date.now()) {
        invite.status = 'expired';
        saveOrganizations(orgs);
        return false;
      }
      
      // Verify email matches
      const user = getUserById(userId);
      if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return false;
      }
      
      invite.status = 'accepted';
      saveOrganizations(orgs);
      
      // Add user to organization
      addOrgMember(org.id, userId, invite.role, invite.invitedBy);
      
      // Auto-approve user
      updateUserStatus(userId, 'approved');
      
      return true;
    }
  }
  
  return false;
}

/**
 * Revoke invite
 */
export function revokeInvite(orgId: string, inviteId: string): boolean {
  const orgs = getAllOrganizations();
  const org = orgs.find(o => o.id === orgId);
  
  if (!org) return false;
  
  const invite = org.invites.find(i => i.id === inviteId);
  if (!invite || invite.status !== 'pending') return false;
  
  invite.status = 'revoked';
  saveOrganizations(orgs);
  
  return true;
}

/**
 * Get pending invites for an organization
 */
export function getPendingInvites(orgId: string): Invite[] {
  const org = getOrganization(orgId);
  if (!org) return [];
  
  return org.invites.filter(i => i.status === 'pending' && i.expiresAt > Date.now());
}

/**
 * Get invite by token
 */
export function getInviteByToken(token: string): { invite: Invite; orgName: string } | null {
  const orgs = getAllOrganizations();
  
  for (const org of orgs) {
    const invite = org.invites.find(i => i.token === token);
    if (invite && invite.status === 'pending' && invite.expiresAt > Date.now()) {
      return { invite, orgName: org.name };
    }
  }
  
  return null;
}

// ==================== ROLE HELPERS ====================

/**
 * Check if user can manage another user
 */
export function canManageUser(manager: AppUser, target: AppUser): boolean {
  if (!hasPermission(manager, 'users:manage')) return false;
  
  // Can't manage users with higher or equal roles
  const roleHierarchy: UserRole[] = ['owner', 'admin', 'editor', 'viewer', 'guest'];
  const managerRank = roleHierarchy.indexOf(manager.role);
  const targetRank = roleHierarchy.indexOf(target.role);
  
  return managerRank < targetRank;
}

/**
 * Get available roles for assignment (can only assign lower roles)
 */
export function getAssignableRoles(user: AppUser): UserRole[] {
  const roleHierarchy: UserRole[] = ['owner', 'admin', 'editor', 'viewer', 'guest'];
  const userRank = roleHierarchy.indexOf(user.role);
  
  // Can only assign roles lower than own
  return roleHierarchy.slice(userRank + 1);
}
