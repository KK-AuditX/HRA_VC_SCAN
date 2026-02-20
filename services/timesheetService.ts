/**
 * Timesheet & Activity Logging Service
 * Track time spent on audit tasks for billing and productivity
 */

// ==================== TYPES ====================

export type TimesheetEntryType = 
  | 'scan'
  | 'review'
  | 'edit'
  | 'verification'
  | 'export'
  | 'report'
  | 'meeting'
  | 'research'
  | 'admin'
  | 'other';

export type BillingStatus = 
  | 'unbilled'
  | 'pending'
  | 'billed'
  | 'paid'
  | 'waived';

export interface TimesheetEntry {
  id: string;
  userId: string;
  projectId: string | null;
  contactId: string | null;
  type: TimesheetEntryType;
  description: string;
  startTime: number;
  endTime: number | null;
  duration: number; // in minutes
  isPaused: boolean;
  pausedDuration: number; // total paused time in minutes
  billingRate: number; // per hour
  billingStatus: BillingStatus;
  invoiceId: string | null;
  tags: string[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveTimer {
  entryId: string;
  userId: string;
  startTime: number;
  pausedAt: number | null;
  totalPausedDuration: number;
}

export interface TimesheetSummary {
  totalHours: number;
  totalMinutes: number;
  billableHours: number;
  billableAmount: number;
  entryCount: number;
  byType: Record<TimesheetEntryType, number>;
  byDay: Record<string, number>;
  avgDailyHours: number;
}

// ==================== STORAGE ====================

const TIMESHEET_STORAGE_KEY = 'kksmartscan_timesheet';
const ACTIVE_TIMER_KEY = 'kksmartscan_active_timer';

function getStoredEntries(): TimesheetEntry[] {
  try {
    const stored = localStorage.getItem(TIMESHEET_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: TimesheetEntry[]): void {
  localStorage.setItem(TIMESHEET_STORAGE_KEY, JSON.stringify(entries));
}

function getActiveTimer(): ActiveTimer | null {
  try {
    const stored = localStorage.getItem(ACTIVE_TIMER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveActiveTimer(timer: ActiveTimer | null): void {
  if (timer) {
    localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timer));
  } else {
    localStorage.removeItem(ACTIVE_TIMER_KEY);
  }
}

// ==================== TIMER OPERATIONS ====================

/**
 * Start a new time entry
 */
export function startTimer(
  userId: string,
  type: TimesheetEntryType,
  description: string,
  options: {
    projectId?: string;
    contactId?: string;
    billingRate?: number;
    tags?: string[];
  } = {}
): TimesheetEntry {
  // Stop any existing timer first
  const activeTimer = getActiveTimer();
  if (activeTimer) {
    stopTimer(userId);
  }

  const entries = getStoredEntries();
  const now = Date.now();

  const entry: TimesheetEntry = {
    id: `ts_${now}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    projectId: options.projectId || null,
    contactId: options.contactId || null,
    type,
    description,
    startTime: now,
    endTime: null,
    duration: 0,
    isPaused: false,
    pausedDuration: 0,
    billingRate: options.billingRate ?? 0,
    billingStatus: 'unbilled',
    invoiceId: null,
    tags: options.tags || [],
    notes: '',
    createdAt: now,
    updatedAt: now
  };

  entries.push(entry);
  saveEntries(entries);

  // Set active timer
  saveActiveTimer({
    entryId: entry.id,
    userId,
    startTime: now,
    pausedAt: null,
    totalPausedDuration: 0
  });

  return entry;
}

/**
 * Stop the active timer
 */
export function stopTimer(userId: string): TimesheetEntry | null {
  const activeTimer = getActiveTimer();
  if (!activeTimer || activeTimer.userId !== userId) return null;

  const entries = getStoredEntries();
  const entryIndex = entries.findIndex(e => e.id === activeTimer.entryId);
  if (entryIndex === -1) return null;

  const now = Date.now();
  const entry = entries[entryIndex];

  // Calculate duration excluding paused time
  let activeDuration = now - activeTimer.startTime;
  if (activeTimer.pausedAt) {
    // Currently paused, add time since pause started
    activeDuration -= (now - activeTimer.pausedAt);
  }
  activeDuration -= activeTimer.totalPausedDuration;

  entry.endTime = now;
  entry.duration = Math.round(activeDuration / 60000); // Convert to minutes
  entry.pausedDuration = Math.round(activeTimer.totalPausedDuration / 60000);
  entry.isPaused = false;
  entry.updatedAt = now;

  entries[entryIndex] = entry;
  saveEntries(entries);
  saveActiveTimer(null);

  return entry;
}

/**
 * Pause the active timer
 */
export function pauseTimer(userId: string): boolean {
  const activeTimer = getActiveTimer();
  if (!activeTimer || activeTimer.userId !== userId || activeTimer.pausedAt) {
    return false;
  }

  saveActiveTimer({
    ...activeTimer,
    pausedAt: Date.now()
  });

  // Update entry
  const entries = getStoredEntries();
  const entryIndex = entries.findIndex(e => e.id === activeTimer.entryId);
  if (entryIndex !== -1) {
    entries[entryIndex].isPaused = true;
    entries[entryIndex].updatedAt = Date.now();
    saveEntries(entries);
  }

  return true;
}

/**
 * Resume the paused timer
 */
export function resumeTimer(userId: string): boolean {
  const activeTimer = getActiveTimer();
  if (!activeTimer || activeTimer.userId !== userId || !activeTimer.pausedAt) {
    return false;
  }

  const pausedDuration = Date.now() - activeTimer.pausedAt;

  saveActiveTimer({
    ...activeTimer,
    pausedAt: null,
    totalPausedDuration: activeTimer.totalPausedDuration + pausedDuration
  });

  // Update entry
  const entries = getStoredEntries();
  const entryIndex = entries.findIndex(e => e.id === activeTimer.entryId);
  if (entryIndex !== -1) {
    entries[entryIndex].isPaused = false;
    entries[entryIndex].updatedAt = Date.now();
    saveEntries(entries);
  }

  return true;
}

/**
 * Get current active timer status
 */
export function getTimerStatus(userId: string): {
  isRunning: boolean;
  isPaused: boolean;
  entry: TimesheetEntry | null;
  elapsedMinutes: number;
} {
  const activeTimer = getActiveTimer();
  
  if (!activeTimer || activeTimer.userId !== userId) {
    return { isRunning: false, isPaused: false, entry: null, elapsedMinutes: 0 };
  }

  const entries = getStoredEntries();
  const entry = entries.find(e => e.id === activeTimer.entryId) || null;

  let elapsed = Date.now() - activeTimer.startTime;
  if (activeTimer.pausedAt) {
    elapsed -= (Date.now() - activeTimer.pausedAt);
  }
  elapsed -= activeTimer.totalPausedDuration;

  return {
    isRunning: true,
    isPaused: !!activeTimer.pausedAt,
    entry,
    elapsedMinutes: Math.round(elapsed / 60000)
  };
}

// ==================== MANUAL ENTRIES ====================

/**
 * Add a manual time entry
 */
export function addManualEntry(
  entry: Omit<TimesheetEntry, 'id' | 'isPaused' | 'pausedDuration' | 'createdAt' | 'updatedAt'>
): TimesheetEntry {
  const entries = getStoredEntries();
  const now = Date.now();

  const newEntry: TimesheetEntry = {
    ...entry,
    id: `ts_${now}_${Math.random().toString(36).substr(2, 9)}`,
    isPaused: false,
    pausedDuration: 0,
    createdAt: now,
    updatedAt: now
  };

  entries.push(newEntry);
  saveEntries(entries);

  return newEntry;
}

/**
 * Update a time entry
 */
export function updateEntry(
  entryId: string,
  updates: Partial<Omit<TimesheetEntry, 'id' | 'createdAt'>>
): TimesheetEntry | null {
  const entries = getStoredEntries();
  const index = entries.findIndex(e => e.id === entryId);
  
  if (index === -1) return null;

  entries[index] = {
    ...entries[index],
    ...updates,
    updatedAt: Date.now()
  };

  saveEntries(entries);
  return entries[index];
}

/**
 * Delete a time entry
 */
export function deleteEntry(entryId: string): boolean {
  const entries = getStoredEntries();
  const filtered = entries.filter(e => e.id !== entryId);
  
  if (filtered.length === entries.length) return false;
  
  saveEntries(filtered);
  return true;
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get all entries for a user
 */
export function getUserEntries(userId: string): TimesheetEntry[] {
  return getStoredEntries().filter(e => e.userId === userId);
}

/**
 * Get entries by date range
 */
export function getEntriesByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): TimesheetEntry[] {
  const start = startDate.getTime();
  const end = endDate.getTime();
  
  return getStoredEntries().filter(
    e => e.userId === userId && e.startTime >= start && e.startTime <= end
  );
}

/**
 * Get entries for a specific contact
 */
export function getContactEntries(contactId: string): TimesheetEntry[] {
  return getStoredEntries().filter(e => e.contactId === contactId);
}

/**
 * Get entries for a specific project
 */
export function getProjectEntries(projectId: string): TimesheetEntry[] {
  return getStoredEntries().filter(e => e.projectId === projectId);
}

/**
 * Get entries by billing status
 */
export function getEntriesByBillingStatus(status: BillingStatus): TimesheetEntry[] {
  return getStoredEntries().filter(e => e.billingStatus === status);
}

// ==================== BILLING OPERATIONS ====================

/**
 * Update billing status for entries
 */
export function updateBillingStatus(
  entryIds: string[],
  status: BillingStatus,
  invoiceId?: string
): number {
  const entries = getStoredEntries();
  let updated = 0;

  entries.forEach(entry => {
    if (entryIds.includes(entry.id)) {
      entry.billingStatus = status;
      if (invoiceId) entry.invoiceId = invoiceId;
      entry.updatedAt = Date.now();
      updated++;
    }
  });

  saveEntries(entries);
  return updated;
}

/**
 * Calculate billable amount for entries
 */
export function calculateBillableAmount(entries: TimesheetEntry[]): number {
  return entries.reduce((total, entry) => {
    const hours = entry.duration / 60;
    return total + (hours * entry.billingRate);
  }, 0);
}

// ==================== SUMMARY & ANALYTICS ====================

/**
 * Generate timesheet summary
 */
export function getTimesheetSummary(
  userId: string,
  startDate: Date,
  endDate: Date
): TimesheetSummary {
  const entries = getEntriesByDateRange(userId, startDate, endDate);
  
  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let totalMinutes = 0;
  let billableMinutes = 0;
  let billableAmount = 0;

  entries.forEach(entry => {
    totalMinutes += entry.duration;
    
    // By type
    byType[entry.type] = (byType[entry.type] || 0) + entry.duration;
    
    // By day
    const day = new Date(entry.startTime).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + entry.duration;
    
    // Billable
    if (entry.billingRate > 0 && entry.billingStatus !== 'waived') {
      billableMinutes += entry.duration;
      billableAmount += (entry.duration / 60) * entry.billingRate;
    }
  });

  const daysWithEntries = Object.keys(byDay).length;

  return {
    totalHours: Math.floor(totalMinutes / 60),
    totalMinutes: totalMinutes % 60,
    billableHours: Math.round(billableMinutes / 60 * 100) / 100,
    billableAmount: Math.round(billableAmount * 100) / 100,
    entryCount: entries.length,
    byType: byType as Record<TimesheetEntryType, number>,
    byDay,
    avgDailyHours: daysWithEntries > 0 
      ? Math.round((totalMinutes / daysWithEntries / 60) * 100) / 100 
      : 0
  };
}

/**
 * Get weekly summary
 */
export function getWeeklySummary(userId: string): TimesheetSummary {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return getTimesheetSummary(userId, weekStart, weekEnd);
}

/**
 * Get monthly summary
 */
export function getMonthlySummary(userId: string): TimesheetSummary {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  return getTimesheetSummary(userId, monthStart, monthEnd);
}

// ==================== FORMAT HELPERS ====================

/**
 * Format duration for display
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format billable amount
 */
export function formatAmount(amount: number, currency: string = '₹'): string {
  return `${currency}${amount.toLocaleString('en-IN', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

/**
 * Get type display name
 */
export function getTypeDisplayName(type: TimesheetEntryType): string {
  const names: Record<TimesheetEntryType, string> = {
    scan: 'Card Scanning',
    review: 'Review',
    edit: 'Editing',
    verification: 'Verification',
    export: 'Export',
    report: 'Reporting',
    meeting: 'Meeting',
    research: 'Research',
    admin: 'Admin',
    other: 'Other'
  };
  return names[type];
}
