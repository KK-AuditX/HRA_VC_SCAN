/**
 * KYC Workflow Service
 * Implements strict state machine for compliance workflow
 * States: Draft -> Pending Review -> Compliance Check -> Approved/Rejected
 */

import { AppUser } from '../types';

// ==================== TYPES ====================

export type KYCStatus = 
  | 'draft'
  | 'pending_review'
  | 'compliance_check'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'suspended';

export type KYCAction = 
  | 'submit_for_review'
  | 'approve_review'
  | 'reject_review'
  | 'request_changes'
  | 'complete_compliance'
  | 'fail_compliance'
  | 'final_approve'
  | 'final_reject'
  | 'expire'
  | 'reactivate'
  | 'suspend';

export interface KYCRecord {
  id: string;
  contactId: string;
  contactName: string;
  status: KYCStatus;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  documents: KYCDocument[];
  checks: ComplianceCheck[];
  history: KYCHistoryEntry[];
  assignedTo: string | null;
  notes: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  approvedBy: string | null;
  expiresAt: number | null;
}

export interface KYCDocument {
  id: string;
  type: 'pan' | 'gstin' | 'aadhar' | 'passport' | 'address_proof' | 'bank_statement' | 'other';
  name: string;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  uploadedAt: number;
  verifiedAt: number | null;
  verifiedBy: string | null;
  expiresAt: number | null;
  notes: string;
}

export interface ComplianceCheck {
  id: string;
  type: 'identity' | 'address' | 'financial' | 'regulatory' | 'sanctions';
  status: 'pending' | 'passed' | 'failed' | 'waived';
  checkedAt: number | null;
  checkedBy: string | null;
  findings: string;
  automated: boolean;
}

export interface KYCHistoryEntry {
  id: string;
  action: KYCAction;
  fromStatus: KYCStatus;
  toStatus: KYCStatus;
  userId: string;
  userName: string;
  reason: string;
  timestamp: number;
}

// ==================== STATE MACHINE ====================

/**
 * Valid state transitions
 */
const STATE_TRANSITIONS: Record<KYCStatus, KYCAction[]> = {
  'draft': ['submit_for_review'],
  'pending_review': ['approve_review', 'reject_review', 'request_changes'],
  'compliance_check': ['complete_compliance', 'fail_compliance', 'final_approve', 'final_reject'],
  'approved': ['expire', 'suspend', 'reactivate'],
  'rejected': ['reactivate'],
  'expired': ['reactivate'],
  'suspended': ['reactivate']
};

/**
 * Action to target state mapping
 */
const ACTION_TARGET_STATE: Record<KYCAction, KYCStatus> = {
  'submit_for_review': 'pending_review',
  'approve_review': 'compliance_check',
  'reject_review': 'draft',
  'request_changes': 'draft',
  'complete_compliance': 'approved',
  'fail_compliance': 'rejected',
  'final_approve': 'approved',
  'final_reject': 'rejected',
  'expire': 'expired',
  'reactivate': 'draft',
  'suspend': 'suspended'
};

/**
 * Check if action is valid for current state
 */
export function isValidTransition(currentStatus: KYCStatus, action: KYCAction): boolean {
  const validActions = STATE_TRANSITIONS[currentStatus] || [];
  return validActions.includes(action);
}

/**
 * Get available actions for a status
 */
export function getAvailableActions(status: KYCStatus): KYCAction[] {
  return STATE_TRANSITIONS[status] || [];
}

// ==================== STORAGE ====================

const KYC_STORAGE_KEY = 'kksmartscan_kyc_records';

function getStoredRecords(): KYCRecord[] {
  try {
    const stored = localStorage.getItem(KYC_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: KYCRecord[]): void {
  localStorage.setItem(KYC_STORAGE_KEY, JSON.stringify(records));
}

// ==================== KYC OPERATIONS ====================

/**
 * Create a new KYC record
 */
export function createKYCRecord(
  contactId: string,
  contactName: string,
  user: AppUser
): KYCRecord {
  const records = getStoredRecords();
  
  // Check if record already exists
  const existing = records.find(r => r.contactId === contactId);
  if (existing) {
    throw new Error('KYC record already exists for this contact');
  }
  
  const record: KYCRecord = {
    id: `kyc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    contactId,
    contactName,
    status: 'draft',
    riskLevel: 'medium',
    riskScore: 50,
    documents: [],
    checks: createDefaultChecks(),
    history: [{
      id: `hist_${Date.now()}`,
      action: 'submit_for_review',
      fromStatus: 'draft',
      toStatus: 'draft',
      userId: user.id,
      userName: user.name,
      reason: 'KYC record created',
      timestamp: Date.now()
    }],
    assignedTo: null,
    notes: '',
    createdBy: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    approvedAt: null,
    approvedBy: null,
    expiresAt: null
  };
  
  records.push(record);
  saveRecords(records);
  
  return record;
}

/**
 * Create default compliance checks
 */
function createDefaultChecks(): ComplianceCheck[] {
  return [
    {
      id: `check_identity_${Date.now()}`,
      type: 'identity',
      status: 'pending',
      checkedAt: null,
      checkedBy: null,
      findings: '',
      automated: false
    },
    {
      id: `check_address_${Date.now()}`,
      type: 'address',
      status: 'pending',
      checkedAt: null,
      checkedBy: null,
      findings: '',
      automated: false
    },
    {
      id: `check_financial_${Date.now()}`,
      type: 'financial',
      status: 'pending',
      checkedAt: null,
      checkedBy: null,
      findings: '',
      automated: false
    },
    {
      id: `check_sanctions_${Date.now()}`,
      type: 'sanctions',
      status: 'pending',
      checkedAt: null,
      checkedBy: null,
      findings: '',
      automated: true
    }
  ];
}

/**
 * Transition KYC status with state machine validation
 */
export function transitionKYCStatus(
  recordId: string,
  action: KYCAction,
  user: AppUser,
  reason: string = ''
): KYCRecord {
  const records = getStoredRecords();
  const index = records.findIndex(r => r.id === recordId);
  
  if (index === -1) {
    throw new Error('KYC record not found');
  }
  
  const record = records[index];
  const currentStatus = record.status;
  
  // Validate state transition
  if (!isValidTransition(currentStatus, action)) {
    throw new Error(
      `Invalid transition: Cannot perform '${action}' from status '${currentStatus}'. ` +
      `Valid actions: ${getAvailableActions(currentStatus).join(', ')}`
    );
  }
  
  const newStatus = ACTION_TARGET_STATE[action];
  
  // Add history entry
  record.history.push({
    id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    action,
    fromStatus: currentStatus,
    toStatus: newStatus,
    userId: user.id,
    userName: user.name,
    reason,
    timestamp: Date.now()
  });
  
  // Update status
  record.status = newStatus;
  record.updatedAt = Date.now();
  
  // Handle approval
  if (newStatus === 'approved') {
    record.approvedAt = Date.now();
    record.approvedBy = user.id;
    record.expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year
  }
  
  records[index] = record;
  saveRecords(records);
  
  return record;
}

/**
 * Add document to KYC record
 */
export function addKYCDocument(
  recordId: string,
  document: Omit<KYCDocument, 'id' | 'uploadedAt' | 'verifiedAt' | 'verifiedBy'>
): KYCRecord {
  const records = getStoredRecords();
  const index = records.findIndex(r => r.id === recordId);
  
  if (index === -1) {
    throw new Error('KYC record not found');
  }
  
  const record = records[index];
  
  record.documents.push({
    ...document,
    id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    uploadedAt: Date.now(),
    verifiedAt: null,
    verifiedBy: null
  });
  
  record.updatedAt = Date.now();
  records[index] = record;
  saveRecords(records);
  
  // Recalculate risk
  updateRiskScore(recordId);
  
  return record;
}

/**
 * Verify a document
 */
export function verifyDocument(
  recordId: string,
  documentId: string,
  user: AppUser,
  verified: boolean,
  notes: string = ''
): KYCRecord {
  const records = getStoredRecords();
  const index = records.findIndex(r => r.id === recordId);
  
  if (index === -1) {
    throw new Error('KYC record not found');
  }
  
  const record = records[index];
  const docIndex = record.documents.findIndex(d => d.id === documentId);
  
  if (docIndex === -1) {
    throw new Error('Document not found');
  }
  
  record.documents[docIndex].status = verified ? 'verified' : 'rejected';
  record.documents[docIndex].verifiedAt = Date.now();
  record.documents[docIndex].verifiedBy = user.id;
  record.documents[docIndex].notes = notes;
  
  record.updatedAt = Date.now();
  records[index] = record;
  saveRecords(records);
  
  // Recalculate risk
  updateRiskScore(recordId);
  
  return record;
}

/**
 * Complete a compliance check
 */
export function completeComplianceCheck(
  recordId: string,
  checkType: ComplianceCheck['type'],
  user: AppUser,
  passed: boolean,
  findings: string = ''
): KYCRecord {
  const records = getStoredRecords();
  const index = records.findIndex(r => r.id === recordId);
  
  if (index === -1) {
    throw new Error('KYC record not found');
  }
  
  const record = records[index];
  const checkIndex = record.checks.findIndex(c => c.type === checkType);
  
  if (checkIndex === -1) {
    throw new Error('Compliance check not found');
  }
  
  record.checks[checkIndex].status = passed ? 'passed' : 'failed';
  record.checks[checkIndex].checkedAt = Date.now();
  record.checks[checkIndex].checkedBy = user.id;
  record.checks[checkIndex].findings = findings;
  
  record.updatedAt = Date.now();
  records[index] = record;
  saveRecords(records);
  
  // Recalculate risk
  updateRiskScore(recordId);
  
  return record;
}

// ==================== RISK SCORING ====================

/**
 * Risk scoring weights
 */
const RISK_WEIGHTS = {
  missingDocuments: 20,
  rejectedDocuments: 25,
  failedChecks: 30,
  pendingChecks: 10,
  expiredDocuments: 15
};

/**
 * Calculate and update risk score
 */
export function updateRiskScore(recordId: string): KYCRecord {
  const records = getStoredRecords();
  const index = records.findIndex(r => r.id === recordId);
  
  if (index === -1) {
    throw new Error('KYC record not found');
  }
  
  const record = records[index];
  
  // Calculate risk factors
  const requiredDocs = ['pan', 'gstin', 'address_proof'];
  const missingDocs = requiredDocs.filter(
    type => !record.documents.some(d => d.type === type && d.status === 'verified')
  ).length;
  
  const rejectedDocs = record.documents.filter(d => d.status === 'rejected').length;
  const expiredDocs = record.documents.filter(d => d.status === 'expired').length;
  const failedChecks = record.checks.filter(c => c.status === 'failed').length;
  const pendingChecks = record.checks.filter(c => c.status === 'pending').length;
  
  // Calculate score (higher = more risk)
  let riskScore = 0;
  riskScore += missingDocs * RISK_WEIGHTS.missingDocuments;
  riskScore += rejectedDocs * RISK_WEIGHTS.rejectedDocuments;
  riskScore += expiredDocs * RISK_WEIGHTS.expiredDocuments;
  riskScore += failedChecks * RISK_WEIGHTS.failedChecks;
  riskScore += pendingChecks * RISK_WEIGHTS.pendingChecks;
  
  // Cap at 100
  riskScore = Math.min(100, riskScore);
  
  // Determine risk level
  let riskLevel: KYCRecord['riskLevel'];
  if (riskScore >= 75) riskLevel = 'critical';
  else if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 25) riskLevel = 'medium';
  else riskLevel = 'low';
  
  record.riskScore = riskScore;
  record.riskLevel = riskLevel;
  record.updatedAt = Date.now();
  
  records[index] = record;
  saveRecords(records);
  
  return record;
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Get KYC record by contact ID
 */
export function getKYCRecord(contactId: string): KYCRecord | null {
  const records = getStoredRecords();
  return records.find(r => r.contactId === contactId) || null;
}

/**
 * Get KYC record by ID
 */
export function getKYCRecordById(recordId: string): KYCRecord | null {
  const records = getStoredRecords();
  return records.find(r => r.id === recordId) || null;
}

/**
 * Get all KYC records
 */
export function getAllKYCRecords(): KYCRecord[] {
  return getStoredRecords();
}

/**
 * Get KYC records by status
 */
export function getKYCRecordsByStatus(status: KYCStatus): KYCRecord[] {
  const records = getStoredRecords();
  return records.filter(r => r.status === status);
}

/**
 * Get pending reviews
 */
export function getPendingReviews(): KYCRecord[] {
  return getKYCRecordsByStatus('pending_review');
}

/**
 * Get records requiring compliance check
 */
export function getComplianceQueue(): KYCRecord[] {
  return getKYCRecordsByStatus('compliance_check');
}

/**
 * Get high risk records
 */
export function getHighRiskRecords(): KYCRecord[] {
  const records = getStoredRecords();
  return records.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical');
}

/**
 * Get expiring records
 */
export function getExpiringRecords(daysAhead: number = 30): KYCRecord[] {
  const cutoff = Date.now() + daysAhead * 24 * 60 * 60 * 1000;
  const records = getStoredRecords();
  return records.filter(r => r.expiresAt && r.expiresAt < cutoff && r.status === 'approved');
}

// ==================== STATS ====================

export interface KYCStats {
  total: number;
  byStatus: Record<KYCStatus, number>;
  byRisk: Record<string, number>;
  pendingReview: number;
  complianceQueue: number;
  expiringSoon: number;
  averageProcessingTime: number;
}

export function getKYCStats(): KYCStats {
  const records = getStoredRecords();
  
  const byStatus: Record<string, number> = {
    draft: 0,
    pending_review: 0,
    compliance_check: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    suspended: 0
  };
  
  const byRisk: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  };
  
  let totalProcessingTime = 0;
  let processedCount = 0;
  
  for (const record of records) {
    byStatus[record.status] = (byStatus[record.status] || 0) + 1;
    byRisk[record.riskLevel] = (byRisk[record.riskLevel] || 0) + 1;
    
    if (record.approvedAt) {
      totalProcessingTime += record.approvedAt - record.createdAt;
      processedCount++;
    }
  }
  
  return {
    total: records.length,
    byStatus: byStatus as Record<KYCStatus, number>,
    byRisk,
    pendingReview: byStatus.pending_review,
    complianceQueue: byStatus.compliance_check,
    expiringSoon: getExpiringRecords(30).length,
    averageProcessingTime: processedCount > 0 ? totalProcessingTime / processedCount : 0
  };
}
