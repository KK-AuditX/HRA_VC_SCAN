
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Plus, Trash2, Zap, Search, Database, 
  ShieldCheck, BarChart3,
  Activity, Box, Undo2, AlertTriangle, Copy,
  LayoutGrid, List, PieChart, TrendingUp,
  Shield, Globe, Filter, HardDrive, Cpu,
  LogIn, LogOut, UserPlus, Clock, Mail, Check, X, Users,
  Download, Upload, FileText, Archive, RefreshCw, Settings,
  Tag, Network, Brain, Bell, Star, Target, Lightbulb,
  MessageSquare, AtSign, StickyNote, Send
} from 'lucide-react';
import { ContactInfo, AppUser, ExtractionResult, Session, AuditLogEntry, UserRole, Invite, AccessStatus } from './types';
import { extractContactFromDocument, isGeminiConfigured } from './services/gemini';
import { getAllUsers } from './services/auth';
import { 
  initGoogleAuth, signIn, signOut, subscribeToAuthState,
  AuthState as GoogleAuthState
} from './services/googleAuth';
import { 
  hasPermission, validateSession, revokeSession,
  getAllUsersDb, updateUserRole, updateUserStatus,
  createOrganization, createInvite, acceptInvite, getInvites
} from './services/sessionManager';
import { 
  logLogin, logLogout, logContactCreate, logContactUpdate, logContactDelete,
  getRecentAuditLog, getAuditStats
} from './services/auditLog';
import { recordAction, checkRateLimit, RateLimitError } from './services/rateLimit';
import { 
  getAllContacts, saveContact, deleteContact, deleteContacts,
  undoLastAction, migrateFromLocalStorage, getDbStats,
  clearExpiredCache
} from './services/database';
import { findDuplicates, DuplicateMatch } from './utils/duplicateDetection';
import { normalizeContactFields, calculateDataQuality } from './utils/validators';
import { exportContacts, ExportOptions, COLUMN_PRESETS } from './services/exportService';
import { importContacts, readFileAsText, detectFormat, previewImport, ImportResult } from './services/importService';
import { downloadBackup, restoreFromFile, getLocalBackups, runScheduledBackup } from './services/backupService';
import { batchUpdate, batchDelete, batchMergeDuplicates } from './services/batchOperations';
import { searchContacts, SearchQuery, buildSearchQuery, getSearchSuggestions, QUICK_FILTERS } from './services/searchService';
import { setupSyncListeners, getSyncStatus, processSyncQueue } from './services/syncService';
// Phase 4: Customer Intelligence
import { autoTagContact, autoTagContacts, getContactTags, getAllTags, getPopularTags, Tag as ContactTag } from './services/smartTagging';
import { discoverRelationships, analyzeNetwork, getRelationshipSuggestions, NetworkAnalysis } from './services/relationshipMapping';
import { generateInsights, getAllInsights, dismissInsight, getContactTrends, Insight } from './services/insightsService';
import { getPendingReminders, getOverdueReminders, getReminderStats, QuickReminders, Reminder } from './services/reminderService';
import { getLeadScore, getTopLeads, getGradeDistribution, LeadScore } from './services/leadScoring';
// Phase 5: Team Collaboration
import { addComment, getContactComments, getCommentStats, Comment, CommentThread, getContactThreads } from './services/commentsService';
import { getActivityFeed, getGroupedActivities, Activity as FeedActivity, ActivityGroup, getActivityStats, logContactCreated, logContactUpdated } from './services/activityFeedService';
import { getUnreadMentions, getMentionCount, Mention } from './services/mentionsService';
import { getContactNotes, createNote, Note, getNoteStats, getRecentNotes } from './services/sharedNotesService';
import ContactCard from './components/ContactCard';
import ContactTable from './components/ContactTable';

const DEFAULT_USER: AppUser = {
  id: 'master-node',
  name: 'Titan Operator',
  email: 'operator@titan-vault.ai',
  picture: '',
  role: 'owner',
  status: 'approved',
  createdAt: Date.now()
};

interface ProcessingStats {
  cached: number;
  processed: number;
  tokensSaved: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AppUser | null;
  session: Session | null;
  isAuthLoading: boolean;
}

const App: React.FC = () => {
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'vault' | 'insights' | 'admin'>('vault');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table'); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('All');
  const [duplicateWarning, setDuplicateWarning] = useState<{contact: ContactInfo, matches: DuplicateMatch[]} | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [stats, setStats] = useState<ProcessingStats>({ cached: 0, processed: 0, tokensSaved: 0 });
  const [dbStats, setDbStats] = useState({ contactCount: 0, cacheEntries: 0, historyActions: 0 });
  
  // Auth state
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    session: null,
    isAuthLoading: true
  });
  const [adminTab, setAdminTab] = useState<'users' | 'invites' | 'audit'>('users');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  
  // Data management state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'vcf' | 'json' | 'xml'>('csv');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [syncStatus, setSyncStatus] = useState({ isOnline: true, pendingOperations: 0 });
  const [sortBy, setSortBy] = useState<keyof ContactInfo | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  
  // Phase 4: Intelligence state
  const [insights, setInsights] = useState<Insight[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showInsightsPanel, setShowInsightsPanel] = useState(false);
  const [showRemindersPanel, setShowRemindersPanel] = useState(false);
  const [networkAnalysis, setNetworkAnalysis] = useState<NetworkAnalysis | null>(null);
  const [gradeDistribution, setGradeDistribution] = useState<Record<string, number>>({ A: 0, B: 0, C: 0, D: 0, F: 0 });
  const [contactLeadScores, setContactLeadScores] = useState<Record<string, LeadScore>>({});
  
  // Phase 5: Team Collaboration state
  const [activityFeed, setActivityFeed] = useState<ActivityGroup[]>([]);
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [unreadMentions, setUnreadMentions] = useState<Mention[]>([]);
  const [commentStats, setCommentStats] = useState({ totalComments: 0, totalThreads: 0, recentActivity: 0 });
  const [noteStats, setNoteStats] = useState({ totalNotes: 0, recentNotes: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  // Current user from session
  const currentUser = useMemo(() => {
    if (authState.user) {
      return authState.user;
    }
    return DEFAULT_USER;
  }, [authState.user]);

  // Permission checks
  const canScan = useMemo(() => hasPermission(currentUser, 'contacts:write'), [currentUser]);
  const canEdit = useMemo(() => hasPermission(currentUser, 'contacts:write'), [currentUser]);
  const canDelete = useMemo(() => hasPermission(currentUser, 'contacts:delete'), [currentUser]);
  const canExport = useMemo(() => hasPermission(currentUser, 'contacts:export'), [currentUser]);
  const canManageUsers = useMemo(() => hasPermission(currentUser, 'users:manage'), [currentUser]);
  const canViewAudit = useMemo(() => hasPermission(currentUser, 'audit:read'), [currentUser]);

  // Initialize database and load contacts
  useEffect(() => {
    async function init() {
      try {
        // Initialize Google Auth and subscribe to state changes
        await initGoogleAuth();
        
        // Subscribe to auth state changes
        const unsubscribe = subscribeToAuthState((googleState: GoogleAuthState) => {
          setAuthState({
            isAuthenticated: googleState.isAuthenticated,
            user: googleState.user,
            session: googleState.session,
            isAuthLoading: googleState.isLoading
          });
        });
        
        // Migrate from localStorage if needed
        await migrateFromLocalStorage();
        
        // Clear expired cache entries
        await clearExpiredCache();
        
        // Load contacts from IndexedDB
        const loadedContacts = await getAllContacts();
        setContacts(loadedContacts);
        
        // Update DB stats
        const currentStats = await getDbStats();
        setDbStats(currentStats);
        setUndoAvailable(currentStats.historyActions > 0);
      } catch (e) {
        console.error('Failed to initialize database:', e);
        // Fallback to localStorage
        const saved = localStorage.getItem('kksmartscan_db');
        if (saved) {
          try { setContacts(JSON.parse(saved)); } catch (e) { /* ignore */ }
        }
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // Load admin data when admin tab is active
  useEffect(() => {
    if (activeTab === 'admin' && authState.isAuthenticated) {
      // Load users
      setAllUsers(getAllUsersDb());
      
      // Load invites
      setInvites(getInvites());
      
      // Load audit log
      if (canViewAudit) {
        setAuditLog(getRecentAuditLog(50));
      }
    }
  }, [activeTab, authState.isAuthenticated, canViewAudit]);

  // Setup sync listeners
  useEffect(() => {
    setupSyncListeners();
    
    // Update sync status periodically
    const interval = setInterval(() => {
      const status = getSyncStatus();
      setSyncStatus({ isOnline: status.isOnline, pendingOperations: status.pendingOperations });
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Phase 4: Generate insights and analyze network when contacts change
  useEffect(() => {
    if (contacts.length === 0) return;
    
    // Generate insights
    const newInsights = generateInsights(contacts);
    setInsights(newInsights.filter(i => !i.dismissed));
    
    // Analyze network
    discoverRelationships(contacts);
    const analysis = analyzeNetwork(contacts);
    setNetworkAnalysis(analysis);
    
    // Get lead score distribution
    const distribution = getGradeDistribution(contacts);
    setGradeDistribution(distribution);
    
    // Calculate individual lead scores
    const scores: Record<string, LeadScore> = {};
    contacts.forEach(contact => {
      scores[contact.id] = getLeadScore(contact);
    });
    setContactLeadScores(scores);
    
    // Load reminders
    const pendingReminders = getPendingReminders();
    const overdueReminders = getOverdueReminders();
    setReminders([...overdueReminders, ...pendingReminders]);
  }, [contacts]);

  // Phase 5: Load collaboration data
  useEffect(() => {
    // Load activity feed
    const grouped = getGroupedActivities(undefined, 30);
    setActivityFeed(grouped);
    
    // Load comment stats
    const cStats = getCommentStats();
    setCommentStats({ 
      totalComments: cStats.totalComments, 
      totalThreads: cStats.totalThreads,
      recentActivity: cStats.recentActivity 
    });
    
    // Load note stats
    const nStats = getNoteStats();
    setNoteStats({ totalNotes: nStats.totalNotes, recentNotes: nStats.recentNotes });
    
    // Load unread mentions for current user
    if (currentUser) {
      const mentions = getUnreadMentions(currentUser.id);
      setUnreadMentions(mentions);
    }
  }, [contacts, currentUser]);

  // Sync to IndexedDB when contacts change
  useEffect(() => {
    if (isLoading) return;
    
    const syncToDb = async () => {
      try {
        // Also keep localStorage as backup
        localStorage.setItem('kksmartscan_db', JSON.stringify(contacts));
      } catch (e) {
        console.warn("localStorage backup failed:", e);
      }
    };
    syncToDb();
  }, [contacts, isLoading]);

  /**
   * Handle Google Sign In
   */
  const handleSignIn = () => {
    setAuthState(prev => ({ ...prev, isAuthLoading: true }));
    signIn(); // State updates handled by subscription
  };

  /**
   * Handle Sign Out
   */
  const handleSignOut = () => {
    if (authState.user) {
      logLogout(authState.user);
    }
    signOut(); // State updates handled by subscription
  };

  /**
   * Handle sending invite
   */
  const handleSendInvite = async () => {
    if (!inviteEmail || !authState.session) return;
    
    try {
      const invite = await createInvite(
        currentUser.organizationId || 'default',
        inviteEmail,
        inviteRole,
        currentUser.id
      );
      setInvites(prev => [...prev, invite]);
      setInviteEmail('');
      alert(`Invite sent to ${inviteEmail}`);
    } catch (err) {
      console.error('Failed to send invite:', err);
      alert('Failed to send invite');
    }
  };

  /**
   * Handle user role change
   */
  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      const updated = await updateUserRole(userId, newRole);
      setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  /**
   * Handle user status change
   */
  const handleStatusChange = async (userId: string, newStatus: AccessStatus) => {
    try {
      const updated = await updateUserStatus(userId, newStatus);
      if (updated) {
        setAllUsers(prev => prev.map(u => u.id === userId ? updated : u));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  /**
   * Handle export contacts
   */
  const handleExport = async (format: 'csv' | 'vcf' | 'json' | 'xml') => {
    if (!canExport) {
      alert('You do not have permission to export contacts.');
      return;
    }
    
    const selectedContacts = contacts.filter(c => c.selected);
    const toExport = selectedContacts.length > 0 ? selectedContacts : filteredContacts;
    
    try {
      const result = await exportContacts(toExport, { 
        format,
        includeMetadata: true,
        columns: COLUMN_PRESETS.full
      }, currentUser.id);
      
      if (result.success) {
        setShowExportModal(false);
      } else {
        alert(result.error || 'Export failed');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed');
    }
  };

  /**
   * Handle import file selection
   */
  const handleImportFile = async (file: File) => {
    try {
      const content = await readFileAsText(file);
      const format = detectFormat(content);
      
      if (!format) {
        alert('Could not detect file format. Please use CSV, vCard, or JSON files.');
        return;
      }
      
      const result = await importContacts(content, {
        format,
        skipDuplicates: false,
        mergeStrategy: 'skip',
        validateData: true
      }, contacts, currentUser.id);
      
      setImportResult(result);
      
      if (result.success && result.contacts.length > 0) {
        // Save imported contacts to database
        for (const contact of result.contacts) {
          await saveContact(contact);
        }
        
        // Refresh contacts list
        const loadedContacts = await getAllContacts();
        setContacts(loadedContacts);
        
        // Refresh DB stats
        const currentStats = await getDbStats();
        setDbStats(currentStats);
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed');
    }
  };

  /**
   * Handle backup download
   */
  const handleBackupDownload = async () => {
    try {
      await downloadBackup({ description: 'Manual backup' }, currentUser.id);
      setShowBackupModal(false);
    } catch (err) {
      console.error('Backup failed:', err);
      alert('Backup failed');
    }
  };

  /**
   * Handle restore from backup file
   */
  const handleRestoreBackup = async (file: File) => {
    if (!window.confirm('This will restore your contacts from the backup. Continue?')) return;
    
    try {
      const result = await restoreFromFile(file, { mergeMode: 'merge' }, currentUser.id);
      
      if (result.success) {
        // Refresh contacts
        const loadedContacts = await getAllContacts();
        setContacts(loadedContacts);
        
        alert(`Restored ${result.contactsRestored} contacts successfully.`);
        setShowBackupModal(false);
      } else {
        alert(`Restore failed: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      console.error('Restore failed:', err);
      alert('Restore failed');
    }
  };

  /**
   * Handle batch merge duplicates
   */
  const handleMergeDuplicates = async () => {
    const selectedContacts = contacts.filter(c => c.selected);
    const toMerge = selectedContacts.length > 1 ? selectedContacts : contacts;
    
    if (toMerge.length < 2) {
      alert('At least 2 contacts are required to find duplicates.');
      return;
    }
    
    setIsProcessing(true);
    setProcessingMessage('Finding and merging duplicates...');
    
    try {
      const result = await batchMergeDuplicates(toMerge, currentUser.id);
      
      // Refresh contacts
      const loadedContacts = await getAllContacts();
      setContacts(loadedContacts);
      
      alert(`Merged ${result.deletedIds.length} duplicate contacts.`);
    } catch (err) {
      console.error('Merge failed:', err);
      alert('Merge duplicates failed');
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  /**
   * Process uploaded file with optimized AI pipeline
   */
  const processFile = async (file: File) => {
    // Check if Gemini is configured
    const geminiStatus = isGeminiConfigured();
    if (!geminiStatus.configured) {
      alert(geminiStatus.message);
      return;
    }
    
    // Check rate limit
    const rateCheck = recordAction(currentUser.id, 'scan');
    if (!rateCheck.allowed) {
      alert(`Rate limit exceeded. Try again in ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} seconds.`);
      return;
    }
    
    // Check permission
    if (!canScan) {
      alert('You do not have permission to scan contacts.');
      return;
    }
    
    setIsProcessing(true);
    setProcessingMessage('Analyzing document...');
    const placeholderId = crypto.randomUUID();
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      const tempEntry: ContactInfo = {
        id: placeholderId, name: 'Neural Analysis...', firmName: '', jobTitle: '', phone: '', phone2: '', 
        email: '', email2: '', website: '', address: '', pincode: '', notes: '', industry: 'Processing', 
        createdAt: Date.now(), imageSource: file.type.includes('pdf') ? 'https://cdn-icons-png.flaticon.com/512/337/337946.png' : base64Data,
        status: 'processing'
      };
      setContacts(prev => [tempEntry, ...prev]);
      
      try {
        setProcessingMessage('Extracting contacts...');
        const results = await extractContactFromDocument(base64Data, file.type);
        
        // Process each result
        const newEntries: ContactInfo[] = [];
        for (const res of results) {
          const normalized = normalizeContactFields(res);
          const newContact: ContactInfo = {
            id: crypto.randomUUID(),
            ...res,
            ...normalized,
            createdAt: Date.now(),
            imageSource: file.type.includes('pdf') ? 'https://cdn-icons-png.flaticon.com/512/337/337946.png' : base64Data,
            status: 'completed'
          };
          
          // Check for duplicates BEFORE adding
          const existingContacts = contacts.filter(c => c.id !== placeholderId);
          const duplicates = findDuplicates(newContact, existingContacts);
          
          if (duplicates.length > 0 && duplicates[0].confidence !== 'possible') {
            // Show duplicate warning but still add (user can merge later)
            setDuplicateWarning({ contact: newContact, matches: duplicates });
          }
          
          newEntries.push(newContact);
          
          // Save to IndexedDB
          await saveContact(newContact);
          
          // Log audit
          logContactCreate(currentUser, newContact.id, newContact.name);
        }
        
        setContacts(prev => {
          const vault = prev.filter(c => c.id !== placeholderId);
          return [...newEntries, ...vault];
        });
        
        // Update stats
        setStats(prev => ({ ...prev, processed: prev.processed + 1 }));
        
        // Refresh DB stats
        const currentStats = await getDbStats();
        setDbStats(currentStats);
        setUndoAvailable(currentStats.historyActions > 0);
        
      } catch (err) {
        console.error('Processing failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        // Show error to user
        if (errorMessage.includes('API key')) {
          alert('Gemini API key not configured. Please add GEMINI_API_KEY to your .env file.');
        } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
          alert('API rate limit reached. Please try again in a few minutes.');
        } else {
          alert(`Extraction failed: ${errorMessage}`);
        }
        setContacts(prev => prev.map(c => c.id === placeholderId ? { ...c, status: 'error', name: 'Extraction Failed', notes: errorMessage } : c));
      } finally { 
        setIsProcessing(false);
        setProcessingMessage('');
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * Undo last action
   */
  const handleUndo = async () => {
    try {
      const action = await undoLastAction();
      if (action) {
        // Reload contacts from DB
        const loadedContacts = await getAllContacts();
        setContacts(loadedContacts);
        
        // Update stats
        const currentStats = await getDbStats();
        setDbStats(currentStats);
        setUndoAvailable(currentStats.historyActions > 0);
      }
    } catch (e) {
      console.error('Undo failed:', e);
    }
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.firmName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesIndustry = selectedIndustry === 'All' || c.industry === selectedIndustry;
      return matchesSearch && matchesIndustry;
    });
  }, [contacts, searchTerm, selectedIndustry]);

  const industries = useMemo(() => {
    const set = new Set(contacts.map(c => c.industry).filter(i => i && i !== 'Processing'));
    return ['All', ...Array.from(set)];
  }, [contacts]);

  const vaultStats = useMemo(() => {
    const total = contacts.length;
    const complete = contacts.filter(c => c.email && c.phone && c.firmName).length;
    const fidelity = total > 0 ? Math.round((complete / total) * 100) : 100;
    return { total, fidelity };
  }, [contacts]);

  const handleDeleteContact = useCallback(async (id: string) => {
    if (!canDelete) {
      alert('You do not have permission to delete contacts.');
      return;
    }
    
    if (window.confirm("Permanently purge this node from neural vault?")) {
      const contact = contacts.find(c => c.id === id);
      await deleteContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
      
      // Update undo availability
      const currentStats = await getDbStats();
      setUndoAvailable(currentStats.historyActions > 0);
      
      // Audit log
      if (contact) {
        logContactDelete(currentUser, id, contact.name);
      }
    }
  }, [canDelete, contacts, currentUser]);

  const handleBulkDelete = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!canDelete) {
      alert('You do not have permission to delete contacts.');
      return;
    }
    if (window.confirm(`Permanently purge ${ids.length} selected records?`)) {
      await deleteContacts(ids);
      setContacts(prev => prev.filter(c => !ids.includes(c.id)));
      
      // Update undo availability
      const currentStats = await getDbStats();
      setUndoAvailable(currentStats.historyActions > 0);
    }
  }, [canDelete]);

  const handleUpdateContact = useCallback(async (id: string, updated: Partial<ContactInfo>) => {
    if (!canEdit) {
      alert('You do not have permission to edit contacts.');
      return;
    }
    
    setContacts(prev => prev.map(c => {
      if (c.id === id) {
        const normalized = normalizeContactFields({
          name: updated.name || c.name,
          phone: updated.phone || c.phone,
          phone2: updated.phone2 || c.phone2,
          email: updated.email || c.email,
          email2: updated.email2 || c.email2,
          pincode: updated.pincode || c.pincode,
          website: updated.website || c.website
        });
        
        const updatedContact = { 
          ...c, 
          ...updated,
          ...normalized,
          updatedAt: Date.now(),
          updatedBy: currentUser.id
        };
        
        // Save to IndexedDB (async, don't await to keep UI responsive)
        saveContact(updatedContact, true).then(() => {
          logContactUpdate(currentUser, id, updatedContact.name, Object.keys(updated));
        }).catch(console.error);
        
        return updatedContact;
      }
      return c;
    }));
  }, [canEdit, currentUser]);

  const handleToggleSelect = useCallback((id: string) => {
    setContacts(prev => prev.map(c => c.id === id ? {...c, selected: !c.selected} : c));
  }, []);

  const handleSelectAll = useCallback(() => {
    const allSel = filteredContacts.length > 0 && filteredContacts.every(c => c.selected);
    setContacts(prev => prev.map(c => {
      const isVisible = filteredContacts.some(fc => fc.id === c.id);
      return isVisible ? { ...c, selected: !allSel } : c;
    }));
  }, [filteredContacts]);

  return (
    <div className="min-h-screen flex bg-[#020617] selection:bg-indigo-500/30">
      {/* SIDEBAR */}
      <nav className="w-28 flex-none border-r border-white/5 flex flex-col items-center py-12 gap-12 bg-slate-950/50 backdrop-blur-xl z-50">
        <div className="p-4 bg-indigo-600 rounded-2xl shadow-glow cursor-pointer" onClick={() => setActiveTab('vault')}>
          <Zap className="text-white w-6 h-6 fill-white" />
        </div>
        <div className="flex-1 flex flex-col gap-8">
          <button onClick={() => setActiveTab('vault')} className={`p-5 rounded-2xl transition-all ${activeTab === 'vault' ? 'bg-indigo-600/10 text-indigo-400 shadow-inner' : 'text-slate-600 hover:text-slate-400'}`}>
            <Box size={24} />
          </button>
          <button onClick={() => setActiveTab('insights')} className={`p-5 rounded-2xl transition-all ${activeTab === 'insights' ? 'bg-indigo-600/10 text-indigo-400 shadow-inner' : 'text-slate-600 hover:text-slate-400'}`}>
            <BarChart3 size={24} />
          </button>
          <button onClick={() => setActiveTab('admin')} className={`p-5 rounded-2xl transition-all ${activeTab === 'admin' ? 'bg-indigo-600/10 text-indigo-400 shadow-inner' : 'text-slate-600 hover:text-slate-400'}`}>
            <ShieldCheck size={24} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-8">
          {authState.isAuthenticated ? (
            <div className="flex flex-col gap-3 items-center">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center overflow-hidden">
                {currentUser.picture ? (
                  <img src={currentUser.picture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-slate-500" />
                )}
              </div>
              <button 
                onClick={handleSignOut}
                className="p-2 rounded-lg bg-slate-800/50 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleSignIn}
              className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 hover:bg-indigo-600/40 transition-all"
              title="Sign in with Google"
            >
              <LogIn size={20} />
            </button>
          )}
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-28 border-b border-white/5 px-12 flex items-center justify-between bg-slate-950/20 backdrop-blur-3xl z-40">
          <div className="flex flex-col">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-glow">
              {activeTab === 'vault' ? 'Neural Vault' : activeTab === 'insights' ? 'Intelligence' : 'Security HQ'}
            </h2>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${authState.isAuthenticated ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                {authState.isAuthenticated ? currentUser.email : 'Not signed in'}
              </span>
              {authState.isAuthenticated && (
                <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest px-2 py-0.5 bg-indigo-500/10 rounded">
                  {currentUser.role}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Undo Button */}
            {undoAvailable && (
              <button 
                onClick={handleUndo} 
                className="p-3 rounded-xl bg-slate-900/50 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                title="Undo last action"
              >
                <Undo2 size={18} />
              </button>
            )}
            
            <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/5">
              <button onClick={() => setViewMode('table')} className={`p-2.5 rounded-xl ${viewMode === 'table' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}><List size={18} /></button>
              <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600'}`}><LayoutGrid size={18} /></button>
            </div>
            
            {/* Data Management Buttons */}
            <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/5">
              <button 
                onClick={() => setShowExportModal(true)} 
                className="p-2.5 rounded-xl text-slate-600 hover:text-emerald-400 transition-colors"
                title="Export contacts"
              >
                <Download size={18} />
              </button>
              <button 
                onClick={() => setShowImportModal(true)} 
                className="p-2.5 rounded-xl text-slate-600 hover:text-indigo-400 transition-colors"
                title="Import contacts"
              >
                <Upload size={18} />
              </button>
              <button 
                onClick={() => setShowBackupModal(true)} 
                className="p-2.5 rounded-xl text-slate-600 hover:text-amber-400 transition-colors"
                title="Backup & Restore"
              >
                <Archive size={18} />
              </button>
            </div>
            
            {/* Sync Status */}
            {!syncStatus.isOnline && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                <span className="text-[9px] font-bold text-amber-400 uppercase">Offline</span>
              </div>
            )}
            
            <button 
              onClick={() => canScan && fileInputRef.current?.click()} 
              disabled={!canScan}
              className={`${canScan ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-700 cursor-not-allowed'} text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-glow flex items-center gap-2 transition-all active:scale-95`}
            >
              <Plus size={18} /> New Scans
            </button>
            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && Array.from(e.target.files).forEach(f => processFile(f as File))} multiple accept="image/*,application/pdf" className="hidden" />
            <input type="file" ref={importFileRef} onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} accept=".csv,.vcf,.json" className="hidden" />
            <input type="file" ref={backupFileRef} onChange={(e) => e.target.files?.[0] && handleRestoreBackup(e.target.files[0])} accept=".json" className="hidden" />
          </div>
        </header>

        {activeTab === 'vault' && (
          <div className="px-12 py-6 border-b border-white/5 bg-slate-950/10 flex items-center gap-8">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input type="text" placeholder="Quick search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-900/40 border border-white/5 pl-12 pr-6 py-3 rounded-xl text-xs focus:ring-2 ring-indigo-500/20 outline-none text-slate-300" />
            </div>
            <div className="flex items-center gap-3">
              <Filter size={14} className="text-slate-600" />
              <div className="flex gap-2">
                {industries.slice(0, 5).map(ind => (
                  <button key={ind} onClick={() => setSelectedIndustry(ind)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${selectedIndustry === ind ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900/40 border-white/5 text-slate-500 hover:border-white/10'}`}>
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          {activeTab === 'vault' && (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {filteredContacts.map(contact => (
                  <ContactCard 
                    key={contact.id} 
                    contact={contact} 
                    onDelete={handleDeleteContact} 
                    onUpdate={handleUpdateContact} 
                    onToggleSelect={handleToggleSelect}
                    leadScore={contactLeadScores[contact.id] || null}
                  />
                ))}
              </div>
            ) : (
              <ContactTable 
                contacts={filteredContacts} 
                onDelete={handleDeleteContact} 
                onBulkDelete={handleBulkDelete} 
                onUpdate={handleUpdateContact} 
                onToggleSelect={handleToggleSelect} 
                onSelectAll={handleSelectAll} 
              />
            )
          )}

          {activeTab === 'insights' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass p-10 rounded-[3rem] space-y-6 relative overflow-hidden group">
                  <TrendingUp className="absolute -right-4 -top-4 w-32 h-32 text-indigo-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400"><TrendingUp size={32} /></div>
                  <div>
                    <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Network Capacity</h4>
                    <p className="text-6xl font-black text-white tracking-tighter">{vaultStats.total}</p>
                    <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Total contacts in vault</span>
                  </div>
                </div>
                <div className="glass p-10 rounded-[3rem] space-y-6 relative overflow-hidden group">
                  <Activity className="absolute -right-4 -top-4 w-32 h-32 text-emerald-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400"><Activity size={32} /></div>
                  <div>
                    <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Neural Fidelity</h4>
                    <p className="text-6xl font-black text-white tracking-tighter">{vaultStats.fidelity}%</p>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Database completeness</span>
                  </div>
                </div>
                <div className="glass p-10 rounded-[3rem] space-y-6 relative overflow-hidden group">
                  <Globe className="absolute -right-4 -top-4 w-32 h-32 text-cyan-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-400"><Globe size={32} /></div>
                  <div>
                    <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Industry Spread</h4>
                    <p className="text-6xl font-black text-white tracking-tighter">{industries.length - 1}</p>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Active market sectors</span>
                  </div>
                </div>
              </div>

              {/* AI Optimization Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass p-8 rounded-[2.5rem] space-y-4 relative overflow-hidden group border border-indigo-500/20">
                  <HardDrive className="absolute -right-4 -top-4 w-24 h-24 text-indigo-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400"><HardDrive size={24} /></div>
                  <div>
                    <h4 className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Cache Entries</h4>
                    <p className="text-4xl font-black text-white tracking-tighter">{dbStats.cacheEntries}</p>
                    <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest">Images cached for reuse</span>
                  </div>
                </div>
                <div className="glass p-8 rounded-[2.5rem] space-y-4 relative overflow-hidden group border border-emerald-500/20">
                  <Cpu className="absolute -right-4 -top-4 w-24 h-24 text-emerald-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400"><Cpu size={24} /></div>
                  <div>
                    <h4 className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Scans Processed</h4>
                    <p className="text-4xl font-black text-white tracking-tighter">{stats.processed}</p>
                    <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">This session</span>
                  </div>
                </div>
                <div className="glass p-8 rounded-[2.5rem] space-y-4 relative overflow-hidden group border border-amber-500/20">
                  <Undo2 className="absolute -right-4 -top-4 w-24 h-24 text-amber-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400"><Undo2 size={24} /></div>
                  <div>
                    <h4 className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] mb-1">Undo History</h4>
                    <p className="text-4xl font-black text-white tracking-tighter">{dbStats.historyActions}</p>
                    <span className="text-[9px] text-amber-400 font-bold uppercase tracking-widest">Actions reversible</span>
                  </div>
                </div>
              </div>

              {/* Phase 4: Lead Scoring Distribution */}
              <div className="grid grid-cols-5 gap-4">
                {(['A', 'B', 'C', 'D', 'F'] as const).map((grade) => (
                  <div key={grade} className={`glass p-6 rounded-3xl text-center border ${
                    grade === 'A' ? 'border-emerald-500/30' : 
                    grade === 'B' ? 'border-blue-500/30' : 
                    grade === 'C' ? 'border-amber-500/30' : 
                    grade === 'D' ? 'border-orange-500/30' : 'border-rose-500/30'
                  }`}>
                    <p className={`text-4xl font-black ${
                      grade === 'A' ? 'text-emerald-400' : 
                      grade === 'B' ? 'text-blue-400' : 
                      grade === 'C' ? 'text-amber-400' : 
                      grade === 'D' ? 'text-orange-400' : 'text-rose-400'
                    }`}>{gradeDistribution[grade]}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Grade {grade}</p>
                  </div>
                ))}
              </div>

              {/* Phase 4: Insights & Reminders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Active Insights */}
                <div className="glass p-8 rounded-[3rem] border border-indigo-500/20">
                  <div className="flex items-center gap-3 mb-6">
                    <Lightbulb size={24} className="text-indigo-400" />
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">AI Insights</h3>
                    <span className="ml-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-3 py-1 rounded-full">
                      {insights.filter(i => !i.dismissed).length}
                    </span>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {insights.filter(i => !i.dismissed).slice(0, 5).map(insight => (
                      <div key={insight.id} className={`p-4 rounded-2xl border ${
                        insight.priority === 'critical' ? 'bg-rose-500/10 border-rose-500/30' :
                        insight.priority === 'high' ? 'bg-amber-500/10 border-amber-500/30' :
                        insight.priority === 'medium' ? 'bg-indigo-500/10 border-indigo-500/30' :
                        'bg-slate-900/40 border-white/5'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">{insight.title}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{insight.description}</p>
                          </div>
                          <button 
                            onClick={() => {
                              dismissInsight(insight.id);
                              setInsights(prev => prev.filter(i => i.id !== insight.id));
                            }}
                            className="text-slate-600 hover:text-slate-400 p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {insights.filter(i => !i.dismissed).length === 0 && (
                      <p className="text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest py-8">All caught up!</p>
                    )}
                  </div>
                </div>

                {/* Reminders */}
                <div className="glass p-8 rounded-[3rem] border border-amber-500/20">
                  <div className="flex items-center gap-3 mb-6">
                    <Bell size={24} className="text-amber-400" />
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Follow-ups</h3>
                    <span className="ml-auto text-[10px] font-bold text-amber-400 bg-amber-500/20 px-3 py-1 rounded-full">
                      {reminders.length}
                    </span>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {reminders.slice(0, 5).map(reminder => (
                      <div key={reminder.id} className={`p-4 rounded-2xl ${
                        reminder.status === 'pending' && reminder.dueDate < Date.now() 
                          ? 'bg-rose-500/10 border border-rose-500/30' 
                          : 'bg-slate-900/40 border border-white/5'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">{reminder.title}</p>
                            <p className="text-[10px] text-slate-500 mt-1">
                              {new Date(reminder.dueDate).toLocaleDateString()} · {reminder.contactName}
                            </p>
                          </div>
                          <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-lg ${
                            reminder.priority === 'high' ? 'bg-rose-500/20 text-rose-400' :
                            reminder.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-800 text-slate-400'
                          }`}>{reminder.priority}</span>
                        </div>
                      </div>
                    ))}
                    {reminders.length === 0 && (
                      <p className="text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest py-8">No pending reminders</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase 4: Network Analysis */}
              {networkAnalysis && networkAnalysis.nodes.length > 0 && (
                <div className="glass p-8 rounded-[3rem] border border-cyan-500/20">
                  <div className="flex items-center gap-3 mb-6">
                    <Network size={24} className="text-cyan-400" />
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Network Analysis</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-slate-900/40 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-cyan-400">{networkAnalysis.edges.length}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Connections</p>
                    </div>
                    <div className="bg-slate-900/40 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-emerald-400">{networkAnalysis.clusters.length}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Clusters</p>
                    </div>
                    <div className="bg-slate-900/40 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-indigo-400">{networkAnalysis.keyConnectors.length}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Key Connectors</p>
                    </div>
                    <div className="bg-slate-900/40 p-6 rounded-2xl text-center">
                      <p className="text-3xl font-black text-amber-400">{networkAnalysis.isolatedContacts.length}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Isolated</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Phase 5: Team Collaboration */}
              <div className="glass p-8 rounded-[3rem] border border-fuchsia-500/20">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <MessageSquare size={24} className="text-fuchsia-400" />
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Team Activity</h3>
                  </div>
                  <button 
                    onClick={() => setShowActivityPanel(!showActivityPanel)}
                    className="text-[10px] font-bold text-fuchsia-400 bg-fuchsia-500/20 px-4 py-2 rounded-xl hover:bg-fuchsia-500/30 transition-colors"
                  >
                    {showActivityPanel ? 'Hide Feed' : 'View All'}
                  </button>
                </div>
                
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-900/40 p-4 rounded-2xl text-center">
                    <p className="text-2xl font-black text-fuchsia-400">{commentStats.totalComments}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Comments</p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-2xl text-center">
                    <p className="text-2xl font-black text-cyan-400">{noteStats.totalNotes}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Notes</p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-2xl text-center">
                    <p className="text-2xl font-black text-amber-400">{unreadMentions.length}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Mentions</p>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-2xl text-center">
                    <p className="text-2xl font-black text-emerald-400">{commentStats.recentActivity}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Today</p>
                  </div>
                </div>

                {/* Activity Feed */}
                {showActivityPanel && (
                  <div className="space-y-4 max-h-80 overflow-y-auto">
                    {activityFeed.map(group => (
                      <div key={group.date} className="space-y-2">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest sticky top-0 bg-slate-900/80 py-2">{group.date}</p>
                        {group.activities.map(activity => (
                          <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/40 border border-white/5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              activity.type.includes('created') ? 'bg-emerald-500/20 text-emerald-400' :
                              activity.type.includes('updated') ? 'bg-blue-500/20 text-blue-400' :
                              activity.type.includes('comment') ? 'bg-indigo-500/20 text-indigo-400' :
                              activity.type.includes('deleted') ? 'bg-rose-500/20 text-rose-400' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {activity.type.includes('created') && <Plus size={14} />}
                              {activity.type.includes('updated') && <RefreshCw size={14} />}
                              {activity.type.includes('comment') && <MessageSquare size={14} />}
                              {activity.type.includes('mention') && <AtSign size={14} />}
                              {activity.type.includes('note') && <StickyNote size={14} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{activity.description}</p>
                              <p className="text-[10px] text-slate-500">{activity.targetName} · {new Date(activity.createdAt).toLocaleTimeString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {activityFeed.length === 0 && (
                      <p className="text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest py-8">No activity yet</p>
                    )}
                  </div>
                )}
              </div>

              <div className="glass p-12 rounded-[4rem] border border-white/5">
                <div className="flex items-center justify-between mb-12">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Sector Distribution</h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Intelligence breakdown of your vault</p>
                  </div>
                  <button className="p-4 bg-slate-900 rounded-2xl text-slate-500 hover:text-white transition-colors"><PieChart size={20} /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {industries.filter(i => i !== 'All').map(ind => {
                    const count = contacts.filter(c => c.industry === ind).length;
                    const pct = Math.round((count / (contacts.length || 1)) * 100);
                    return (
                      <div key={ind} className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{ind}</span>
                          <span className="text-[9px] font-black text-indigo-400">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{width: `${pct}%`}}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Admin Tab Navigation */}
              <div className="glass p-2 rounded-2xl flex gap-2">
                <button 
                  onClick={() => setAdminTab('users')}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${adminTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  <Users size={16} /> Users
                </button>
                <button 
                  onClick={() => setAdminTab('invites')}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${adminTab === 'invites' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                >
                  <UserPlus size={16} /> Invites
                </button>
                {canViewAudit && (
                  <button 
                    onClick={() => setAdminTab('audit')}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${adminTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}
                  >
                    <Clock size={16} /> Audit Log
                  </button>
                )}
              </div>

              {/* Users Tab */}
              {adminTab === 'users' && (
                <div className="glass p-12 rounded-[4rem] border border-white/5 space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="p-5 bg-indigo-600/10 rounded-2xl text-indigo-400"><Shield size={32} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">User Management</h3>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Manage access nodes & roles</p>
                    </div>
                  </div>
                  <div className="divide-y divide-white/5">
                    {allUsers.map(user => (
                      <div key={user.id} className="py-6 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center overflow-hidden">
                            {user.picture ? (
                              <img src={user.picture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User size={18} className="text-slate-500" />
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-slate-300 text-sm block">{user.name || user.email}</span>
                            <span className="text-[10px] text-slate-500">{user.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {canManageUsers && user.id !== currentUser.id && (
                            <>
                              <select
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-slate-300 uppercase"
                              >
                                <option value="owner">Owner</option>
                                <option value="admin">Admin</option>
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                                <option value="guest">Guest</option>
                              </select>
                              <button
                                onClick={() => handleStatusChange(user.id, user.status === 'suspended' ? 'approved' : 'suspended')}
                                className={`p-2 rounded-lg ${user.status === 'suspended' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}
                                title={user.status === 'suspended' ? 'Activate user' : 'Suspend user'}
                              >
                                {user.status === 'suspended' ? <Check size={14} /> : <X size={14} />}
                              </button>
                            </>
                          )}
                          <div className={`w-2.5 h-2.5 rounded-full ${user.status === 'approved' ? 'bg-emerald-500' : user.status === 'pending' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                        </div>
                      </div>
                    ))}
                    {allUsers.length === 0 && (
                      <p className="py-12 text-center text-slate-600 font-bold uppercase tracking-widest text-[10px]">No users registered yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Invites Tab */}
              {adminTab === 'invites' && canManageUsers && (
                <div className="glass p-12 rounded-[4rem] border border-white/5 space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="p-5 bg-emerald-600/10 rounded-2xl text-emerald-400"><UserPlus size={32} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Invite Users</h3>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Send invitations to new team members</p>
                    </div>
                  </div>
                  
                  {/* Invite Form */}
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                      <input
                        type="email"
                        placeholder="Email address..."
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full bg-slate-900/40 border border-white/5 pl-12 pr-6 py-3 rounded-xl text-xs focus:ring-2 ring-indigo-500/20 outline-none text-slate-300"
                      />
                    </div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-slate-300 uppercase"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={handleSendInvite}
                      disabled={!inviteEmail}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Send Invite
                    </button>
                  </div>

                  {/* Pending Invites */}
                  <div className="divide-y divide-white/5">
                    <div className="py-4">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pending Invites</span>
                    </div>
                    {invites.filter(i => i.status === 'pending').map(invite => (
                      <div key={invite.id} className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Mail size={16} className="text-slate-500" />
                          <span className="text-slate-300 text-sm">{invite.email}</span>
                          <span className="text-[9px] text-indigo-400 uppercase px-2 py-0.5 bg-indigo-500/10 rounded">{invite.role}</span>
                        </div>
                        <span className="text-[9px] text-slate-500">
                          Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {invites.filter(i => i.status === 'pending').length === 0 && (
                      <p className="py-8 text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest">No pending invites</p>
                    )}
                  </div>
                </div>
              )}

              {/* Audit Log Tab */}
              {adminTab === 'audit' && canViewAudit && (
                <div className="glass p-12 rounded-[4rem] border border-white/5 space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="p-5 bg-cyan-600/10 rounded-2xl text-cyan-400"><Clock size={32} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Audit Log</h3>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Recent activity history</p>
                    </div>
                  </div>

                  <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
                    {auditLog.map(entry => (
                      <div key={entry.id} className="py-4 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            entry.action.includes('login') ? 'bg-emerald-500/20 text-emerald-400' :
                            entry.action.includes('delete') ? 'bg-rose-500/20 text-rose-400' :
                            entry.action.includes('create') ? 'bg-indigo-500/20 text-indigo-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            <Activity size={14} />
                          </div>
                          <div>
                            <span className="text-slate-300 text-sm block">{entry.action}</span>
                            <span className="text-[10px] text-slate-500">{entry.userEmail}</span>
                          </div>
                        </div>
                        <span className="text-[9px] text-slate-600 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {auditLog.length === 0 && (
                      <p className="py-12 text-center text-slate-600 font-bold uppercase tracking-widest text-[10px]">No activity recorded</p>
                    )}
                  </div>
                </div>
              )}

              {/* Original Users List (fallback for non-admins) */}
              {adminTab === 'users' && allUsers.length === 0 && (
                <div className="glass p-12 rounded-[4rem] border border-white/5 space-y-8">
                  <div className="flex items-center gap-6">
                    <div className="p-5 bg-indigo-600/10 rounded-2xl text-indigo-400"><Shield size={32} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Security Protocol</h3>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Manage access nodes & authentication</p>
                    </div>
                  </div>
                  <div className="divide-y divide-white/5">
                    {Object.entries(getAllUsers()).map(([email, status]) => (
                      <div key={email} className="py-6 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className={`w-2.5 h-2.5 rounded-full ${status === 'approved' ? 'bg-emerald-500' : 'bg-rose-500'} shadow-glow`}></div>
                          <span className="font-bold text-slate-300 text-sm">{email}</span>
                        </div>
                      </div>
                    ))}
                    {Object.keys(getAllUsers()).length === 0 && (
                      <p className="py-12 text-center text-slate-600 font-bold uppercase tracking-widest text-[10px]">No auxiliary nodes registered</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Loading State */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[100] flex flex-col items-center justify-center gap-8">
          <div className="relative">
            <div className="w-32 h-32 border-[6px] border-indigo-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-xs">Loading vault...</p>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[100] flex flex-col items-center justify-center gap-12">
          <div className="relative">
            <div className="w-48 h-48 border-[10px] border-indigo-500/5 rounded-full"></div>
            <div className="absolute inset-0 border-[10px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white w-20 h-20 fill-white shadow-glow" />
          </div>
          <div className="text-center space-y-4">
            <h3 className="text-6xl font-black text-white tracking-tighter uppercase text-glow">Neural Syncing</h3>
            <p className="text-slate-500 font-bold uppercase tracking-[0.5em] text-xs">{processingMessage || 'Processing...'}</p>
          </div>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[90] flex items-center justify-center p-8">
          <div className="glass max-w-lg w-full rounded-[3rem] p-10 space-y-8 border border-amber-500/30">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-amber-500/10 rounded-2xl">
                <AlertTriangle className="text-amber-500" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Duplicate Detected</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Similar contact already exists</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="p-6 bg-slate-900/50 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">New Contact</p>
                <p className="text-white font-bold text-lg">{duplicateWarning.contact.name}</p>
                <p className="text-slate-400 text-sm">{duplicateWarning.contact.email} • {duplicateWarning.contact.phone}</p>
              </div>
              
              <div className="p-6 bg-slate-900/50 rounded-2xl border border-amber-500/20">
                <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-2">Similar to ({duplicateWarning.matches[0].score}% match)</p>
                <p className="text-white font-bold text-lg">{duplicateWarning.matches[0].contact.name}</p>
                <p className="text-slate-400 text-sm">
                  {duplicateWarning.matches[0].contact.email} • {duplicateWarning.matches[0].contact.phone}
                </p>
                <p className="text-[9px] text-slate-600 mt-2">
                  Matched: {duplicateWarning.matches[0].matchedFields.join(', ')}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setDuplicateWarning(null)} 
                className="flex-1 py-4 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
              >
                Keep Both
              </button>
              <button 
                onClick={() => {
                  // Remove the new duplicate and keep original
                  handleDeleteContact(duplicateWarning.contact.id);
                  setDuplicateWarning(null);
                }} 
                className="flex-1 py-4 bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 transition-all flex items-center justify-center gap-2"
              >
                <Copy size={14} /> Use Existing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[90] flex items-center justify-center p-8">
          <div className="glass max-w-lg w-full rounded-[3rem] p-10 space-y-8 border border-emerald-500/30">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-emerald-500/10 rounded-2xl">
                <Download className="text-emerald-500" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Export Contacts</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                  {contacts.filter(c => c.selected).length > 0 
                    ? `${contacts.filter(c => c.selected).length} selected` 
                    : `${filteredContacts.length} contacts`}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {(['csv', 'vcf', 'json', 'xml'] as const).map(format => (
                <button
                  key={format}
                  onClick={() => setExportFormat(format)}
                  className={`p-6 rounded-2xl border transition-all ${
                    exportFormat === format 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900/40 border-white/5 text-slate-400 hover:border-white/10'
                  }`}
                >
                  <FileText size={24} className="mx-auto mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{format}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setShowExportModal(false)} 
                className="flex-1 py-4 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleExport(exportFormat)} 
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
              >
                <Download size={14} /> Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[90] flex items-center justify-center p-8">
          <div className="glass max-w-lg w-full rounded-[3rem] p-10 space-y-8 border border-indigo-500/30">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-indigo-500/10 rounded-2xl">
                <Upload className="text-indigo-500" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Import Contacts</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">CSV, vCard, or JSON</p>
              </div>
            </div>
            
            {importResult ? (
              <div className="space-y-4">
                <div className={`p-6 rounded-2xl ${importResult.success ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                  <p className={`text-lg font-bold ${importResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {importResult.success ? 'Import Complete!' : 'Import Failed'}
                  </p>
                  <div className="mt-2 text-sm text-slate-400">
                    <p>Total records: {importResult.totalRecords}</p>
                    <p>Imported: {importResult.importedCount}</p>
                    <p>Skipped: {importResult.skippedCount}</p>
                    {importResult.duplicates.length > 0 && (
                      <p className="text-amber-400">Duplicates found: {importResult.duplicates.length}</p>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => { setImportResult(null); setShowImportModal(false); }} 
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div 
                  onClick={() => importFileRef.current?.click()}
                  className="p-12 border-2 border-dashed border-white/10 rounded-2xl text-center hover:border-indigo-500/50 transition-all cursor-pointer"
                >
                  <Upload size={48} className="mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400 text-sm">Click or drag file to upload</p>
                  <p className="text-slate-600 text-[10px] mt-2">Supports CSV, vCard (.vcf), JSON</p>
                </div>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowImportModal(false)} 
                    className="flex-1 py-4 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleMergeDuplicates}
                    className="flex-1 py-4 bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={14} /> Merge Duplicates
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Backup Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[90] flex items-center justify-center p-8">
          <div className="glass max-w-lg w-full rounded-[3rem] p-10 space-y-8 border border-amber-500/30">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-amber-500/10 rounded-2xl">
                <Archive className="text-amber-500" size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Backup & Restore</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{contacts.length} contacts in vault</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={handleBackupDownload}
                className="w-full p-6 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-emerald-500/30 transition-all flex items-center gap-4"
              >
                <Download size={24} className="text-emerald-400" />
                <div className="text-left">
                  <p className="text-white font-bold">Download Backup</p>
                  <p className="text-slate-500 text-[10px]">Save all contacts to a JSON file</p>
                </div>
              </button>
              
              <button 
                onClick={() => backupFileRef.current?.click()}
                className="w-full p-6 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-indigo-500/30 transition-all flex items-center gap-4"
              >
                <Upload size={24} className="text-indigo-400" />
                <div className="text-left">
                  <p className="text-white font-bold">Restore from Backup</p>
                  <p className="text-slate-500 text-[10px]">Import contacts from a backup file</p>
                </div>
              </button>
            </div>

            <button 
              onClick={() => setShowBackupModal(false)} 
              className="w-full py-4 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Internal icon for sidebar
const User = ({ size, className }: { size: number, className: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default App;
