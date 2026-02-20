/**
 * Activity Feed Service
 * Real-time team activity tracking and notifications
 */

import { AppUser, ContactInfo } from '../types';

// ==================== TYPES ====================

export type ActivityType = 
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'contact.viewed'
  | 'comment.added'
  | 'comment.replied'
  | 'mention.received'
  | 'note.created'
  | 'note.updated'
  | 'tag.added'
  | 'tag.removed'
  | 'reminder.created'
  | 'reminder.completed'
  | 'export.completed'
  | 'import.completed'
  | 'user.joined'
  | 'user.invited';

export interface Activity {
  id: string;
  type: ActivityType;
  userId: string;
  userName: string;
  userEmail: string;
  targetId: string; // Contact ID, comment ID, etc.
  targetType: 'contact' | 'comment' | 'note' | 'tag' | 'reminder' | 'user' | 'system';
  targetName: string;
  description: string;
  metadata: Record<string, any>;
  isRead: boolean;
  createdAt: number;
}

export interface ActivityFilter {
  types?: ActivityType[];
  userId?: string;
  targetId?: string;
  targetType?: string;
  startDate?: number;
  endDate?: number;
  unreadOnly?: boolean;
}

export interface ActivityGroup {
  date: string;
  activities: Activity[];
}

// ==================== STORAGE ====================

const STORAGE_KEY = 'kksmartscan_activity_feed';
const MAX_ACTIVITIES = 1000; // Limit stored activities

function getStoredActivities(): Activity[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveActivities(activities: Activity[]): void {
  // Trim to max limit
  const trimmed = activities.slice(0, MAX_ACTIVITIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

// ==================== ACTIVITY CREATION ====================

/**
 * Create a new activity entry
 */
export function createActivity(
  type: ActivityType,
  user: AppUser,
  target: { id: string; type: Activity['targetType']; name: string },
  description: string,
  metadata: Record<string, any> = {}
): Activity {
  const activities = getStoredActivities();
  
  const activity: Activity = {
    id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    targetId: target.id,
    targetType: target.type,
    targetName: target.name,
    description,
    metadata,
    isRead: false,
    createdAt: Date.now()
  };
  
  // Add to beginning (most recent first)
  activities.unshift(activity);
  saveActivities(activities);
  
  return activity;
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Log contact creation activity
 */
export function logContactCreated(user: AppUser, contact: ContactInfo): Activity {
  return createActivity(
    'contact.created',
    user,
    { id: contact.id, type: 'contact', name: contact.name },
    `${user.name} added a new contact`,
    { industry: contact.industry, company: contact.firmName }
  );
}

/**
 * Log contact update activity
 */
export function logContactUpdated(
  user: AppUser, 
  contact: ContactInfo, 
  changedFields: string[]
): Activity {
  return createActivity(
    'contact.updated',
    user,
    { id: contact.id, type: 'contact', name: contact.name },
    `${user.name} updated ${changedFields.length} field${changedFields.length > 1 ? 's' : ''}`,
    { changedFields }
  );
}

/**
 * Log contact deletion activity
 */
export function logContactDeleted(user: AppUser, contactName: string, contactId: string): Activity {
  return createActivity(
    'contact.deleted',
    user,
    { id: contactId, type: 'contact', name: contactName },
    `${user.name} deleted a contact`,
    {}
  );
}

/**
 * Log comment activity
 */
export function logCommentAdded(
  user: AppUser, 
  contactId: string, 
  contactName: string,
  commentId: string
): Activity {
  return createActivity(
    'comment.added',
    user,
    { id: contactId, type: 'contact', name: contactName },
    `${user.name} commented on a contact`,
    { commentId }
  );
}

/**
 * Log comment reply activity
 */
export function logCommentReplied(
  user: AppUser,
  contactId: string,
  contactName: string,
  commentId: string,
  parentId: string
): Activity {
  return createActivity(
    'comment.replied',
    user,
    { id: contactId, type: 'contact', name: contactName },
    `${user.name} replied to a comment`,
    { commentId, parentId }
  );
}

/**
 * Log mention activity
 */
export function logMentionReceived(
  mentionedUser: AppUser,
  mentionerName: string,
  contactId: string,
  contactName: string,
  commentId: string
): Activity {
  return createActivity(
    'mention.received',
    mentionedUser,
    { id: contactId, type: 'contact', name: contactName },
    `${mentionerName} mentioned you in a comment`,
    { commentId, mentionerName }
  );
}

/**
 * Log note activity
 */
export function logNoteCreated(
  user: AppUser, 
  contactId: string, 
  contactName: string,
  noteId: string
): Activity {
  return createActivity(
    'note.created',
    user,
    { id: contactId, type: 'contact', name: contactName },
    `${user.name} added a note`,
    { noteId }
  );
}

/**
 * Log tag activity
 */
export function logTagAdded(
  user: AppUser,
  contactId: string,
  contactName: string,
  tagName: string
): Activity {
  return createActivity(
    'tag.added',
    user,
    { id: contactId, type: 'contact', name: contactName },
    `${user.name} added tag "${tagName}"`,
    { tagName }
  );
}

/**
 * Log reminder activity
 */
export function logReminderCreated(
  user: AppUser,
  contactId: string,
  contactName: string,
  reminderTitle: string
): Activity {
  return createActivity(
    'reminder.created',
    user,
    { id: contactId, type: 'contact', name: contactName },
    `${user.name} set a reminder: "${reminderTitle}"`,
    { reminderTitle }
  );
}

/**
 * Log export activity
 */
export function logExportCompleted(
  user: AppUser,
  format: string,
  count: number
): Activity {
  return createActivity(
    'export.completed',
    user,
    { id: 'export', type: 'system', name: 'Export' },
    `${user.name} exported ${count} contacts as ${format.toUpperCase()}`,
    { format, count }
  );
}

/**
 * Log import activity
 */
export function logImportCompleted(
  user: AppUser,
  count: number,
  source: string
): Activity {
  return createActivity(
    'import.completed',
    user,
    { id: 'import', type: 'system', name: 'Import' },
    `${user.name} imported ${count} contacts from ${source}`,
    { count, source }
  );
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get activity feed with optional filters
 */
export function getActivityFeed(filter?: ActivityFilter, limit: number = 50): Activity[] {
  let activities = getStoredActivities();
  
  if (filter) {
    if (filter.types && filter.types.length > 0) {
      activities = activities.filter(a => filter.types!.includes(a.type));
    }
    if (filter.userId) {
      activities = activities.filter(a => a.userId === filter.userId);
    }
    if (filter.targetId) {
      activities = activities.filter(a => a.targetId === filter.targetId);
    }
    if (filter.targetType) {
      activities = activities.filter(a => a.targetType === filter.targetType);
    }
    if (filter.startDate) {
      activities = activities.filter(a => a.createdAt >= filter.startDate!);
    }
    if (filter.endDate) {
      activities = activities.filter(a => a.createdAt <= filter.endDate!);
    }
    if (filter.unreadOnly) {
      activities = activities.filter(a => !a.isRead);
    }
  }
  
  return activities.slice(0, limit);
}

/**
 * Get activities for a specific contact
 */
export function getContactActivity(contactId: string, limit: number = 20): Activity[] {
  return getActivityFeed({ targetId: contactId }, limit);
}

/**
 * Get activities by a specific user
 */
export function getUserActivity(userId: string, limit: number = 20): Activity[] {
  return getActivityFeed({ userId }, limit);
}

/**
 * Get unread activities for a user (notifications)
 */
export function getUnreadActivities(userId: string): Activity[] {
  const activities = getStoredActivities();
  return activities.filter(a => 
    !a.isRead && 
    (a.type === 'mention.received' || a.metadata.mentionedUsers?.includes(userId))
  );
}

/**
 * Group activities by date
 */
export function getGroupedActivities(
  filter?: ActivityFilter, 
  limit: number = 50
): ActivityGroup[] {
  const activities = getActivityFeed(filter, limit);
  const groups = new Map<string, Activity[]>();
  
  for (const activity of activities) {
    const date = new Date(activity.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let dateKey: string;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
    
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(activity);
  }
  
  return Array.from(groups.entries()).map(([date, activities]) => ({
    date,
    activities
  }));
}

// ==================== ACTIVITY MANAGEMENT ====================

/**
 * Mark activity as read
 */
export function markAsRead(activityId: string): void {
  const activities = getStoredActivities();
  const index = activities.findIndex(a => a.id === activityId);
  
  if (index !== -1) {
    activities[index].isRead = true;
    saveActivities(activities);
  }
}

/**
 * Mark multiple activities as read
 */
export function markAllAsRead(activityIds?: string[]): void {
  const activities = getStoredActivities();
  
  for (const activity of activities) {
    if (!activityIds || activityIds.includes(activity.id)) {
      activity.isRead = true;
    }
  }
  
  saveActivities(activities);
}

/**
 * Delete old activities (cleanup)
 */
export function cleanupOldActivities(daysToKeep: number = 30): number {
  const activities = getStoredActivities();
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  
  const filtered = activities.filter(a => a.createdAt > cutoff);
  const removed = activities.length - filtered.length;
  
  saveActivities(filtered);
  return removed;
}

// ==================== STATS ====================

export interface ActivityStats {
  totalActivities: number;
  unreadCount: number;
  todayCount: number;
  weekCount: number;
  byType: Record<string, number>;
  mostActiveUser: { userId: string; userName: string; count: number } | null;
}

export function getActivityStats(): ActivityStats {
  const activities = getStoredActivities();
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  const byType: Record<string, number> = {};
  const userCounts = new Map<string, { userName: string; count: number }>();
  let unreadCount = 0;
  let todayCount = 0;
  let weekCount = 0;
  
  for (const activity of activities) {
    byType[activity.type] = (byType[activity.type] || 0) + 1;
    
    const userEntry = userCounts.get(activity.userId) || { userName: activity.userName, count: 0 };
    userEntry.count++;
    userCounts.set(activity.userId, userEntry);
    
    if (!activity.isRead) unreadCount++;
    if (activity.createdAt > dayAgo) todayCount++;
    if (activity.createdAt > weekAgo) weekCount++;
  }
  
  let mostActiveUser: { userId: string; userName: string; count: number } | null = null;
  let maxCount = 0;
  userCounts.forEach((entry, userId) => {
    if (entry.count > maxCount) {
      maxCount = entry.count;
      mostActiveUser = { userId, userName: entry.userName, count: entry.count };
    }
  });
  
  return {
    totalActivities: activities.length,
    unreadCount,
    todayCount,
    weekCount,
    byType,
    mostActiveUser
  };
}

/**
 * Get activity type icon/color mapping
 */
export function getActivityStyle(type: ActivityType): { icon: string; color: string } {
  const styles: Record<ActivityType, { icon: string; color: string }> = {
    'contact.created': { icon: 'plus', color: 'emerald' },
    'contact.updated': { icon: 'edit', color: 'blue' },
    'contact.deleted': { icon: 'trash', color: 'rose' },
    'contact.viewed': { icon: 'eye', color: 'slate' },
    'comment.added': { icon: 'message', color: 'indigo' },
    'comment.replied': { icon: 'reply', color: 'indigo' },
    'mention.received': { icon: 'at', color: 'amber' },
    'note.created': { icon: 'note', color: 'cyan' },
    'note.updated': { icon: 'note', color: 'cyan' },
    'tag.added': { icon: 'tag', color: 'fuchsia' },
    'tag.removed': { icon: 'tag', color: 'slate' },
    'reminder.created': { icon: 'bell', color: 'amber' },
    'reminder.completed': { icon: 'check', color: 'emerald' },
    'export.completed': { icon: 'download', color: 'blue' },
    'import.completed': { icon: 'upload', color: 'emerald' },
    'user.joined': { icon: 'user-plus', color: 'emerald' },
    'user.invited': { icon: 'mail', color: 'indigo' }
  };
  
  return styles[type] || { icon: 'activity', color: 'slate' };
}
