/**
 * Comments Service
 * Team collaboration through contact-level discussions
 */

import { AppUser } from '../types';

// ==================== TYPES ====================

export interface Comment {
  id: string;
  contactId: string;
  userId: string;
  userName: string;
  userEmail: string;
  content: string;
  mentions: string[]; // User IDs mentioned
  attachments: Attachment[];
  reactions: Reaction[];
  parentId: string | null; // For threaded replies
  isEdited: boolean;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'link';
  url: string;
  size?: number;
}

export interface Reaction {
  userId: string;
  userName: string;
  emoji: string;
  createdAt: number;
}

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
  replyCount: number;
}

// ==================== STORAGE ====================

const STORAGE_KEY = 'kksmartscan_comments';

function getStoredComments(): Comment[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveComments(comments: Comment[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
}

// ==================== COMMENT OPERATIONS ====================

/**
 * Add a new comment to a contact
 */
export function addComment(
  contactId: string,
  user: AppUser,
  content: string,
  parentId: string | null = null,
  attachments: Attachment[] = []
): Comment {
  const comments = getStoredComments();
  
  // Extract mentions from content (e.g., @john.doe@email.com)
  const mentionPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  
  const comment: Comment = {
    id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    contactId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    content,
    mentions,
    attachments,
    reactions: [],
    parentId,
    isEdited: false,
    isPinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  comments.push(comment);
  saveComments(comments);
  
  return comment;
}

/**
 * Edit an existing comment
 */
export function editComment(
  commentId: string,
  userId: string,
  newContent: string
): Comment | null {
  const comments = getStoredComments();
  const index = comments.findIndex(c => c.id === commentId);
  
  if (index === -1) return null;
  
  // Only author can edit
  if (comments[index].userId !== userId) return null;
  
  // Re-extract mentions
  const mentionPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionPattern.exec(newContent)) !== null) {
    mentions.push(match[1]);
  }
  
  comments[index] = {
    ...comments[index],
    content: newContent,
    mentions,
    isEdited: true,
    updatedAt: Date.now()
  };
  
  saveComments(comments);
  return comments[index];
}

/**
 * Delete a comment
 */
export function deleteComment(commentId: string, userId: string): boolean {
  const comments = getStoredComments();
  const comment = comments.find(c => c.id === commentId);
  
  if (!comment) return false;
  
  // Only author can delete
  if (comment.userId !== userId) return false;
  
  // Delete comment and its replies
  const filtered = comments.filter(c => c.id !== commentId && c.parentId !== commentId);
  saveComments(filtered);
  
  return true;
}

/**
 * Add a reaction to a comment
 */
export function addReaction(
  commentId: string,
  user: AppUser,
  emoji: string
): Comment | null {
  const comments = getStoredComments();
  const index = comments.findIndex(c => c.id === commentId);
  
  if (index === -1) return null;
  
  // Remove existing reaction from same user
  comments[index].reactions = comments[index].reactions.filter(r => r.userId !== user.id);
  
  // Add new reaction
  comments[index].reactions.push({
    userId: user.id,
    userName: user.name,
    emoji,
    createdAt: Date.now()
  });
  
  saveComments(comments);
  return comments[index];
}

/**
 * Remove a reaction from a comment
 */
export function removeReaction(commentId: string, userId: string): Comment | null {
  const comments = getStoredComments();
  const index = comments.findIndex(c => c.id === commentId);
  
  if (index === -1) return null;
  
  comments[index].reactions = comments[index].reactions.filter(r => r.userId !== userId);
  
  saveComments(comments);
  return comments[index];
}

/**
 * Pin/unpin a comment
 */
export function togglePinComment(commentId: string): Comment | null {
  const comments = getStoredComments();
  const index = comments.findIndex(c => c.id === commentId);
  
  if (index === -1) return null;
  
  comments[index].isPinned = !comments[index].isPinned;
  comments[index].updatedAt = Date.now();
  
  saveComments(comments);
  return comments[index];
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get all comments for a contact
 */
export function getContactComments(contactId: string): Comment[] {
  const comments = getStoredComments();
  return comments
    .filter(c => c.contactId === contactId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get comments as threads (top-level + replies)
 */
export function getContactThreads(contactId: string): CommentThread[] {
  const comments = getContactComments(contactId);
  
  const topLevel = comments.filter(c => !c.parentId);
  const threads: CommentThread[] = [];
  
  for (const comment of topLevel) {
    const replies = comments.filter(c => c.parentId === comment.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    
    threads.push({
      comment,
      replies,
      replyCount: replies.length
    });
  }
  
  // Sort: pinned first, then by date
  threads.sort((a, b) => {
    if (a.comment.isPinned && !b.comment.isPinned) return -1;
    if (!a.comment.isPinned && b.comment.isPinned) return 1;
    return b.comment.createdAt - a.comment.createdAt;
  });
  
  return threads;
}

/**
 * Get pinned comments for a contact
 */
export function getPinnedComments(contactId: string): Comment[] {
  const comments = getContactComments(contactId);
  return comments.filter(c => c.isPinned && !c.parentId);
}

/**
 * Get recent comments across all contacts
 */
export function getRecentComments(limit: number = 20): Comment[] {
  const comments = getStoredComments();
  return comments
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Get comments by user
 */
export function getUserComments(userId: string): Comment[] {
  const comments = getStoredComments();
  return comments
    .filter(c => c.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get comments mentioning a user
 */
export function getMentionsForUser(userEmail: string): Comment[] {
  const comments = getStoredComments();
  return comments
    .filter(c => c.mentions.includes(userEmail))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Search comments
 */
export function searchComments(query: string): Comment[] {
  if (!query.trim()) return [];
  
  const comments = getStoredComments();
  const lowerQuery = query.toLowerCase();
  
  return comments.filter(c => 
    c.content.toLowerCase().includes(lowerQuery) ||
    c.userName.toLowerCase().includes(lowerQuery)
  ).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get comment count for a contact
 */
export function getCommentCount(contactId: string): number {
  const comments = getStoredComments();
  return comments.filter(c => c.contactId === contactId).length;
}

/**
 * Get total comment count
 */
export function getTotalCommentCount(): number {
  return getStoredComments().length;
}

// ==================== STATS ====================

export interface CommentStats {
  totalComments: number;
  totalThreads: number;
  totalReactions: number;
  activeCommenters: number;
  mostActiveContact: { contactId: string; count: number } | null;
  recentActivity: number; // Comments in last 24h
}

export function getCommentStats(): CommentStats {
  const comments = getStoredComments();
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  
  const contactCounts = new Map<string, number>();
  const userIds = new Set<string>();
  let totalReactions = 0;
  let recentActivity = 0;
  
  for (const comment of comments) {
    contactCounts.set(
      comment.contactId, 
      (contactCounts.get(comment.contactId) || 0) + 1
    );
    userIds.add(comment.userId);
    totalReactions += comment.reactions.length;
    if (comment.createdAt > dayAgo) recentActivity++;
  }
  
  let mostActiveContact: { contactId: string; count: number } | null = null;
  let maxCount = 0;
  contactCounts.forEach((count, contactId) => {
    if (count > maxCount) {
      maxCount = count;
      mostActiveContact = { contactId, count };
    }
  });
  
  const topLevelComments = comments.filter(c => !c.parentId);
  
  return {
    totalComments: comments.length,
    totalThreads: topLevelComments.length,
    totalReactions,
    activeCommenters: userIds.size,
    mostActiveContact,
    recentActivity
  };
}
