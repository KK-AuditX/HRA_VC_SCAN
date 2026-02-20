/**
 * Audit Log Service
 * Tracks all important user actions for compliance and debugging
 * Uses cryptographic hash chain for immutability verification
 */

import { AuditLogEntry, AuditAction, AppUser } from '../types';

const AUDIT_LOG_KEY = 'kksmartscan_audit_log';
const MAX_LOG_ENTRIES = 10000; // Keep last 10k entries
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// ==================== CRYPTOGRAPHIC HASHING ====================

/**
 * Compute SHA-256 hash of data
 */
async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute hash for an audit entry (excluding the hash field itself)
 */
async function computeEntryHash(entry: Omit<AuditLogEntry, 'hash'>): Promise<string> {
  const dataToHash = JSON.stringify({
    id: entry.id,
    userId: entry.userId,
    userEmail: entry.userEmail,
    action: entry.action,
    targetId: entry.targetId,
    targetType: entry.targetType,
    details: entry.details,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    timestamp: entry.timestamp,
    previousHash: entry.previousHash
  });
  return computeHash(dataToHash);
}

/**
 * Verify the integrity of the audit log hash chain
 */
export async function verifyAuditChain(): Promise<{
  valid: boolean;
  brokenAt?: number;
  totalEntries: number;
  verifiedEntries: number;
}> {
  const entries = getAuditLog();
  
  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, verifiedEntries: 0 };
  }
  
  let previousHash = GENESIS_HASH;
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    
    // Check previous hash linkage
    if (entry.previousHash !== previousHash) {
      return { 
        valid: false, 
        brokenAt: i, 
        totalEntries: entries.length,
        verifiedEntries: i 
      };
    }
    
    // Verify entry hash
    const computedHash = await computeEntryHash(entry);
    if (entry.hash !== computedHash) {
      return { 
        valid: false, 
        brokenAt: i, 
        totalEntries: entries.length,
        verifiedEntries: i 
      };
    }
    
    previousHash = entry.hash!;
  }
  
  return { valid: true, totalEntries: entries.length, verifiedEntries: entries.length };
}

// ==================== AUDIT LOG MANAGEMENT ====================

/**
 * Get all audit log entries
 */
export function getAuditLog(): AuditLogEntry[] {
  try {
    const data = localStorage.getItem(AUDIT_LOG_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save audit log
 */
function saveAuditLog(entries: AuditLogEntry[]): void {
  // Trim to max size
  const trimmed = entries.slice(-MAX_LOG_ENTRIES);
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(trimmed));
}

/**
 * Log an action (sync version for backwards compatibility)
 * Note: Hash computation is deferred. For guaranteed hash chain integrity, use logActionAsync.
 */
export function logAction(
  user: AppUser,
  action: AuditAction,
  options?: {
    targetId?: string;
    targetType?: 'user' | 'contact' | 'settings' | 'session';
    details?: Record<string, unknown>;
  }
): AuditLogEntry {
  const entries = getAuditLog();
  const previousHash = entries.length > 0 ? (entries[entries.length - 1].hash || GENESIS_HASH) : GENESIS_HASH;
  
  const entry: AuditLogEntry = {
    id: `audit_${crypto.randomUUID()}`,
    userId: user.id,
    userEmail: user.email,
    action,
    targetId: options?.targetId,
    targetType: options?.targetType,
    details: options?.details,
    ipAddress: 'client',
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
    previousHash
  };
  
  // Add entry first with placeholder hash
  entry.hash = `pending_${entry.id}`;
  entries.push(entry);
  saveAuditLog(entries);
  
  // Compute hash asynchronously and update in place
  computeEntryHash(entry).then(hash => {
    const updatedEntries = getAuditLog();
    const idx = updatedEntries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      updatedEntries[idx].hash = hash;
      saveAuditLog(updatedEntries);
    }
  }).catch(err => {
    console.error('Failed to compute audit hash:', err);
  });
  
  console.log(`[Audit] ${user.email} performed ${action}`, options?.details || '');
  
  return entry;
}

/**
 * Log an action with full cryptographic hash (async version)
 */
export async function logActionAsync(
  user: AppUser,
  action: AuditAction,
  options?: {
    targetId?: string;
    targetType?: 'user' | 'contact' | 'settings' | 'session';
    details?: Record<string, unknown>;
  }
): Promise<AuditLogEntry> {
  const entries = getAuditLog();
  const previousHash = entries.length > 0 ? entries[entries.length - 1].hash || GENESIS_HASH : GENESIS_HASH;
  
  const entry: AuditLogEntry = {
    id: `audit_${crypto.randomUUID()}`,
    userId: user.id,
    userEmail: user.email,
    action,
    targetId: options?.targetId,
    targetType: options?.targetType,
    details: options?.details,
    ipAddress: 'client',
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
    previousHash
  };
  
  // Compute hash synchronously before saving
  entry.hash = await computeEntryHash(entry);
  
  entries.push(entry);
  saveAuditLog(entries);
  
  console.log(`[Audit] ${user.email} performed ${action}`, options?.details || '');
  
  return entry;
}

/**
 * Log user login
 */
export function logLogin(user: AppUser): AuditLogEntry {
  return logAction(user, 'user.login');
}

/**
 * Log user logout
 */
export function logLogout(user: AppUser): AuditLogEntry {
  return logAction(user, 'user.logout');
}

/**
 * Log user invite
 */
export function logInvite(
  inviter: AppUser, 
  inviteeEmail: string,
  role: string
): AuditLogEntry {
  return logAction(inviter, 'user.invite', {
    details: { inviteeEmail, role }
  });
}

/**
 * Log user approval
 */
export function logApproval(
  approver: AppUser, 
  approvedUserId: string,
  approvedEmail: string
): AuditLogEntry {
  return logAction(approver, 'user.approve', {
    targetId: approvedUserId,
    targetType: 'user',
    details: { approvedEmail }
  });
}

/**
 * Log user rejection
 */
export function logRejection(
  rejecter: AppUser, 
  rejectedUserId: string,
  rejectedEmail: string
): AuditLogEntry {
  return logAction(rejecter, 'user.reject', {
    targetId: rejectedUserId,
    targetType: 'user',
    details: { rejectedEmail }
  });
}

/**
 * Log user suspension
 */
export function logSuspension(
  suspender: AppUser, 
  suspendedUserId: string,
  suspendedEmail: string,
  reason?: string
): AuditLogEntry {
  return logAction(suspender, 'user.suspend', {
    targetId: suspendedUserId,
    targetType: 'user',
    details: { suspendedEmail, reason }
  });
}

/**
 * Log role change
 */
export function logRoleChange(
  changer: AppUser,
  targetUserId: string,
  targetEmail: string,
  oldRole: string,
  newRole: string
): AuditLogEntry {
  return logAction(changer, 'user.role_change', {
    targetId: targetUserId,
    targetType: 'user',
    details: { targetEmail, oldRole, newRole }
  });
}

/**
 * Log contact creation
 */
export function logContactCreate(
  user: AppUser, 
  contactId: string,
  contactName: string
): AuditLogEntry {
  return logAction(user, 'contact.create', {
    targetId: contactId,
    targetType: 'contact',
    details: { contactName }
  });
}

/**
 * Log contact update
 */
export function logContactUpdate(
  user: AppUser, 
  contactId: string,
  contactName: string,
  changedFields: string[]
): AuditLogEntry {
  return logAction(user, 'contact.update', {
    targetId: contactId,
    targetType: 'contact',
    details: { contactName, changedFields }
  });
}

/**
 * Log contact deletion
 */
export function logContactDelete(
  user: AppUser, 
  contactId: string,
  contactName: string
): AuditLogEntry {
  return logAction(user, 'contact.delete', {
    targetId: contactId,
    targetType: 'contact',
    details: { contactName }
  });
}

/**
 * Log contact export
 */
export function logContactExport(
  user: AppUser,
  contactCount: number,
  format: string
): AuditLogEntry {
  return logAction(user, 'contact.export', {
    details: { contactCount, format }
  });
}

/**
 * Log contact import
 */
export function logContactImport(
  user: AppUser,
  contactCount: number,
  source: string
): AuditLogEntry {
  return logAction(user, 'contact.import', {
    details: { contactCount, source }
  });
}

/**
 * Log settings update
 */
export function logSettingsUpdate(
  user: AppUser,
  settingKey: string,
  oldValue: unknown,
  newValue: unknown
): AuditLogEntry {
  return logAction(user, 'settings.update', {
    targetType: 'settings',
    details: { settingKey, oldValue, newValue }
  });
}

/**
 * Log session revocation
 */
export function logSessionRevoke(
  user: AppUser,
  revokedSessionId: string,
  revokedUserId: string
): AuditLogEntry {
  return logAction(user, 'session.revoke', {
    targetId: revokedSessionId,
    targetType: 'session',
    details: { revokedUserId }
  });
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get audit log entries for a specific user
 */
export function getAuditLogByUser(userId: string, limit?: number): AuditLogEntry[] {
  const entries = getAuditLog().filter(e => e.userId === userId);
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? entries.slice(0, limit) : entries;
}

/**
 * Get audit log entries for a specific action
 */
export function getAuditLogByAction(action: AuditAction, limit?: number): AuditLogEntry[] {
  const entries = getAuditLog().filter(e => e.action === action);
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? entries.slice(0, limit) : entries;
}

/**
 * Get audit log entries for a specific target
 */
export function getAuditLogByTarget(targetId: string, limit?: number): AuditLogEntry[] {
  const entries = getAuditLog().filter(e => e.targetId === targetId);
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? entries.slice(0, limit) : entries;
}

/**
 * Get audit log entries within a time range
 */
export function getAuditLogByTimeRange(
  startTime: number, 
  endTime: number,
  limit?: number
): AuditLogEntry[] {
  const entries = getAuditLog().filter(
    e => e.timestamp >= startTime && e.timestamp <= endTime
  );
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? entries.slice(0, limit) : entries;
}

/**
 * Get recent audit log entries
 */
export function getRecentAuditLog(limit: number = 100): AuditLogEntry[] {
  const entries = getAuditLog();
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries.slice(0, limit);
}

/**
 * Search audit log
 */
export function searchAuditLog(query: string, limit?: number): AuditLogEntry[] {
  const lowerQuery = query.toLowerCase();
  const entries = getAuditLog().filter(e => 
    e.userEmail.toLowerCase().includes(lowerQuery) ||
    e.action.toLowerCase().includes(lowerQuery) ||
    JSON.stringify(e.details || {}).toLowerCase().includes(lowerQuery)
  );
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return limit ? entries.slice(0, limit) : entries;
}

// ==================== STATISTICS ====================

/**
 * Get audit statistics
 */
export function getAuditStats(): {
  totalEntries: number;
  entriesByAction: Record<string, number>;
  entriesByUser: Record<string, number>;
  last24Hours: number;
  last7Days: number;
} {
  const entries = getAuditLog();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  const entriesByAction: Record<string, number> = {};
  const entriesByUser: Record<string, number> = {};
  let last24Hours = 0;
  let last7Days = 0;
  
  for (const entry of entries) {
    // By action
    entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
    
    // By user
    entriesByUser[entry.userEmail] = (entriesByUser[entry.userEmail] || 0) + 1;
    
    // Time-based
    if (entry.timestamp >= oneDayAgo) last24Hours++;
    if (entry.timestamp >= oneWeekAgo) last7Days++;
  }
  
  return {
    totalEntries: entries.length,
    entriesByAction,
    entriesByUser,
    last24Hours,
    last7Days
  };
}

/**
 * Clear old audit log entries (keep last N days)
 */
export function pruneAuditLog(keepDays: number = 90): number {
  const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
  const entries = getAuditLog();
  const beforeCount = entries.length;
  
  const filtered = entries.filter(e => e.timestamp >= cutoff);
  saveAuditLog(filtered);
  
  return beforeCount - filtered.length;
}

/**
 * Export audit log as CSV
 */
export function exportAuditLogCSV(entries: AuditLogEntry[]): string {
  const headers = ['Timestamp', 'User', 'Action', 'Target Type', 'Target ID', 'Details'];
  const rows = entries.map(e => [
    new Date(e.timestamp).toISOString(),
    e.userEmail,
    e.action,
    e.targetType || '',
    e.targetId || '',
    JSON.stringify(e.details || {})
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  
  return [headers.join(','), ...rows].join('\n');
}
