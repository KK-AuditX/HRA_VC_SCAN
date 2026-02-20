/**
 * Shared Notes Service
 * Collaborative notes attached to contacts
 */

import { AppUser } from '../types';

// ==================== TYPES ====================

export interface Note {
  id: string;
  contactId: string;
  title: string;
  content: string;
  type: NoteType;
  createdBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  lastEditedBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  collaborators: string[]; // User IDs who have edited
  mentions: string[]; // User emails mentioned in content
  tags: string[];
  isPinned: boolean;
  isPrivate: boolean; // Only visible to creator
  color: NoteColor;
  version: number;
  editHistory: NoteEdit[];
  createdAt: number;
  updatedAt: number;
}

export type NoteType = 
  | 'general'
  | 'meeting'
  | 'call'
  | 'email'
  | 'task'
  | 'followup'
  | 'deal'
  | 'issue';

export type NoteColor = 
  | 'default'
  | 'blue'
  | 'green'
  | 'amber'
  | 'rose'
  | 'purple'
  | 'cyan';

export interface NoteEdit {
  userId: string;
  userName: string;
  action: 'created' | 'edited' | 'title_changed';
  timestamp: number;
}

export interface NoteTemplate {
  id: string;
  name: string;
  type: NoteType;
  content: string;
  tags: string[];
}

// ==================== STORAGE ====================

const STORAGE_KEY = 'kksmartscan_notes';
const TEMPLATES_KEY = 'kksmartscan_note_templates';

function getStoredNotes(): Note[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function getStoredTemplates(): NoteTemplate[] {
  try {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function saveTemplates(templates: NoteTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

// ==================== DEFAULT TEMPLATES ====================

const DEFAULT_TEMPLATES: NoteTemplate[] = [
  {
    id: 'template_meeting',
    name: 'Meeting Notes',
    type: 'meeting',
    content: `## Meeting Summary\n\n**Date:** [Date]\n**Attendees:** \n\n### Discussion Points\n- \n\n### Action Items\n- [ ] \n\n### Next Steps\n`,
    tags: ['meeting']
  },
  {
    id: 'template_call',
    name: 'Call Log',
    type: 'call',
    content: `## Call Notes\n\n**Date:** [Date]\n**Duration:** \n\n### Key Points\n- \n\n### Follow-up Required\n- [ ] \n`,
    tags: ['call']
  },
  {
    id: 'template_deal',
    name: 'Deal Notes',
    type: 'deal',
    content: `## Deal Overview\n\n**Stage:** \n**Value:** \n**Expected Close:** \n\n### Requirements\n- \n\n### Concerns/Objections\n- \n\n### Competition\n- \n`,
    tags: ['deal', 'sales']
  },
  {
    id: 'template_followup',
    name: 'Follow-up',
    type: 'followup',
    content: `## Follow-up Action\n\n**Priority:** \n**Due Date:** \n\n### Context\n\n### Actions Needed\n- [ ] \n`,
    tags: ['followup']
  }
];

// ==================== NOTE OPERATIONS ====================

/**
 * Create a new note
 */
export function createNote(
  contactId: string,
  user: AppUser,
  title: string,
  content: string,
  type: NoteType = 'general',
  options: {
    tags?: string[];
    color?: NoteColor;
    isPrivate?: boolean;
    isPinned?: boolean;
  } = {}
): Note {
  const notes = getStoredNotes();
  
  // Extract mentions from content
  const mentionPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  
  const note: Note = {
    id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    contactId,
    title,
    content,
    type,
    createdBy: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email
    },
    lastEditedBy: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email
    },
    collaborators: [user.id],
    mentions,
    tags: options.tags || [],
    isPinned: options.isPinned || false,
    isPrivate: options.isPrivate || false,
    color: options.color || 'default',
    version: 1,
    editHistory: [{
      userId: user.id,
      userName: user.name,
      action: 'created',
      timestamp: Date.now()
    }],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  notes.push(note);
  saveNotes(notes);
  
  return note;
}

/**
 * Update a note
 */
export function updateNote(
  noteId: string,
  user: AppUser,
  updates: {
    title?: string;
    content?: string;
    type?: NoteType;
    tags?: string[];
    color?: NoteColor;
    isPinned?: boolean;
    isPrivate?: boolean;
  }
): Note | null {
  const notes = getStoredNotes();
  const index = notes.findIndex(n => n.id === noteId);
  
  if (index === -1) return null;
  
  const note = notes[index];
  
  // Check if user can edit (creator or not private)
  if (note.isPrivate && note.createdBy.userId !== user.id) {
    return null;
  }
  
  // Re-extract mentions if content changed
  let mentions = note.mentions;
  if (updates.content) {
    const mentionPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    mentions = [];
    let match;
    while ((match = mentionPattern.exec(updates.content)) !== null) {
      mentions.push(match[1]);
    }
  }
  
  // Add edit history entry
  const action = updates.title && updates.title !== note.title ? 'title_changed' : 'edited';
  const editEntry: NoteEdit = {
    userId: user.id,
    userName: user.name,
    action,
    timestamp: Date.now()
  };
  
  // Add user to collaborators if not already
  const collaborators = note.collaborators.includes(user.id) 
    ? note.collaborators 
    : [...note.collaborators, user.id];
  
  notes[index] = {
    ...note,
    ...updates,
    mentions,
    lastEditedBy: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email
    },
    collaborators,
    version: note.version + 1,
    editHistory: [...note.editHistory, editEntry],
    updatedAt: Date.now()
  };
  
  saveNotes(notes);
  return notes[index];
}

/**
 * Delete a note
 */
export function deleteNote(noteId: string, userId: string): boolean {
  const notes = getStoredNotes();
  const note = notes.find(n => n.id === noteId);
  
  if (!note) return false;
  
  // Only creator can delete
  if (note.createdBy.userId !== userId) return false;
  
  const filtered = notes.filter(n => n.id !== noteId);
  saveNotes(filtered);
  
  return true;
}

/**
 * Toggle pin status
 */
export function toggleNotePin(noteId: string): Note | null {
  const notes = getStoredNotes();
  const index = notes.findIndex(n => n.id === noteId);
  
  if (index === -1) return null;
  
  notes[index].isPinned = !notes[index].isPinned;
  notes[index].updatedAt = Date.now();
  
  saveNotes(notes);
  return notes[index];
}

/**
 * Create note from template
 */
export function createNoteFromTemplate(
  contactId: string,
  user: AppUser,
  templateId: string,
  title?: string
): Note | null {
  const templates = getStoredTemplates();
  const template = templates.find(t => t.id === templateId);
  
  if (!template) return null;
  
  return createNote(
    contactId,
    user,
    title || template.name,
    template.content,
    template.type,
    { tags: template.tags }
  );
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get all notes for a contact
 */
export function getContactNotes(contactId: string, userId?: string): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => 
      n.contactId === contactId &&
      (!n.isPrivate || n.createdBy.userId === userId)
    )
    .sort((a, b) => {
      // Pinned first, then by date
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
}

/**
 * Get a single note by ID
 */
export function getNoteById(noteId: string): Note | null {
  const notes = getStoredNotes();
  return notes.find(n => n.id === noteId) || null;
}

/**
 * Get notes by type
 */
export function getNotesByType(type: NoteType): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => n.type === type && !n.isPrivate)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get notes mentioning a user
 */
export function getNotesWithMention(userEmail: string): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => n.mentions.includes(userEmail))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get notes by tag
 */
export function getNotesByTag(tag: string): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => n.tags.includes(tag) && !n.isPrivate)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Search notes
 */
export function searchNotes(query: string, userId?: string): Note[] {
  if (!query.trim()) return [];
  
  const notes = getStoredNotes();
  const lowerQuery = query.toLowerCase();
  
  return notes
    .filter(n => 
      (!n.isPrivate || n.createdBy.userId === userId) &&
      (n.title.toLowerCase().includes(lowerQuery) ||
       n.content.toLowerCase().includes(lowerQuery) ||
       n.tags.some(t => t.toLowerCase().includes(lowerQuery)))
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get recent notes across all contacts
 */
export function getRecentNotes(limit: number = 10, userId?: string): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => !n.isPrivate || n.createdBy.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/**
 * Get notes created by a user
 */
export function getUserNotes(userId: string): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => n.createdBy.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get pinned notes
 */
export function getPinnedNotes(userId?: string): Note[] {
  const notes = getStoredNotes();
  return notes
    .filter(n => 
      n.isPinned && 
      (!n.isPrivate || n.createdBy.userId === userId)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// ==================== TEMPLATE FUNCTIONS ====================

/**
 * Get all note templates
 */
export function getNoteTemplates(): NoteTemplate[] {
  return getStoredTemplates();
}

/**
 * Create custom template
 */
export function createTemplate(
  name: string,
  type: NoteType,
  content: string,
  tags: string[] = []
): NoteTemplate {
  const templates = getStoredTemplates();
  
  const template: NoteTemplate = {
    id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    type,
    content,
    tags
  };
  
  templates.push(template);
  saveTemplates(templates);
  
  return template;
}

/**
 * Delete custom template
 */
export function deleteTemplate(templateId: string): boolean {
  const templates = getStoredTemplates();
  
  // Don't delete default templates
  if (templateId.startsWith('template_') && !templateId.includes('_')) {
    return false;
  }
  
  const filtered = templates.filter(t => t.id !== templateId);
  saveTemplates(filtered);
  
  return templates.length !== filtered.length;
}

// ==================== STATS ====================

export interface NoteStats {
  totalNotes: number;
  notesByType: Record<string, number>;
  notesByContact: number;
  activeCollaborators: number;
  recentNotes: number; // Last 7 days
  pinnedNotes: number;
  privateNotes: number;
}

export function getNoteStats(): NoteStats {
  const notes = getStoredNotes();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  
  const notesByType: Record<string, number> = {};
  const contactIds = new Set<string>();
  const collaboratorIds = new Set<string>();
  let recentNotes = 0;
  let pinnedNotes = 0;
  let privateNotes = 0;
  
  for (const note of notes) {
    notesByType[note.type] = (notesByType[note.type] || 0) + 1;
    contactIds.add(note.contactId);
    note.collaborators.forEach(c => collaboratorIds.add(c));
    
    if (note.updatedAt > weekAgo) recentNotes++;
    if (note.isPinned) pinnedNotes++;
    if (note.isPrivate) privateNotes++;
  }
  
  return {
    totalNotes: notes.length,
    notesByType,
    notesByContact: contactIds.size,
    activeCollaborators: collaboratorIds.size,
    recentNotes,
    pinnedNotes,
    privateNotes
  };
}

/**
 * Get note count for a contact
 */
export function getNoteCount(contactId: string): number {
  const notes = getStoredNotes();
  return notes.filter(n => n.contactId === contactId).length;
}

// ==================== UTILITIES ====================

/**
 * Get color styles for a note
 */
export function getNoteColorStyles(color: NoteColor): { bg: string; border: string; text: string } {
  const styles: Record<NoteColor, { bg: string; border: string; text: string }> = {
    default: { bg: 'bg-slate-900/50', border: 'border-white/10', text: 'text-slate-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    green: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' }
  };
  
  return styles[color];
}

/**
 * Get note type icon name
 */
export function getNoteTypeIcon(type: NoteType): string {
  const icons: Record<NoteType, string> = {
    general: 'file-text',
    meeting: 'users',
    call: 'phone',
    email: 'mail',
    task: 'check-square',
    followup: 'clock',
    deal: 'briefcase',
    issue: 'alert-triangle'
  };
  
  return icons[type];
}
