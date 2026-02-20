/**
 * Follow-up Reminder Service
 * Smart reminder system for contact follow-ups
 * Supports scheduled reminders, recurring tasks, and smart suggestions
 */

import { ContactInfo } from '../types';
import { getContactTags } from './smartTagging';

// ==================== TYPES ====================

export interface Reminder {
  id: string;
  contactId: string;
  contactName: string;
  type: ReminderType;
  title: string;
  notes?: string;
  dueDate: number;
  createdAt: number;
  completedAt?: number;
  status: 'pending' | 'completed' | 'snoozed' | 'cancelled';
  recurring?: RecurringConfig;
  priority: 'low' | 'medium' | 'high';
  notifications: NotificationConfig;
}

export type ReminderType =
  | 'follow_up'
  | 'meeting'
  | 'call'
  | 'email'
  | 'task'
  | 'birthday'
  | 'anniversary'
  | 'check_in'
  | 'custom';

export interface RecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  interval: number;
  endDate?: number;
  count?: number;
  completed: number;
}

export interface NotificationConfig {
  enabled: boolean;
  advance: number; // milliseconds before due date
  channels: ('browser' | 'sound')[];
}

export interface ReminderStats {
  total: number;
  pending: number;
  overdue: number;
  completedToday: number;
  completedThisWeek: number;
  upcomingThisWeek: number;
}

// ==================== STORAGE ====================

const REMINDERS_KEY = 'kksmartscan_reminders';
const SETTINGS_KEY = 'kksmartscan_reminder_settings';

export interface ReminderSettings {
  defaultAdvanceNotice: number;
  defaultRecurring: boolean;
  autoSuggestFollowups: boolean;
  newContactFollowupDays: number;
  vipFollowupDays: number;
}

const DEFAULT_SETTINGS: ReminderSettings = {
  defaultAdvanceNotice: 24 * 60 * 60 * 1000, // 1 day
  defaultRecurring: false,
  autoSuggestFollowups: true,
  newContactFollowupDays: 3,
  vipFollowupDays: 14
};

/**
 * Get all reminders
 */
export function getAllReminders(): Reminder[] {
  try {
    return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Save reminders
 */
function saveReminders(reminders: Reminder[]): void {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

/**
 * Get reminder settings
 */
export function getReminderSettings(): ReminderSettings {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save reminder settings
 */
export function updateReminderSettings(settings: Partial<ReminderSettings>): void {
  const current = getReminderSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

// ==================== REMINDER MANAGEMENT ====================

/**
 * Create a new reminder
 */
export function createReminder(
  contactId: string,
  contactName: string,
  type: ReminderType,
  title: string,
  dueDate: Date | number,
  options?: {
    notes?: string;
    priority?: Reminder['priority'];
    recurring?: RecurringConfig;
    notifications?: Partial<NotificationConfig>;
  }
): Reminder {
  const settings = getReminderSettings();
  const reminders = getAllReminders();
  
  const reminder: Reminder = {
    id: `reminder_${crypto.randomUUID()}`,
    contactId,
    contactName,
    type,
    title,
    notes: options?.notes,
    dueDate: typeof dueDate === 'number' ? dueDate : dueDate.getTime(),
    createdAt: Date.now(),
    status: 'pending',
    priority: options?.priority || 'medium',
    recurring: options?.recurring,
    notifications: {
      enabled: true,
      advance: settings.defaultAdvanceNotice,
      channels: ['browser'],
      ...options?.notifications
    }
  };
  
  reminders.push(reminder);
  saveReminders(reminders);
  
  // Schedule notification
  scheduleNotification(reminder);
  
  return reminder;
}

/**
 * Update a reminder
 */
export function updateReminder(
  reminderId: string,
  updates: Partial<Omit<Reminder, 'id' | 'createdAt'>>
): Reminder | null {
  const reminders = getAllReminders();
  const index = reminders.findIndex(r => r.id === reminderId);
  
  if (index === -1) return null;
  
  reminders[index] = { ...reminders[index], ...updates };
  saveReminders(reminders);
  
  return reminders[index];
}

/**
 * Delete a reminder
 */
export function deleteReminder(reminderId: string): void {
  const reminders = getAllReminders();
  saveReminders(reminders.filter(r => r.id !== reminderId));
}

/**
 * Complete a reminder
 */
export function completeReminder(reminderId: string): Reminder | null {
  const reminders = getAllReminders();
  const reminder = reminders.find(r => r.id === reminderId);
  
  if (!reminder) return null;
  
  reminder.status = 'completed';
  reminder.completedAt = Date.now();
  
  // Handle recurring reminders
  if (reminder.recurring) {
    const nextReminder = createNextRecurringReminder(reminder);
    if (nextReminder) {
      reminders.push(nextReminder);
    }
  }
  
  saveReminders(reminders);
  return reminder;
}

/**
 * Snooze a reminder
 */
export function snoozeReminder(
  reminderId: string,
  duration: number // milliseconds to snooze
): Reminder | null {
  const reminders = getAllReminders();
  const reminder = reminders.find(r => r.id === reminderId);
  
  if (!reminder) return null;
  
  reminder.status = 'snoozed';
  reminder.dueDate = Date.now() + duration;
  
  saveReminders(reminders);
  
  // Reschedule notification
  scheduleNotification(reminder);
  
  return reminder;
}

/**
 * Get reminders for a contact
 */
export function getContactReminders(contactId: string): Reminder[] {
  return getAllReminders().filter(r => r.contactId === contactId);
}

// ==================== SMART SUGGESTIONS ====================

/**
 * Generate follow-up suggestions for contacts
 */
export function generateFollowUpSuggestions(
  contacts: ContactInfo[]
): { contact: ContactInfo; reason: string; suggestedDate: number }[] {
  const suggestions: { contact: ContactInfo; reason: string; suggestedDate: number }[] = [];
  const settings = getReminderSettings();
  const existingReminders = getAllReminders();
  const contactsWithReminders = new Set(
    existingReminders
      .filter(r => r.status === 'pending')
      .map(r => r.contactId)
  );
  
  for (const contact of contacts) {
    // Skip if already has pending reminder
    if (contactsWithReminders.has(contact.id)) continue;
    
    const tags = getContactTags(contact.id);
    const daysSinceAdded = (Date.now() - contact.createdAt) / (24 * 60 * 60 * 1000);
    
    // New contacts
    if (daysSinceAdded <= settings.newContactFollowupDays + 1 && daysSinceAdded >= 1) {
      suggestions.push({
        contact,
        reason: 'New contact - time to follow up!',
        suggestedDate: Date.now() + 24 * 60 * 60 * 1000 // Tomorrow
      });
      continue;
    }
    
    // VIP contacts
    if (tags.includes('VIP') || tags.includes('Decision Maker')) {
      if (daysSinceAdded >= settings.vipFollowupDays) {
        suggestions.push({
          contact,
          reason: 'VIP contact - maintain relationship',
          suggestedDate: Date.now() + 3 * 24 * 60 * 60 * 1000 // 3 days
        });
        continue;
      }
    }
    
    // High priority contacts not contacted in 30 days
    if (tags.includes('High Priority') && daysSinceAdded >= 30) {
      suggestions.push({
        contact,
        reason: 'High priority contact - check in',
        suggestedDate: Date.now() + 7 * 24 * 60 * 60 * 1000 // 1 week
      });
    }
    
    // Contacts with complete data but no follow-up
    if (contact.email && contact.phone && !tags.includes('followed_up') && daysSinceAdded >= 7) {
      suggestions.push({
        contact,
        reason: 'Contact ready for engagement',
        suggestedDate: Date.now() + 5 * 24 * 60 * 60 * 1000 // 5 days
      });
    }
  }
  
  return suggestions
    .sort((a, b) => a.suggestedDate - b.suggestedDate)
    .slice(0, 10); // Top 10 suggestions
}

/**
 * Auto-create follow-up reminders for new contacts
 */
export function autoCreateFollowUps(contacts: ContactInfo[]): Reminder[] {
  const settings = getReminderSettings();
  if (!settings.autoSuggestFollowups) return [];
  
  const created: Reminder[] = [];
  const existingReminders = getAllReminders();
  const contactsWithReminders = new Set(
    existingReminders.map(r => r.contactId)
  );
  
  const newContactThreshold = settings.newContactFollowupDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const contact of contacts) {
    // Only for recent contacts without reminders
    if (contactsWithReminders.has(contact.id)) continue;
    if (now - contact.createdAt > newContactThreshold) continue;
    
    const dueDate = contact.createdAt + newContactThreshold;
    
    // Only create if due date is in the future
    if (dueDate > now) {
      const reminder = createReminder(
        contact.id,
        contact.name,
        'follow_up',
        `Follow up with ${contact.name}`,
        dueDate,
        {
          notes: 'Auto-created follow-up for new contact',
          priority: 'medium'
        }
      );
      created.push(reminder);
    }
  }
  
  return created;
}

// ==================== QUERIES ====================

/**
 * Get pending reminders
 */
export function getPendingReminders(): Reminder[] {
  return getAllReminders().filter(r => r.status === 'pending' || r.status === 'snoozed');
}

/**
 * Get overdue reminders
 */
export function getOverdueReminders(): Reminder[] {
  const now = Date.now();
  return getAllReminders().filter(
    r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate < now
  );
}

/**
 * Get reminders due today
 */
export function getTodayReminders(): Reminder[] {
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return getAllReminders().filter(
    r => (r.status === 'pending' || r.status === 'snoozed') &&
         r.dueDate >= today.getTime() && 
         r.dueDate < tomorrow.getTime()
  );
}

/**
 * Get reminders for this week
 */
export function getThisWeekReminders(): Reminder[] {
  const now = Date.now();
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  
  return getAllReminders().filter(
    r => (r.status === 'pending' || r.status === 'snoozed') &&
         r.dueDate >= now && 
         r.dueDate < weekEnd
  );
}

/**
 * Get reminder statistics
 */
export function getReminderStats(): ReminderStats {
  const reminders = getAllReminders();
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  
  return {
    total: reminders.length,
    pending: reminders.filter(r => r.status === 'pending').length,
    overdue: reminders.filter(
      r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate < now
    ).length,
    completedToday: reminders.filter(
      r => r.status === 'completed' && r.completedAt && r.completedAt >= today.getTime()
    ).length,
    completedThisWeek: reminders.filter(
      r => r.status === 'completed' && r.completedAt && r.completedAt >= weekAgo
    ).length,
    upcomingThisWeek: reminders.filter(
      r => (r.status === 'pending' || r.status === 'snoozed') &&
           r.dueDate >= now && r.dueDate < weekAhead
    ).length
  };
}

// ==================== QUICK ACTIONS ====================

/**
 * Quick create common reminder types
 */
export const QuickReminders = {
  followUpTomorrow: (contactId: string, contactName: string): Reminder => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    return createReminder(
      contactId,
      contactName,
      'follow_up',
      `Follow up with ${contactName}`,
      tomorrow,
      { priority: 'medium' }
    );
  },
  
  callNextWeek: (contactId: string, contactName: string): Reminder => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(10, 0, 0, 0);
    
    return createReminder(
      contactId,
      contactName,
      'call',
      `Schedule call with ${contactName}`,
      nextWeek,
      { priority: 'medium' }
    );
  },
  
  sendEmail: (contactId: string, contactName: string, daysFromNow: number = 1): Reminder => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysFromNow);
    dueDate.setHours(9, 0, 0, 0);
    
    return createReminder(
      contactId,
      contactName,
      'email',
      `Send email to ${contactName}`,
      dueDate,
      { priority: 'medium' }
    );
  },
  
  quarterlyCheckIn: (contactId: string, contactName: string): Reminder => {
    const nextQuarter = new Date();
    nextQuarter.setMonth(nextQuarter.getMonth() + 3);
    nextQuarter.setHours(9, 0, 0, 0);
    
    return createReminder(
      contactId,
      contactName,
      'check_in',
      `Quarterly check-in with ${contactName}`,
      nextQuarter,
      {
        priority: 'low',
        recurring: {
          frequency: 'quarterly',
          interval: 1,
          completed: 0
        }
      }
    );
  }
};

// ==================== UTILITIES ====================

/**
 * Create next recurring reminder
 */
function createNextRecurringReminder(reminder: Reminder): Reminder | null {
  if (!reminder.recurring) return null;
  
  const { frequency, interval, endDate, count, completed } = reminder.recurring;
  
  // Check if we've reached the count limit
  if (count !== undefined && completed >= count) return null;
  
  // Calculate next due date
  const nextDate = new Date(reminder.dueDate);
  
  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + (interval * 7));
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + (interval * 3));
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
  }
  
  // Check if we've passed the end date
  if (endDate && nextDate.getTime() > endDate) return null;
  
  return {
    ...reminder,
    id: `reminder_${crypto.randomUUID()}`,
    dueDate: nextDate.getTime(),
    createdAt: Date.now(),
    completedAt: undefined,
    status: 'pending',
    recurring: {
      ...reminder.recurring,
      completed: completed + 1
    }
  };
}

/**
 * Schedule browser notification
 */
function scheduleNotification(reminder: Reminder): void {
  if (!reminder.notifications.enabled) return;
  if (!('Notification' in window)) return;
  
  const notifyAt = reminder.dueDate - reminder.notifications.advance;
  const delay = notifyAt - Date.now();
  
  if (delay <= 0) return;
  
  // For simplicity, we'll check notifications periodically rather than scheduling
  // In a production app, you'd use service workers or a notification service
  console.log(`[Reminder] Scheduled notification for ${reminder.title} in ${Math.round(delay / 60000)} minutes`);
}

/**
 * Check and show due notifications
 * Call this periodically (e.g., every minute)
 */
export function checkNotifications(): Reminder[] {
  if (!('Notification' in window)) return [];
  if (Notification.permission !== 'granted') return [];
  
  const reminders = getAllReminders();
  const now = Date.now();
  const notified: Reminder[] = [];
  
  for (const reminder of reminders) {
    if (reminder.status !== 'pending') continue;
    if (!reminder.notifications.enabled) continue;
    
    const notifyAt = reminder.dueDate - reminder.notifications.advance;
    
    // Check if it's time to notify (within 1 minute window)
    if (now >= notifyAt && now < notifyAt + 60000) {
      new Notification(`Reminder: ${reminder.title}`, {
        body: reminder.notes || `Due: ${new Date(reminder.dueDate).toLocaleString()}`,
        icon: '/icon.png',
        tag: reminder.id
      });
      notified.push(reminder);
    }
  }
  
  return notified;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}
