/**
 * Backup & Restore Service
 * Complete data backup with encryption option
 * Supports automatic backups and restore points
 */

import { ContactInfo } from '../types';
import { getAllContacts, saveContact, clearAllData } from './database';

// ==================== TYPES ====================

export interface BackupMetadata {
  id: string;
  version: string;
  createdAt: number;
  contactCount: number;
  size: number;
  encrypted: boolean;
  checksum: string;
  description?: string;
}

export interface BackupData {
  metadata: BackupMetadata;
  contacts: ContactInfo[];
  settings?: Record<string, unknown>;
}

export interface RestoreResult {
  success: boolean;
  contactsRestored: number;
  errors: string[];
  warnings: string[];
}

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  lastBackup?: number;
  nextBackup?: number;
  retentionDays: number;
}

// Constants
const BACKUP_VERSION = '2.0';
const BACKUP_STORAGE_KEY = 'kksmartscan_backups';
const SCHEDULE_KEY = 'kksmartscan_backup_schedule';
const MAX_LOCAL_BACKUPS = 10;

// ==================== BACKUP CREATION ====================

/**
 * Create a full backup
 */
export async function createBackup(
  options: {
    description?: string;
    encrypt?: boolean;
    password?: string;
    includeSettings?: boolean;
  } = {},
  userId?: string
): Promise<BackupData> {
  const contacts = await getAllContacts();
  
  const metadata: BackupMetadata = {
    id: `backup_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    contactCount: contacts.length,
    size: 0,
    encrypted: options.encrypt || false,
    checksum: ''
  };
  
  if (options.description) {
    metadata.description = options.description;
  }

  let backupData: BackupData = {
    metadata,
    contacts
  };

  // Calculate checksum
  const dataString = JSON.stringify({ contacts });
  metadata.checksum = await calculateChecksum(dataString);
  metadata.size = new Blob([dataString]).size;

  // Encrypt if requested
  if (options.encrypt && options.password) {
    backupData = await encryptBackup(backupData, options.password);
  }

  return backupData;
}

/**
 * Download backup as file
 */
export async function downloadBackup(
  options?: {
    description?: string;
    encrypt?: boolean;
    password?: string;
  },
  userId?: string
): Promise<void> {
  const backupData = await createBackup(options, userId);
  const content = JSON.stringify(backupData, null, 2);
  
  const timestamp = new Date().toISOString()
    .replace(/[:\-T]/g, '')
    .replace(/\.\d{3}Z$/, '');
  
  const fileName = `smartscan_backup_${timestamp}.json`;
  
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== RESTORE ====================

/**
 * Restore from backup data
 */
export async function restoreFromBackup(
  backup: BackupData,
  options: {
    password?: string;
    mergeMode?: 'replace' | 'merge' | 'skip_existing';
  } = {},
  userId?: string
): Promise<RestoreResult> {
  const result: RestoreResult = {
    success: false,
    contactsRestored: 0,
    errors: [],
    warnings: []
  };

  try {
    // Validate backup
    const validation = await validateBackup(backup, options.password);
    if (!validation.valid) {
      result.errors.push(...validation.errors);
      return result;
    }

    let backupData = backup;

    // Decrypt if necessary
    if (backup.metadata.encrypted) {
      if (!options.password) {
        result.errors.push('Password required for encrypted backup');
        return result;
      }
      backupData = await decryptBackup(backup, options.password);
    }

    // Get existing contacts
    const existingContacts = await getAllContacts();
    const existingIds = new Set(existingContacts.map(c => c.id));
    const existingEmails = new Set(existingContacts.map(c => c.email?.toLowerCase()).filter(Boolean));

    // Handle merge mode
    if (options.mergeMode === 'replace') {
      // Clear existing data
      await clearAllData();
      result.warnings.push('Existing data was cleared');
    }

    // Restore contacts
    for (const contact of backupData.contacts) {
      try {
        if (options.mergeMode === 'skip_existing') {
          // Skip if ID or email already exists
          if (existingIds.has(contact.id) || existingEmails.has(contact.email?.toLowerCase())) {
            continue;
          }
        }

        // For merge mode, give new ID if exists
        if (options.mergeMode === 'merge' && existingIds.has(contact.id)) {
          contact.id = crypto.randomUUID();
        }

        await saveContact(contact);
        result.contactsRestored++;
      } catch (error) {
        result.errors.push(`Failed to restore contact ${contact.name}: ${error}`);
      }
    }

    result.success = result.errors.length === 0;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Restore failed');
  }

  return result;
}

/**
 * Restore from file upload
 */
export async function restoreFromFile(
  file: File,
  options?: {
    password?: string;
    mergeMode?: 'replace' | 'merge' | 'skip_existing';
  },
  userId?: string
): Promise<RestoreResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const backup = JSON.parse(content) as BackupData;
        
        const result = await restoreFromBackup(backup, options || {}, userId);
        resolve(result);
      } catch (error) {
        resolve({
          success: false,
          contactsRestored: 0,
          errors: ['Failed to parse backup file'],
          warnings: []
        });
      }
    };
    
    reader.onerror = () => {
      resolve({
        success: false,
        contactsRestored: 0,
        errors: ['Failed to read file'],
        warnings: []
      });
    };
    
    reader.readAsText(file);
  });
}

// ==================== VALIDATION ====================

/**
 * Validate backup integrity
 */
export async function validateBackup(
  backup: BackupData,
  password?: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check structure
  if (!backup.metadata) {
    errors.push('Missing backup metadata');
    return { valid: false, errors };
  }

  if (!Array.isArray(backup.contacts)) {
    errors.push('Invalid contacts data');
    return { valid: false, errors };
  }

  // Check version compatibility
  const [major] = backup.metadata.version.split('.').map(Number);
  const [currentMajor] = BACKUP_VERSION.split('.').map(Number);
  
  if (major > currentMajor) {
    errors.push(`Backup version ${backup.metadata.version} is newer than supported version ${BACKUP_VERSION}`);
  }

  // Verify checksum (if not encrypted)
  if (!backup.metadata.encrypted && backup.metadata.checksum) {
    const dataString = JSON.stringify({ contacts: backup.contacts });
    const calculatedChecksum = await calculateChecksum(dataString);
    
    if (calculatedChecksum !== backup.metadata.checksum) {
      errors.push('Backup data integrity check failed (checksum mismatch)');
    }
  }

  // Verify encrypted backup can be decrypted
  if (backup.metadata.encrypted && password) {
    try {
      await decryptBackup(backup, password);
    } catch {
      errors.push('Failed to decrypt backup - incorrect password?');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ==================== LOCAL BACKUP MANAGEMENT ====================

/**
 * Save backup to local storage
 */
export function saveLocalBackup(backup: BackupData): void {
  const backups = getLocalBackups();
  
  // Add new backup
  backups.unshift({
    id: backup.metadata.id,
    createdAt: backup.metadata.createdAt,
    contactCount: backup.metadata.contactCount,
    size: backup.metadata.size,
    description: backup.metadata.description
  });
  
  // Limit number of backups
  const trimmed = backups.slice(0, MAX_LOCAL_BACKUPS);
  localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(trimmed));
  
  // Save actual backup data
  localStorage.setItem(`backup_${backup.metadata.id}`, JSON.stringify(backup));
}

/**
 * Get list of local backups
 */
export function getLocalBackups(): {
  id: string;
  createdAt: number;
  contactCount: number;
  size: number;
  description?: string;
}[] {
  try {
    const data = localStorage.getItem(BACKUP_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Get specific local backup
 */
export function getLocalBackup(id: string): BackupData | null {
  try {
    const data = localStorage.getItem(`backup_${id}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Delete local backup
 */
export function deleteLocalBackup(id: string): void {
  localStorage.removeItem(`backup_${id}`);
  
  const backups = getLocalBackups().filter(b => b.id !== id);
  localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backups));
}

// ==================== AUTO BACKUP ====================

/**
 * Get backup schedule
 */
export function getBackupSchedule(): BackupSchedule {
  try {
    const data = localStorage.getItem(SCHEDULE_KEY);
    return data ? JSON.parse(data) : {
      enabled: false,
      frequency: 'weekly',
      retentionDays: 30
    };
  } catch {
    return {
      enabled: false,
      frequency: 'weekly',
      retentionDays: 30
    };
  }
}

/**
 * Set backup schedule
 */
export function setBackupSchedule(schedule: BackupSchedule): void {
  if (schedule.enabled) {
    schedule.nextBackup = calculateNextBackup(schedule.frequency);
  }
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
}

/**
 * Check if auto backup is due
 */
export function isBackupDue(): boolean {
  const schedule = getBackupSchedule();
  
  if (!schedule.enabled) return false;
  if (!schedule.nextBackup) return true;
  
  return Date.now() >= schedule.nextBackup;
}

/**
 * Run scheduled backup if due
 */
export async function runScheduledBackup(userId?: string): Promise<boolean> {
  if (!isBackupDue()) return false;
  
  const backup = await createBackup({
    description: 'Scheduled automatic backup'
  }, userId);
  
  saveLocalBackup(backup);
  
  // Update schedule
  const schedule = getBackupSchedule();
  schedule.lastBackup = Date.now();
  schedule.nextBackup = calculateNextBackup(schedule.frequency);
  setBackupSchedule(schedule);
  
  // Cleanup old backups
  cleanupOldBackups(schedule.retentionDays);
  
  return true;
}

function calculateNextBackup(frequency: BackupSchedule['frequency']): number {
  const now = Date.now();
  
  switch (frequency) {
    case 'daily':
      return now + 24 * 60 * 60 * 1000;
    case 'weekly':
      return now + 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return now + 30 * 24 * 60 * 60 * 1000;
    default:
      return now + 7 * 24 * 60 * 60 * 1000;
  }
}

function cleanupOldBackups(retentionDays: number): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const backups = getLocalBackups();
  
  for (const backup of backups) {
    if (backup.createdAt < cutoff) {
      deleteLocalBackup(backup.id);
    }
  }
}

// ==================== ENCRYPTION ====================

async function calculateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encryptBackup(backup: BackupData, password: string): Promise<BackupData> {
  const encoder = new TextEncoder();
  const data = JSON.stringify(backup.contacts);
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Encrypt data
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );
  
  // Store encrypted data as base64
  const encryptedArray = new Uint8Array(encryptedData);
  const encryptedBase64 = btoa(String.fromCharCode(...encryptedArray));
  
  return {
    metadata: { ...backup.metadata, encrypted: true },
    contacts: [],
    settings: {
      encryptedData: encryptedBase64,
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv))
    }
  };
}

async function decryptBackup(backup: BackupData, password: string): Promise<BackupData> {
  if (!backup.settings?.encryptedData) {
    throw new Error('No encrypted data found');
  }
  
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const salt = Uint8Array.from(atob(backup.settings.salt as string), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(backup.settings.iv as string), c => c.charCodeAt(0));
  const encryptedData = Uint8Array.from(atob(backup.settings.encryptedData as string), c => c.charCodeAt(0));
  
  // Derive key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decrypt
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );
  
  const contacts = JSON.parse(decoder.decode(decryptedData));
  
  return {
    metadata: { ...backup.metadata },
    contacts
  };
}

// ==================== DIFF & COMPARE ====================

/**
 * Compare two backups
 */
export function compareBackups(
  backup1: BackupData,
  backup2: BackupData
): {
  added: ContactInfo[];
  removed: ContactInfo[];
  modified: { before: ContactInfo; after: ContactInfo }[];
} {
  const contacts1 = new Map(backup1.contacts.map(c => [c.id, c]));
  const contacts2 = new Map(backup2.contacts.map(c => [c.id, c]));
  
  const added: ContactInfo[] = [];
  const removed: ContactInfo[] = [];
  const modified: { before: ContactInfo; after: ContactInfo }[] = [];
  
  // Find added and modified
  for (const [id, contact] of contacts2) {
    const original = contacts1.get(id);
    if (!original) {
      added.push(contact);
    } else if (JSON.stringify(original) !== JSON.stringify(contact)) {
      modified.push({ before: original, after: contact });
    }
  }
  
  // Find removed
  for (const [id, contact] of contacts1) {
    if (!contacts2.has(id)) {
      removed.push(contact);
    }
  }
  
  return { added, removed, modified };
}
