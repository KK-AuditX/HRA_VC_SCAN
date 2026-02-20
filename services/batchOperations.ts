/**
 * Batch Operations Service
 * Handles bulk operations on contacts: edit, tag, delete, merge
 * Features concurrency limiter to prevent API rate limits and browser crashes
 */

import { ContactInfo } from '../types';
import { saveContact, deleteContacts } from './database';
import { normalizeContactFields } from '../utils/validators';
import { findDuplicates, mergeContacts } from '../utils/duplicateDetection';

// ==================== CONCURRENCY LIMITER ====================

export class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];
  
  constructor(private maxConcurrent: number = 3) {}
  
  async execute<T>(task: () => Promise<T>): Promise<T> {
    // Wait for slot
    await this.acquireSlot();
    
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }
  
  private acquireSlot(): Promise<void> {
    return new Promise(resolve => {
      if (this.running < this.maxConcurrent) {
        this.running++;
        resolve();
      } else {
        this.queue.push(() => {
          this.running++;
          resolve();
        });
      }
    });
  }
  
  private releaseSlot(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
  
  get pendingCount(): number {
    return this.queue.length;
  }
  
  get runningCount(): number {
    return this.running;
  }
}

/**
 * Process items with concurrency limit
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    maxConcurrent?: number;
    onProgress?: (completed: number, total: number) => void;
    onError?: (item: T, error: Error) => void;
  } = {}
): Promise<{ results: R[]; errors: Array<{ item: T; error: Error }> }> {
  const { maxConcurrent = 3, onProgress, onError } = options;
  const limiter = new ConcurrencyLimiter(maxConcurrent);
  
  const results: R[] = new Array(items.length);
  const errors: Array<{ item: T; error: Error }> = [];
  let completed = 0;
  
  const tasks = items.map((item, index) =>
    limiter.execute(async () => {
      try {
        results[index] = await processor(item, index);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        errors.push({ item, error });
        onError?.(item, error);
      } finally {
        completed++;
        onProgress?.(completed, items.length);
      }
    })
  );
  
  await Promise.all(tasks);
  
  return { results: results.filter(r => r !== undefined), errors };
}

// ==================== TYPES ====================

export interface BatchOperation {
  id: string;
  type: 'update' | 'delete' | 'tag' | 'merge' | 'assign';
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  errors: BatchError[];
  startedAt?: number;
  completedAt?: number;
}

export interface BatchError {
  contactId: string;
  contactName: string;
  error: string;
}

export interface BatchUpdatePayload {
  industry?: string;
  notes?: string;
  tags?: string[];
  status?: string;
  [key: string]: unknown;
}

export interface BatchResult {
  operation: BatchOperation;
  updatedContacts: ContactInfo[];
}

// ==================== BATCH UPDATE ====================

/**
 * Batch update multiple contacts
 */
export async function batchUpdate(
  contacts: ContactInfo[],
  updates: BatchUpdatePayload,
  userId?: string,
  onProgress?: (progress: number) => void
): Promise<BatchResult> {
  const operation: BatchOperation = {
    id: crypto.randomUUID(),
    type: 'update',
    status: 'running',
    totalItems: contacts.length,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
    startedAt: Date.now()
  };

  const updatedContacts: ContactInfo[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    
    try {
      // Apply updates (preserve status type)
      const updatedContact: ContactInfo = {
        ...contact,
        ...updates,
        status: contact.status, // Preserve original status
        updatedAt: Date.now(),
        updatedBy: userId
      };

      // Normalize fields
      const normalized = normalizeContactFields(updatedContact);
      Object.assign(updatedContact, normalized);

      // Save to database
      await saveContact(updatedContact, true);
      
      updatedContacts.push(updatedContact);
      operation.successCount++;
    } catch (error) {
      operation.errorCount++;
      operation.errors.push({
        contactId: contact.id,
        contactName: contact.name,
        error: error instanceof Error ? error.message : 'Update failed'
      });
    }

    operation.processedItems++;
    
    if (onProgress) {
      onProgress((operation.processedItems / operation.totalItems) * 100);
    }
  }

  operation.status = operation.errorCount === 0 ? 'completed' : 'failed';
  operation.completedAt = Date.now();

  return { operation, updatedContacts };
}

/**
 * Batch update a specific field
 */
export async function batchUpdateField(
  contacts: ContactInfo[],
  field: keyof ContactInfo,
  value: string,
  userId?: string
): Promise<BatchResult> {
  return batchUpdate(contacts, { [field]: value }, userId);
}

// ==================== BATCH DELETE ====================

/**
 * Batch delete multiple contacts
 */
export async function batchDelete(
  contacts: ContactInfo[],
  userId?: string,
  onProgress?: (progress: number) => void
): Promise<BatchOperation> {
  const operation: BatchOperation = {
    id: crypto.randomUUID(),
    type: 'delete',
    status: 'running',
    totalItems: contacts.length,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
    startedAt: Date.now()
  };

  try {
    // Delete all at once
    await deleteContacts(contacts.map(c => c.id));
    operation.successCount = contacts.length;
    operation.processedItems = contacts.length;
    
    if (onProgress) {
      onProgress(100);
    }
  } catch (error) {
    operation.errorCount = contacts.length;
    operation.errors.push({
      contactId: 'batch',
      contactName: 'Batch operation',
      error: error instanceof Error ? error.message : 'Batch delete failed'
    });
  }

  operation.status = operation.errorCount === 0 ? 'completed' : 'failed';
  operation.completedAt = Date.now();

  return operation;
}

// ==================== BATCH TAGGING ====================

/**
 * Add tags to multiple contacts
 */
export async function batchAddTag(
  contacts: ContactInfo[],
  tag: string,
  userId?: string
): Promise<BatchResult> {
  const updates: BatchUpdatePayload = {};
  
  // For now, we'll append to notes since we don't have a tags field
  // In a real implementation, you'd have a tags array field
  const updatedContacts: ContactInfo[] = [];
  
  for (const contact of contacts) {
    const existingNotes = contact.notes || '';
    const tagPrefix = '#';
    
    // Check if tag already exists
    if (!existingNotes.includes(`${tagPrefix}${tag}`)) {
      updates.notes = existingNotes 
        ? `${existingNotes} ${tagPrefix}${tag}` 
        : `${tagPrefix}${tag}`;
    }

    const updated: ContactInfo = {
      ...contact,
      notes: (updates.notes as string) || contact.notes,
      updatedAt: Date.now(),
      updatedBy: userId
    };
    
    await saveContact(updated, true);
    updatedContacts.push(updated);
  }

  const operation: BatchOperation = {
    id: crypto.randomUUID(),
    type: 'tag',
    status: 'completed',
    totalItems: contacts.length,
    processedItems: contacts.length,
    successCount: contacts.length,
    errorCount: 0,
    errors: [],
    startedAt: Date.now(),
    completedAt: Date.now()
  };

  return { operation, updatedContacts };
}

/**
 * Remove tag from multiple contacts
 */
export async function batchRemoveTag(
  contacts: ContactInfo[],
  tag: string,
  userId?: string
): Promise<BatchResult> {
  const updatedContacts: ContactInfo[] = [];
  const tagPattern = new RegExp(`#${tag}\\b`, 'gi');
  
  for (const contact of contacts) {
    const newNotes = (contact.notes || '').replace(tagPattern, '').trim();
    
    const updated: ContactInfo = {
      ...contact,
      notes: newNotes,
      updatedAt: Date.now(),
      updatedBy: userId
    };
    
    await saveContact(updated, true);
    updatedContacts.push(updated);
  }

  const operation: BatchOperation = {
    id: crypto.randomUUID(),
    type: 'tag',
    status: 'completed',
    totalItems: contacts.length,
    processedItems: contacts.length,
    successCount: contacts.length,
    errorCount: 0,
    errors: [],
    startedAt: Date.now(),
    completedAt: Date.now()
  };

  return { operation, updatedContacts };
}

// ==================== BATCH MERGE ====================

/**
 * Find and merge duplicate contacts
 */
export async function batchMergeDuplicates(
  contacts: ContactInfo[],
  userId?: string,
  onProgress?: (progress: number) => void
): Promise<{
  operation: BatchOperation;
  mergedContacts: ContactInfo[];
  deletedIds: string[];
}> {
  const operation: BatchOperation = {
    id: crypto.randomUUID(),
    type: 'merge',
    status: 'running',
    totalItems: contacts.length,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
    startedAt: Date.now()
  };

  const mergedContacts: ContactInfo[] = [];
  const deletedIds: string[] = [];
  const processedIds = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    
    if (processedIds.has(contact.id)) {
      operation.processedItems++;
      continue;
    }
    
    processedIds.add(contact.id);
    
    // Find duplicates among remaining contacts
    const remaining = contacts.filter(c => !processedIds.has(c.id));
    const duplicates = findDuplicates(contact, remaining);
    
    const definiteDuplicates = duplicates.filter(
      d => d.confidence === 'definite' || d.confidence === 'likely'
    );
    
    if (definiteDuplicates.length > 0) {
      try {
        // Merge all duplicates into current contact
        let merged = { ...contact };
        
        for (const dup of definiteDuplicates) {
          merged = mergeContacts(merged, dup.contact);
          processedIds.add(dup.contact.id);
          deletedIds.push(dup.contact.id);
        }
        
        merged.updatedAt = Date.now();
        merged.updatedBy = userId;
        
        await saveContact(merged, true);
        mergedContacts.push(merged);
        operation.successCount++;
      } catch (error) {
        operation.errorCount++;
        operation.errors.push({
          contactId: contact.id,
          contactName: contact.name,
          error: error instanceof Error ? error.message : 'Merge failed'
        });
      }
    } else {
      mergedContacts.push(contact);
    }
    
    operation.processedItems++;
    
    if (onProgress) {
      onProgress((operation.processedItems / operation.totalItems) * 100);
    }
  }

  // Delete merged duplicates
  if (deletedIds.length > 0) {
    try {
      await deleteContacts(deletedIds);
    } catch (error) {
      console.error('Failed to delete merged duplicates:', error);
    }
  }

  operation.status = operation.errorCount === 0 ? 'completed' : 'failed';
  operation.completedAt = Date.now();

  return { operation, mergedContacts, deletedIds };
}

// ==================== BATCH ASSIGN ====================

/**
 * Assign contacts to an industry/category
 */
export async function batchAssignIndustry(
  contacts: ContactInfo[],
  industry: string,
  userId?: string
): Promise<BatchResult> {
  return batchUpdate(contacts, { industry }, userId);
}

/**
 * Clear a field across multiple contacts
 */
export async function batchClearField(
  contacts: ContactInfo[],
  field: keyof ContactInfo,
  userId?: string
): Promise<BatchResult> {
  return batchUpdate(contacts, { [field]: '' }, userId);
}

// ==================== VALIDATION ====================

/**
 * Validate batch operation before execution
 */
export function validateBatchOperation(
  type: BatchOperation['type'],
  contacts: ContactInfo[],
  payload?: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!contacts || contacts.length === 0) {
    errors.push('No contacts selected for batch operation');
    return { valid: false, errors };
  }

  if (contacts.length > 10000) {
    errors.push('Batch operations limited to 10,000 contacts at a time');
  }

  switch (type) {
    case 'update':
      if (!payload || typeof payload !== 'object') {
        errors.push('Update payload is required');
      }
      break;
    case 'delete':
      // No additional validation needed
      break;
    case 'tag':
      if (!payload || typeof payload !== 'string') {
        errors.push('Tag name is required');
      }
      break;
    case 'merge':
      if (contacts.length < 2) {
        errors.push('At least 2 contacts required for merge operation');
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}

// ==================== OPERATION HISTORY ====================

const OPERATION_HISTORY_KEY = 'kksmartscan_batch_history';
const MAX_HISTORY = 100;

/**
 * Save operation to history
 */
export function saveOperationToHistory(operation: BatchOperation): void {
  const history = getOperationHistory();
  history.unshift(operation);
  
  // Limit history size
  const trimmed = history.slice(0, MAX_HISTORY);
  localStorage.setItem(OPERATION_HISTORY_KEY, JSON.stringify(trimmed));
}

/**
 * Get operation history
 */
export function getOperationHistory(): BatchOperation[] {
  try {
    const data = localStorage.getItem(OPERATION_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Clear operation history
 */
export function clearOperationHistory(): void {
  localStorage.removeItem(OPERATION_HISTORY_KEY);
}

/**
 * Get operation statistics
 */
export function getOperationStats(): {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalItemsProcessed: number;
  operationsByType: Record<string, number>;
} {
  const history = getOperationHistory();
  
  const stats = {
    totalOperations: history.length,
    successfulOperations: 0,
    failedOperations: 0,
    totalItemsProcessed: 0,
    operationsByType: {} as Record<string, number>
  };
  
  for (const op of history) {
    if (op.status === 'completed') {
      stats.successfulOperations++;
    } else if (op.status === 'failed') {
      stats.failedOperations++;
    }
    
    stats.totalItemsProcessed += op.processedItems;
    stats.operationsByType[op.type] = (stats.operationsByType[op.type] || 0) + 1;
  }
  
  return stats;
}
