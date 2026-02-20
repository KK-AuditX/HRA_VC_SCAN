/**
 * Data Sync Queue Service
 * Handles offline-first data operations with eventual consistency
 * Queues operations when offline and syncs when back online
 */

import { ContactInfo } from '../types';

// ==================== TYPES ====================

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'contact' | 'setting' | 'audit';
  entityId: string;
  data?: Partial<ContactInfo>;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingOperations: number;
  lastSyncAt: number | null;
  isSyncing: boolean;
  lastError: string | null;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: { operationId: string; error: string }[];
}

export interface ConflictResolution {
  operation: SyncOperation;
  serverData?: unknown;
  resolution: 'local' | 'server' | 'merge';
}

// Constants
const SYNC_QUEUE_KEY = 'kksmartscan_sync_queue';
const SYNC_STATUS_KEY = 'kksmartscan_sync_status';
const MAX_RETRY_COUNT = 5;
const RETRY_DELAYS = [1000, 5000, 15000, 60000, 300000]; // Exponential backoff

// ==================== SYNC QUEUE MANAGEMENT ====================

/**
 * Get all pending operations
 */
export function getSyncQueue(): SyncOperation[] {
  try {
    const data = localStorage.getItem(SYNC_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save sync queue
 */
function saveSyncQueue(queue: SyncOperation[]): void {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add operation to sync queue
 */
export function queueOperation(
  type: SyncOperation['type'],
  entityType: SyncOperation['entityType'],
  entityId: string,
  data?: Partial<ContactInfo>
): SyncOperation {
  const queue = getSyncQueue();
  
  // Check for existing operation on same entity
  const existingIndex = queue.findIndex(
    op => op.entityId === entityId && op.entityType === entityType && op.status === 'pending'
  );
  
  const operation: SyncOperation = {
    id: crypto.randomUUID(),
    type,
    entityType,
    entityId,
    data,
    timestamp: Date.now(),
    retryCount: 0,
    status: 'pending'
  };
  
  // Merge or replace existing operation
  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    
    // If deleting, replace any previous operation
    if (type === 'delete') {
      queue[existingIndex] = operation;
    }
    // If updating, merge data
    else if (type === 'update' && existing.type === 'update') {
      existing.data = { ...existing.data, ...data };
      existing.timestamp = Date.now();
    }
    // If was create, keep as create with merged data
    else if (existing.type === 'create' && type === 'update') {
      existing.data = { ...existing.data, ...data };
      existing.timestamp = Date.now();
    }
    // Otherwise add new operation
    else {
      queue.push(operation);
    }
  } else {
    queue.push(operation);
  }
  
  saveSyncQueue(queue);
  
  // Trigger sync if online
  if (isOnline()) {
    processSyncQueue();
  }
  
  return operation;
}

/**
 * Remove operation from queue
 */
export function removeFromQueue(operationId: string): void {
  const queue = getSyncQueue().filter(op => op.id !== operationId);
  saveSyncQueue(queue);
}

/**
 * Clear all pending operations
 */
export function clearSyncQueue(): void {
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

/**
 * Update operation status
 */
function updateOperationStatus(
  operationId: string,
  status: SyncOperation['status'],
  error?: string
): void {
  const queue = getSyncQueue();
  const operation = queue.find(op => op.id === operationId);
  
  if (operation) {
    operation.status = status;
    if (error) operation.error = error;
    if (status === 'failed') operation.retryCount++;
    saveSyncQueue(queue);
  }
}

// ==================== SYNC STATUS ====================

/**
 * Get sync status
 */
export function getSyncStatus(): SyncStatus {
  try {
    const data = localStorage.getItem(SYNC_STATUS_KEY);
    const saved = data ? JSON.parse(data) : {};
    
    return {
      isOnline: isOnline(),
      pendingOperations: getSyncQueue().filter(op => op.status === 'pending').length,
      lastSyncAt: saved.lastSyncAt || null,
      isSyncing: saved.isSyncing || false,
      lastError: saved.lastError || null
    };
  } catch {
    return {
      isOnline: isOnline(),
      pendingOperations: 0,
      lastSyncAt: null,
      isSyncing: false,
      lastError: null
    };
  }
}

/**
 * Update sync status
 */
function updateSyncStatus(updates: Partial<SyncStatus>): void {
  const current = getSyncStatus();
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify({ ...current, ...updates }));
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

// ==================== SYNC PROCESSING ====================

let syncInProgress = false;

/**
 * Process sync queue
 */
export async function processSyncQueue(): Promise<SyncResult> {
  if (syncInProgress || !isOnline()) {
    return {
      success: false,
      processed: 0,
      failed: 0,
      errors: []
    };
  }
  
  syncInProgress = true;
  updateSyncStatus({ isSyncing: true });
  
  const result: SyncResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: []
  };
  
  const queue = getSyncQueue();
  const pendingOps = queue.filter(op => 
    op.status === 'pending' || 
    (op.status === 'failed' && op.retryCount < MAX_RETRY_COUNT)
  );
  
  // Sort by timestamp (oldest first)
  pendingOps.sort((a, b) => a.timestamp - b.timestamp);
  
  for (const operation of pendingOps) {
    try {
      updateOperationStatus(operation.id, 'processing');
      
      // Simulate sync operation (in real app, this would call backend API)
      await simulateSyncOperation(operation);
      
      updateOperationStatus(operation.id, 'completed');
      result.processed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      updateOperationStatus(operation.id, 'failed', errorMessage);
      result.failed++;
      result.errors.push({ operationId: operation.id, error: errorMessage });
    }
  }
  
  // Clean up completed operations
  cleanupCompletedOperations();
  
  result.success = result.failed === 0;
  
  updateSyncStatus({
    isSyncing: false,
    lastSyncAt: Date.now(),
    lastError: result.errors.length > 0 ? result.errors[0].error : null
  });
  
  syncInProgress = false;
  
  return result;
}

/**
 * Simulate sync operation (placeholder for actual API calls)
 */
async function simulateSyncOperation(operation: SyncOperation): Promise<void> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // In a real implementation, this would:
  // 1. Call the backend API
  // 2. Handle conflicts
  // 3. Update local data with server response
  
  // Simulate occasional failures for demo
  if (Math.random() < 0.05) {
    throw new Error('Network error');
  }
}

/**
 * Clean up completed operations (keep last 100)
 */
function cleanupCompletedOperations(): void {
  const queue = getSyncQueue();
  const completed = queue.filter(op => op.status === 'completed');
  const other = queue.filter(op => op.status !== 'completed');
  
  // Keep only last 100 completed operations
  const trimmedCompleted = completed
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
  
  saveSyncQueue([...other, ...trimmedCompleted]);
}

// ==================== RETRY LOGIC ====================

/**
 * Retry failed operations
 */
export async function retryFailedOperations(): Promise<SyncResult> {
  const queue = getSyncQueue();
  
  // Reset status for retryable operations
  for (const op of queue) {
    if (op.status === 'failed' && op.retryCount < MAX_RETRY_COUNT) {
      op.status = 'pending';
    }
  }
  
  saveSyncQueue(queue);
  
  return processSyncQueue();
}

/**
 * Get retry delay for operation
 */
export function getRetryDelay(retryCount: number): number {
  return RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
}

// ==================== CONFLICT RESOLUTION ====================

let conflictHandler: ((conflict: ConflictResolution) => Promise<'local' | 'server' | 'merge'>) | null = null;

/**
 * Set conflict resolution handler
 */
export function setConflictHandler(
  handler: (conflict: ConflictResolution) => Promise<'local' | 'server' | 'merge'>
): void {
  conflictHandler = handler;
}

/**
 * Handle sync conflict
 */
async function handleConflict(
  operation: SyncOperation,
  serverData: unknown
): Promise<'local' | 'server' | 'merge'> {
  if (conflictHandler) {
    return conflictHandler({
      operation,
      serverData,
      resolution: 'local' // Default
    });
  }
  
  // Default: prefer local changes
  return 'local';
}

// ==================== NETWORK LISTENERS ====================

let isSetup = false;

/**
 * Setup network event listeners
 */
export function setupSyncListeners(): void {
  if (isSetup) return;
  
  window.addEventListener('online', () => {
    console.log('[Sync] Back online, processing queue...');
    updateSyncStatus({ isOnline: true });
    processSyncQueue();
  });
  
  window.addEventListener('offline', () => {
    console.log('[Sync] Went offline');
    updateSyncStatus({ isOnline: false });
  });
  
  isSetup = true;
}

/**
 * Cleanup listeners (for unmount)
 */
export function cleanupSyncListeners(): void {
  // Listeners are not removed as they're typically needed app-wide
  isSetup = false;
}

// ==================== PERIODIC SYNC ====================

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic sync
 */
export function startPeriodicSync(intervalMs: number = 30000): void {
  if (syncInterval) return;
  
  syncInterval = setInterval(() => {
    if (isOnline() && !syncInProgress) {
      processSyncQueue();
    }
  }, intervalMs);
}

/**
 * Stop periodic sync
 */
export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// ==================== STATISTICS ====================

/**
 * Get sync statistics
 */
export function getSyncStats(): {
  totalOperations: number;
  pending: number;
  completed: number;
  failed: number;
  byType: Record<string, number>;
  averageRetries: number;
} {
  const queue = getSyncQueue();
  
  const stats = {
    totalOperations: queue.length,
    pending: 0,
    completed: 0,
    failed: 0,
    byType: {} as Record<string, number>,
    averageRetries: 0
  };
  
  let totalRetries = 0;
  
  for (const op of queue) {
    switch (op.status) {
      case 'pending':
      case 'processing':
        stats.pending++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
        stats.failed++;
        break;
    }
    
    stats.byType[op.type] = (stats.byType[op.type] || 0) + 1;
    totalRetries += op.retryCount;
  }
  
  stats.averageRetries = queue.length > 0 ? totalRetries / queue.length : 0;
  
  return stats;
}

// ==================== EXPORT QUEUE FOR DEBUGGING ====================

/**
 * Export sync queue for debugging
 */
export function exportSyncQueue(): string {
  return JSON.stringify({
    queue: getSyncQueue(),
    status: getSyncStatus(),
    stats: getSyncStats()
  }, null, 2);
}

/**
 * Import sync queue (for testing)
 */
export function importSyncQueue(data: string): void {
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed.queue)) {
      saveSyncQueue(parsed.queue);
    }
  } catch {
    console.error('Failed to import sync queue');
  }
}
