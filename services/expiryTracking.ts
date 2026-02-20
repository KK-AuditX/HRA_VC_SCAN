/**
 * Expiry Tracking Service
 * Track document and license expiry with visual countdowns
 */

// ==================== TYPES ====================

export type ExpiryItemType = 
  | 'license'
  | 'certificate'
  | 'registration'
  | 'insurance'
  | 'contract'
  | 'kyc'
  | 'pan'
  | 'gstin'
  | 'document'
  | 'other';

export type ExpiryStatus = 
  | 'valid'
  | 'expiring_soon'
  | 'expired'
  | 'renewed';

export interface ExpiryItem {
  id: string;
  contactId: string;
  contactName: string;
  type: ExpiryItemType;
  name: string;
  description: string;
  issueDate: number | null;
  expiryDate: number;
  renewalDate: number | null;
  reminderDays: number[];
  notificationsSent: number[];
  status: ExpiryStatus;
  documentUrl: string | null;
  notes: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExpiryReminder {
  itemId: string;
  contactId: string;
  contactName: string;
  itemName: string;
  itemType: ExpiryItemType;
  daysUntilExpiry: number;
  expiryDate: number;
  isOverdue: boolean;
}

export interface ExpiryCountdown {
  days: number;
  hours: number;
  minutes: number;
  totalDays: number;
  isExpired: boolean;
  statusText: string;
  statusColor: string;
}

// ==================== STORAGE ====================

const EXPIRY_STORAGE_KEY = 'kksmartscan_expiry_items';

function getStoredItems(): ExpiryItem[] {
  try {
    const stored = localStorage.getItem(EXPIRY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveItems(items: ExpiryItem[]): void {
  localStorage.setItem(EXPIRY_STORAGE_KEY, JSON.stringify(items));
}

// ==================== EXPIRY OPERATIONS ====================

/**
 * Create a new expiry tracking item
 */
export function createExpiryItem(
  item: Omit<ExpiryItem, 'id' | 'status' | 'notificationsSent' | 'createdAt' | 'updatedAt'>
): ExpiryItem {
  const items = getStoredItems();
  
  const newItem: ExpiryItem = {
    ...item,
    id: `expiry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: calculateExpiryStatus(item.expiryDate),
    notificationsSent: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  items.push(newItem);
  saveItems(items);
  
  return newItem;
}

/**
 * Update an expiry item
 */
export function updateExpiryItem(
  itemId: string,
  updates: Partial<Omit<ExpiryItem, 'id' | 'createdAt'>>
): ExpiryItem | null {
  const items = getStoredItems();
  const index = items.findIndex(i => i.id === itemId);
  
  if (index === -1) return null;
  
  // Preserve 'renewed' status unless explicitly changed
  const currentStatus = items[index].status;
  const shouldPreserveRenewed = currentStatus === 'renewed' && !updates.status;
  
  items[index] = {
    ...items[index],
    ...updates,
    status: shouldPreserveRenewed 
      ? 'renewed'
      : (updates.expiryDate ? calculateExpiryStatus(updates.expiryDate) : items[index].status),
    updatedAt: Date.now()
  };
  
  saveItems(items);
  return items[index];
}

/**
 * Delete an expiry item
 */
export function deleteExpiryItem(itemId: string): boolean {
  const items = getStoredItems();
  const filtered = items.filter(i => i.id !== itemId);
  
  if (filtered.length === items.length) return false;
  
  saveItems(filtered);
  return true;
}

/**
 * Mark item as renewed
 */
export function renewExpiryItem(
  itemId: string,
  newExpiryDate: number
): ExpiryItem | null {
  // Validate that new expiry date is in the future
  if (newExpiryDate <= Date.now()) {
    console.error('Renewal expiry date must be in the future');
    return null;
  }
  
  const items = getStoredItems();
  const index = items.findIndex(i => i.id === itemId);
  
  if (index === -1) return null;
  
  items[index] = {
    ...items[index],
    renewalDate: Date.now(),
    expiryDate: newExpiryDate,
    status: 'renewed',
    notificationsSent: [], // Reset notifications
    updatedAt: Date.now()
  };
  
  saveItems(items);
  return items[index];
}

// ==================== STATUS CALCULATION ====================

/**
 * Calculate expiry status based on expiry date
 */
function calculateExpiryStatus(expiryDate: number): ExpiryStatus {
  const now = Date.now();
  const daysUntil = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring_soon';
  return 'valid';
}

/**
 * Calculate countdown to expiry
 */
export function calculateCountdown(expiryDate: number): ExpiryCountdown {
  const now = Date.now();
  const diff = expiryDate - now;
  const isExpired = diff < 0;
  const absDiff = Math.abs(diff);
  
  const totalDays = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const remainingHours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  
  let statusText: string;
  let statusColor: string;
  
  if (isExpired) {
    statusText = `Expired ${totalDays} day${totalDays !== 1 ? 's' : ''} ago`;
    statusColor = 'rose';
  } else if (totalDays === 0) {
    statusText = 'Expires today!';
    statusColor = 'rose';
  } else if (totalDays <= 7) {
    statusText = `Expires in ${totalDays} day${totalDays !== 1 ? 's' : ''}`;
    statusColor = 'amber';
  } else if (totalDays <= 30) {
    statusText = `Expires in ${totalDays} days`;
    statusColor = 'amber';
  } else if (totalDays <= 90) {
    statusText = `Expires in ${totalDays} days`;
    statusColor = 'blue';
  } else {
    statusText = `Valid for ${totalDays} days`;
    statusColor = 'emerald';
  }
  
  return {
    days: isExpired ? -totalDays : totalDays,
    hours: remainingHours,
    minutes: remainingMinutes,
    totalDays: isExpired ? -totalDays : totalDays,
    isExpired,
    statusText,
    statusColor
  };
}

/**
 * Update all item statuses
 */
export function updateAllStatuses(): ExpiryItem[] {
  const items = getStoredItems();
  let updated = false;
  
  for (const item of items) {
    if (item.status !== 'renewed') {
      const newStatus = calculateExpiryStatus(item.expiryDate);
      if (item.status !== newStatus) {
        item.status = newStatus;
        item.updatedAt = Date.now();
        updated = true;
      }
    }
  }
  
  if (updated) {
    saveItems(items);
  }
  
  return items;
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get all expiry items
 */
export function getAllExpiryItems(): ExpiryItem[] {
  return updateAllStatuses();
}

/**
 * Get expiry items for a contact
 */
export function getContactExpiryItems(contactId: string): ExpiryItem[] {
  const items = updateAllStatuses();
  return items.filter(i => i.contactId === contactId);
}

/**
 * Get expired items
 */
export function getExpiredItems(): ExpiryItem[] {
  const items = updateAllStatuses();
  return items.filter(i => i.status === 'expired');
}

/**
 * Get items expiring soon (within days)
 */
export function getExpiringSoon(days: number = 30): ExpiryItem[] {
  const items = updateAllStatuses();
  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
  return items.filter(i => i.expiryDate <= cutoff && i.status !== 'expired');
}

/**
 * Get items by type
 */
export function getItemsByType(type: ExpiryItemType): ExpiryItem[] {
  const items = updateAllStatuses();
  return items.filter(i => i.type === type);
}

// ==================== REMINDERS ====================

/**
 * Get all pending reminders
 */
export function getPendingReminders(): ExpiryReminder[] {
  const items = updateAllStatuses();
  const reminders: ExpiryReminder[] = [];
  
  for (const item of items) {
    if (item.status === 'renewed') continue;
    
    const countdown = calculateCountdown(item.expiryDate);
    
    // Check if any reminder day threshold is met
    const shouldRemind = item.reminderDays.some(days => {
      if (countdown.isExpired) return true;
      return countdown.totalDays <= days && !item.notificationsSent.includes(days);
    });
    
    if (shouldRemind || countdown.isExpired) {
      reminders.push({
        itemId: item.id,
        contactId: item.contactId,
        contactName: item.contactName,
        itemName: item.name,
        itemType: item.type,
        daysUntilExpiry: countdown.totalDays,
        expiryDate: item.expiryDate,
        isOverdue: countdown.isExpired
      });
    }
  }
  
  // Sort by urgency (overdue first, then by days)
  return reminders.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.daysUntilExpiry - b.daysUntilExpiry;
  });
}

/**
 * Mark reminder as sent
 */
export function markReminderSent(itemId: string, reminderDay: number): void {
  const items = getStoredItems();
  const index = items.findIndex(i => i.id === itemId);
  
  if (index !== -1 && !items[index].notificationsSent.includes(reminderDay)) {
    items[index].notificationsSent.push(reminderDay);
    items[index].updatedAt = Date.now();
    saveItems(items);
  }
}

// ==================== STATS ====================

export interface ExpiryStats {
  total: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  renewed: number;
  byType: Record<string, number>;
  upcomingThisWeek: number;
  upcomingThisMonth: number;
}

export function getExpiryStats(): ExpiryStats {
  const items = updateAllStatuses();
  
  const byType: Record<string, number> = {};
  let valid = 0;
  let expiringSoon = 0;
  let expired = 0;
  let renewed = 0;
  
  const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const monthFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
  let upcomingThisWeek = 0;
  let upcomingThisMonth = 0;
  
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    
    switch (item.status) {
      case 'valid': valid++; break;
      case 'expiring_soon': expiringSoon++; break;
      case 'expired': expired++; break;
      case 'renewed': renewed++; break;
    }
    
    if (item.status !== 'expired' && item.status !== 'renewed') {
      if (item.expiryDate <= weekFromNow) upcomingThisWeek++;
      if (item.expiryDate <= monthFromNow) upcomingThisMonth++;
    }
  }
  
  return {
    total: items.length,
    valid,
    expiringSoon,
    expired,
    renewed,
    byType,
    upcomingThisWeek,
    upcomingThisMonth
  };
}

// ==================== DISPLAY HELPERS ====================

/**
 * Get type display name
 */
export function getTypeDisplayName(type: ExpiryItemType): string {
  const names: Record<ExpiryItemType, string> = {
    license: 'License',
    certificate: 'Certificate',
    registration: 'Registration',
    insurance: 'Insurance',
    contract: 'Contract',
    kyc: 'KYC Document',
    pan: 'PAN Card',
    gstin: 'GST Registration',
    document: 'Document',
    other: 'Other'
  };
  return names[type];
}

/**
 * Get status badge style
 */
export function getStatusBadgeStyle(status: ExpiryStatus): { bg: string; text: string } {
  const styles: Record<ExpiryStatus, { bg: string; text: string }> = {
    valid: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    expiring_soon: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    expired: { bg: 'bg-rose-500/20', text: 'text-rose-400' },
    renewed: { bg: 'bg-blue-500/20', text: 'text-blue-400' }
  };
  return styles[status];
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}
