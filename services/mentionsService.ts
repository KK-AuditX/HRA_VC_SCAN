/**
 * Mentions Service
 * Handle @mentions, notifications, and user tagging
 */

import { AppUser } from '../types';

// ==================== TYPES ====================

export interface Mention {
  id: string;
  mentionedUserId: string;
  mentionedUserEmail: string;
  mentionerUserId: string;
  mentionerUserName: string;
  mentionerUserEmail: string;
  sourceType: 'comment' | 'note';
  sourceId: string;
  contactId: string;
  contactName: string;
  context: string; // Snippet of text around the mention
  isRead: boolean;
  createdAt: number;
}

export interface MentionNotification {
  mention: Mention;
  isNew: boolean;
  timeAgo: string;
}

// ==================== STORAGE ====================

const STORAGE_KEY = 'kksmartscan_mentions';

function getStoredMentions(): Mention[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveMentions(mentions: Mention[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mentions));
}

// ==================== MENTION PARSING ====================

/**
 * Extract mentions from text content
 * Supports @email format
 */
export function extractMentions(content: string): string[] {
  const mentionPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionPattern.exec(content)) !== null) {
    const email = match[1].toLowerCase();
    if (!mentions.includes(email)) {
      mentions.push(email);
    }
  }
  
  return mentions;
}

/**
 * Get context snippet around a mention
 */
export function getMentionContext(content: string, email: string, contextLength: number = 50): string {
  const mentionText = `@${email}`;
  const index = content.toLowerCase().indexOf(mentionText.toLowerCase());
  
  if (index === -1) return content.slice(0, contextLength * 2);
  
  const start = Math.max(0, index - contextLength);
  const end = Math.min(content.length, index + mentionText.length + contextLength);
  
  let snippet = content.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  
  return snippet;
}

/**
 * Highlight mentions in text for display
 */
export function highlightMentions(content: string): string {
  return content.replace(
    /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    '<span class="mention-highlight text-indigo-400 font-bold">@$1</span>'
  );
}

// ==================== MENTION OPERATIONS ====================

/**
 * Create mention notifications from content
 */
export function createMentions(
  content: string,
  mentioner: AppUser,
  sourceType: 'comment' | 'note',
  sourceId: string,
  contactId: string,
  contactName: string,
  teamMembers: AppUser[]
): Mention[] {
  const mentionedEmails = extractMentions(content);
  const mentions = getStoredMentions();
  const newMentions: Mention[] = [];
  
  for (const email of mentionedEmails) {
    // Find mentioned user in team
    const mentionedUser = teamMembers.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (mentionedUser && mentionedUser.id !== mentioner.id) {
      const mention: Mention = {
        id: `mention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        mentionedUserId: mentionedUser.id,
        mentionedUserEmail: mentionedUser.email,
        mentionerUserId: mentioner.id,
        mentionerUserName: mentioner.name,
        mentionerUserEmail: mentioner.email,
        sourceType,
        sourceId,
        contactId,
        contactName,
        context: getMentionContext(content, email),
        isRead: false,
        createdAt: Date.now()
      };
      
      mentions.push(mention);
      newMentions.push(mention);
    }
  }
  
  saveMentions(mentions);
  return newMentions;
}

/**
 * Mark mention as read
 */
export function markMentionAsRead(mentionId: string): void {
  const mentions = getStoredMentions();
  const index = mentions.findIndex(m => m.id === mentionId);
  
  if (index !== -1) {
    mentions[index].isRead = true;
    saveMentions(mentions);
  }
}

/**
 * Mark all mentions as read for a user
 */
export function markAllMentionsAsRead(userId: string): void {
  const mentions = getStoredMentions();
  
  for (const mention of mentions) {
    if (mention.mentionedUserId === userId) {
      mention.isRead = true;
    }
  }
  
  saveMentions(mentions);
}

/**
 * Delete mentions for a source (when comment/note is deleted)
 */
export function deleteMentionsForSource(sourceId: string): void {
  const mentions = getStoredMentions();
  const filtered = mentions.filter(m => m.sourceId !== sourceId);
  saveMentions(filtered);
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get all mentions for a user
 */
export function getUserMentions(userId: string): Mention[] {
  const mentions = getStoredMentions();
  return mentions
    .filter(m => m.mentionedUserId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get unread mentions for a user
 */
export function getUnreadMentions(userId: string): Mention[] {
  return getUserMentions(userId).filter(m => !m.isRead);
}

/**
 * Get mention count for a user
 */
export function getMentionCount(userId: string, unreadOnly: boolean = false): number {
  const mentions = getUserMentions(userId);
  return unreadOnly ? mentions.filter(m => !m.isRead).length : mentions.length;
}

/**
 * Get mentions for a specific contact
 */
export function getContactMentions(contactId: string): Mention[] {
  const mentions = getStoredMentions();
  return mentions
    .filter(m => m.contactId === contactId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get recent mentions across all users
 */
export function getRecentMentions(limit: number = 20): Mention[] {
  const mentions = getStoredMentions();
  return mentions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

// ==================== NOTIFICATION HELPERS ====================

/**
 * Format time ago string
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Get mentions formatted as notifications
 */
export function getMentionNotifications(userId: string): MentionNotification[] {
  const mentions = getUserMentions(userId);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  
  return mentions.map(mention => ({
    mention,
    isNew: mention.createdAt > hourAgo && !mention.isRead,
    timeAgo: formatTimeAgo(mention.createdAt)
  }));
}

// ==================== AUTOCOMPLETE ====================

/**
 * Get mention suggestions for autocomplete
 */
export function getMentionSuggestions(
  query: string,
  teamMembers: AppUser[],
  currentUserId: string
): AppUser[] {
  const lowerQuery = query.toLowerCase().replace('@', '');
  
  return teamMembers
    .filter(user => 
      user.id !== currentUserId &&
      (user.name.toLowerCase().includes(lowerQuery) ||
       user.email.toLowerCase().includes(lowerQuery))
    )
    .slice(0, 5);
}

/**
 * Insert mention into text at cursor position
 */
export function insertMention(
  text: string,
  cursorPosition: number,
  user: AppUser
): { newText: string; newCursorPosition: number } {
  // Find the @ symbol before cursor
  const beforeCursor = text.slice(0, cursorPosition);
  const atIndex = beforeCursor.lastIndexOf('@');
  
  if (atIndex === -1) {
    return { newText: text, newCursorPosition: cursorPosition };
  }
  
  const mentionText = `@${user.email} `;
  const afterCursor = text.slice(cursorPosition);
  const newText = text.slice(0, atIndex) + mentionText + afterCursor;
  const newCursorPosition = atIndex + mentionText.length;
  
  return { newText, newCursorPosition };
}

// ==================== STATS ====================

export interface MentionStats {
  totalMentions: number;
  unreadMentions: number;
  mentionsByUser: Record<string, number>;
  mostMentionedUser: { userId: string; email: string; count: number } | null;
  recentMentions: number; // Last 24 hours
}

export function getMentionStats(): MentionStats {
  const mentions = getStoredMentions();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  const mentionsByUser: Record<string, number> = {};
  let unreadMentions = 0;
  let recentMentions = 0;
  
  for (const mention of mentions) {
    mentionsByUser[mention.mentionedUserEmail] = 
      (mentionsByUser[mention.mentionedUserEmail] || 0) + 1;
    
    if (!mention.isRead) unreadMentions++;
    if (mention.createdAt > dayAgo) recentMentions++;
  }
  
  let mostMentionedUser: { userId: string; email: string; count: number } | null = null;
  let maxCount = 0;
  
  for (const mention of mentions) {
    const count = mentionsByUser[mention.mentionedUserEmail] || 0;
    if (count > maxCount) {
      maxCount = count;
      mostMentionedUser = {
        userId: mention.mentionedUserId,
        email: mention.mentionedUserEmail,
        count
      };
    }
  }
  
  return {
    totalMentions: mentions.length,
    unreadMentions,
    mentionsByUser,
    mostMentionedUser,
    recentMentions
  };
}
