/**
 * Lead Scoring Service
 * AI-powered contact scoring for prioritization
 * Uses weighted factors without external AI calls
 */

import { ContactInfo } from '../types';
import { getContactTags } from './smartTagging';
import { getContactRelationships } from './relationshipMapping';
import { getContactReminders } from './reminderService';

// ==================== TYPES ====================

export interface LeadScore {
  contactId: string;
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: ScoreBreakdown;
  signals: Signal[];
  lastCalculated: number;
}

export interface ScoreBreakdown {
  dataCompleteness: number;
  professionalSignals: number;
  engagement: number;
  networkStrength: number;
  recency: number;
}

export interface Signal {
  type: 'positive' | 'negative' | 'neutral';
  factor: string;
  description: string;
  impact: number; // points added/subtracted
}

export interface ScoringWeights {
  dataCompleteness: number;
  professionalSignals: number;
  engagement: number;
  networkStrength: number;
  recency: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  thresholds: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
}

// ==================== CONFIGURATION ====================

const DEFAULT_WEIGHTS: ScoringWeights = {
  dataCompleteness: 25,
  professionalSignals: 30,
  engagement: 20,
  networkStrength: 15,
  recency: 10
};

const DEFAULT_THRESHOLDS = {
  A: 80,
  B: 60,
  C: 40,
  D: 20
};

const SCORES_KEY = 'kksmartscan_lead_scores';
const CONFIG_KEY = 'kksmartscan_scoring_config';

// ==================== STORAGE ====================

export function getAllScores(): Map<string, LeadScore> {
  try {
    const data = JSON.parse(localStorage.getItem(SCORES_KEY) || '{}');
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

function saveScores(scores: Map<string, LeadScore>): void {
  localStorage.setItem(SCORES_KEY, JSON.stringify(Object.fromEntries(scores)));
}

export function getScoringConfig(): ScoringConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return {
      weights: { ...DEFAULT_WEIGHTS, ...stored.weights },
      thresholds: { ...DEFAULT_THRESHOLDS, ...stored.thresholds }
    };
  } catch {
    return { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS };
  }
}

export function updateScoringConfig(config: Partial<ScoringConfig>): void {
  const current = getScoringConfig();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    weights: { ...current.weights, ...config.weights },
    thresholds: { ...current.thresholds, ...config.thresholds }
  }));
}

// ==================== SCORING ENGINE ====================

/**
 * Calculate lead score for a contact
 */
export function calculateLeadScore(contact: ContactInfo): LeadScore {
  const config = getScoringConfig();
  const signals: Signal[] = [];
  const breakdown: ScoreBreakdown = {
    dataCompleteness: 0,
    professionalSignals: 0,
    engagement: 0,
    networkStrength: 0,
    recency: 0
  };
  
  // 1. Data Completeness Score (0-100, normalized to weight)
  breakdown.dataCompleteness = calculateDataCompletenessScore(contact, signals);
  
  // 2. Professional Signals Score (0-100)
  breakdown.professionalSignals = calculateProfessionalSignalsScore(contact, signals);
  
  // 3. Engagement Score (0-100)
  breakdown.engagement = calculateEngagementScore(contact, signals);
  
  // 4. Network Strength Score (0-100)
  breakdown.networkStrength = calculateNetworkStrengthScore(contact, signals);
  
  // 5. Recency Score (0-100)
  breakdown.recency = calculateRecencyScore(contact, signals);
  
  // Calculate weighted total
  const weightedScore = 
    (breakdown.dataCompleteness * config.weights.dataCompleteness / 100) +
    (breakdown.professionalSignals * config.weights.professionalSignals / 100) +
    (breakdown.engagement * config.weights.engagement / 100) +
    (breakdown.networkStrength * config.weights.networkStrength / 100) +
    (breakdown.recency * config.weights.recency / 100);
  
  const score = Math.round(weightedScore);
  const grade = getGrade(score, config.thresholds);
  
  const leadScore: LeadScore = {
    contactId: contact.id,
    score,
    grade,
    breakdown,
    signals,
    lastCalculated: Date.now()
  };
  
  // Save score
  const scores = getAllScores();
  scores.set(contact.id, leadScore);
  saveScores(scores);
  
  return leadScore;
}

/**
 * Bulk calculate scores for all contacts
 */
export function calculateAllScores(contacts: ContactInfo[]): Map<string, LeadScore> {
  const scores = new Map<string, LeadScore>();
  
  for (const contact of contacts) {
    scores.set(contact.id, calculateLeadScore(contact));
  }
  
  return scores;
}

/**
 * Get cached score or calculate if stale
 */
export function getLeadScore(contact: ContactInfo, maxAge: number = 24 * 60 * 60 * 1000): LeadScore {
  const scores = getAllScores();
  const existing = scores.get(contact.id);
  
  if (existing && Date.now() - existing.lastCalculated < maxAge) {
    return existing;
  }
  
  return calculateLeadScore(contact);
}

// ==================== SCORE COMPONENTS ====================

function calculateDataCompletenessScore(contact: ContactInfo, signals: Signal[]): number {
  let score = 0;
  const weights = {
    name: 15,
    email: 20,
    phone: 15,
    firmName: 15,
    jobTitle: 10,
    industry: 10,
    website: 5,
    address: 5,
    notes: 5
  };
  
  // Check each field
  if (contact.name && contact.name.trim()) {
    score += weights.name;
    if (contact.name.includes(' ')) { // Has full name
      signals.push({ type: 'positive', factor: 'Full Name', description: 'Has full name', impact: 2 });
      score += 2;
    }
  } else {
    signals.push({ type: 'negative', factor: 'Missing Name', description: 'No name provided', impact: -5 });
  }
  
  if (contact.email && contact.email.includes('@')) {
    score += weights.email;
    // Corporate email bonus
    const domain = contact.email.split('@')[1];
    if (domain && !domain.match(/gmail|yahoo|hotmail|outlook|icloud/i)) {
      signals.push({ type: 'positive', factor: 'Corporate Email', description: 'Uses company email', impact: 5 });
      score += 5;
    }
  }
  
  if (contact.phone && contact.phone.length >= 10) {
    score += weights.phone;
    if (contact.phone2) { // Multiple numbers
      signals.push({ type: 'positive', factor: 'Multiple Phones', description: 'Has backup contact', impact: 3 });
      score += 3;
    }
  }
  
  if (contact.firmName && contact.firmName.trim()) {
    score += weights.firmName;
  }
  
  if (contact.jobTitle && contact.jobTitle.trim()) {
    score += weights.jobTitle;
  }
  
  if (contact.industry && contact.industry !== 'Unclassified') {
    score += weights.industry;
  }
  
  if (contact.website && contact.website.includes('.')) {
    score += weights.website;
  }
  
  if (contact.address && contact.address.trim()) {
    score += weights.address;
  }
  
  if (contact.notes && contact.notes.length > 20) {
    score += weights.notes;
    signals.push({ type: 'positive', factor: 'Detailed Notes', description: 'Has context notes', impact: 3 });
    score += 3;
  }
  
  return Math.min(100, score);
}

function calculateProfessionalSignalsScore(contact: ContactInfo, signals: Signal[]): number {
  let score = 50; // Base score
  
  // Job title analysis
  const title = (contact.jobTitle || '').toLowerCase();
  
  // C-Suite / Executive
  if (title.match(/ceo|cto|cfo|coo|cmo|cio|chief|president|founder|owner/)) {
    signals.push({ type: 'positive', factor: 'Executive', description: 'C-level executive', impact: 25 });
    score += 25;
  }
  // Director level
  else if (title.match(/director|vp|vice president|head of/)) {
    signals.push({ type: 'positive', factor: 'Senior Leader', description: 'Director/VP level', impact: 20 });
    score += 20;
  }
  // Manager level
  else if (title.match(/manager|lead|supervisor/)) {
    signals.push({ type: 'positive', factor: 'Management', description: 'Management role', impact: 10 });
    score += 10;
  }
  
  // Company analysis
  const company = (contact.firmName || '').toLowerCase();
  
  // Major companies
  const majorCompanies = /google|microsoft|apple|amazon|meta|ibm|oracle|salesforce|netflix|tesla|nvidia/;
  if (majorCompanies.test(company)) {
    signals.push({ type: 'positive', factor: 'Major Company', description: 'Works at major tech company', impact: 15 });
    score += 15;
  }
  
  // Enterprise indicators
  if (company.match(/corp|corporation|inc\.|group|holdings|international|global/)) {
    signals.push({ type: 'positive', factor: 'Enterprise', description: 'Large enterprise company', impact: 8 });
    score += 8;
  }
  
  // Industry value
  const highValueIndustries = ['Technology', 'Finance', 'Healthcare', 'Legal', 'Consulting'];
  if (highValueIndustries.includes(contact.industry || '')) {
    signals.push({ type: 'positive', factor: 'High-Value Industry', description: `${contact.industry} sector`, impact: 10 });
    score += 10;
  }
  
  // Tags-based signals
  const tags = getContactTags(contact.id);
  
  if (tags.includes('VIP')) {
    signals.push({ type: 'positive', factor: 'VIP Tag', description: 'Marked as VIP', impact: 15 });
    score += 15;
  }
  
  if (tags.includes('Decision Maker')) {
    signals.push({ type: 'positive', factor: 'Decision Maker', description: 'Can make purchasing decisions', impact: 15 });
    score += 15;
  }
  
  if (tags.includes('Referral Source')) {
    signals.push({ type: 'positive', factor: 'Referral Source', description: 'Provides referrals', impact: 10 });
    score += 10;
  }
  
  return Math.min(100, Math.max(0, score));
}

function calculateEngagementScore(contact: ContactInfo, signals: Signal[]): number {
  let score = 30; // Base score
  
  const tags = getContactTags(contact.id);
  const reminders = getContactReminders(contact.id);
  
  // Has follow-up tags
  if (tags.includes('followed_up') || tags.includes('contacted')) {
    signals.push({ type: 'positive', factor: 'Engaged', description: 'Has been contacted', impact: 20 });
    score += 20;
  }
  
  // Active reminders
  const pendingReminders = reminders.filter(r => r.status === 'pending');
  if (pendingReminders.length > 0) {
    signals.push({ type: 'positive', factor: 'Active Follow-up', description: 'Has pending reminders', impact: 15 });
    score += 15;
  }
  
  // Completed engagements
  const completedReminders = reminders.filter(r => r.status === 'completed');
  if (completedReminders.length > 0) {
    signals.push({ type: 'positive', factor: 'Engagement History', description: `${completedReminders.length} completed follow-ups`, impact: Math.min(20, completedReminders.length * 5) });
    score += Math.min(20, completedReminders.length * 5);
  }
  
  // Negative: long time since added without engagement
  const daysSinceAdded = (Date.now() - contact.createdAt) / (24 * 60 * 60 * 1000);
  if (daysSinceAdded > 30 && !tags.includes('contacted') && completedReminders.length === 0) {
    signals.push({ type: 'negative', factor: 'Not Engaged', description: 'No engagement after 30 days', impact: -15 });
    score -= 15;
  }
  
  return Math.min(100, Math.max(0, score));
}

function calculateNetworkStrengthScore(contact: ContactInfo, signals: Signal[]): number {
  let score = 20; // Base score
  
  const relationships = getContactRelationships(contact.id);
  const confirmedRels = relationships.filter(r => r.confirmed);
  
  // Number of connections
  if (relationships.length >= 5) {
    signals.push({ type: 'positive', factor: 'Well Connected', description: `${relationships.length} network connections`, impact: 25 });
    score += 25;
  } else if (relationships.length >= 2) {
    signals.push({ type: 'positive', factor: 'Has Connections', description: `${relationships.length} connections`, impact: 15 });
    score += 15;
  }
  
  // Confirmed relationships
  if (confirmedRels.length > 0) {
    signals.push({ type: 'positive', factor: 'Confirmed Network', description: `${confirmedRels.length} verified connections`, impact: 10 });
    score += 10;
  }
  
  // Has colleagues
  const colleagues = relationships.filter(r => r.type === 'colleague');
  if (colleagues.length > 0) {
    signals.push({ type: 'positive', factor: 'Has Colleagues', description: 'Connected to others at same company', impact: 15 });
    score += 15;
  }
  
  // Business partners
  const partners = relationships.filter(r => r.type === 'business_partner');
  if (partners.length > 0) {
    signals.push({ type: 'positive', factor: 'Business Partner', description: 'Has business partnerships', impact: 20 });
    score += 20;
  }
  
  return Math.min(100, Math.max(0, score));
}

function calculateRecencyScore(contact: ContactInfo, signals: Signal[]): number {
  const daysSinceAdded = (Date.now() - contact.createdAt) / (24 * 60 * 60 * 1000);
  
  // Score based on how recently added
  if (daysSinceAdded < 7) {
    signals.push({ type: 'positive', factor: 'New Contact', description: 'Added this week', impact: 10 });
    return 100;
  } else if (daysSinceAdded < 30) {
    signals.push({ type: 'positive', factor: 'Recent Contact', description: 'Added this month', impact: 5 });
    return 80;
  } else if (daysSinceAdded < 90) {
    return 60;
  } else if (daysSinceAdded < 180) {
    signals.push({ type: 'neutral', factor: 'Aging Contact', description: 'Added 3-6 months ago', impact: 0 });
    return 40;
  } else {
    signals.push({ type: 'negative', factor: 'Old Contact', description: 'Added over 6 months ago', impact: -5 });
    return 20;
  }
}

// ==================== UTILITIES ====================

function getGrade(score: number, thresholds: typeof DEFAULT_THRESHOLDS): LeadScore['grade'] {
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  if (score >= thresholds.C) return 'C';
  if (score >= thresholds.D) return 'D';
  return 'F';
}

/**
 * Get contacts by grade
 */
export function getContactsByGrade(contacts: ContactInfo[], grade: LeadScore['grade']): ContactInfo[] {
  const scores = getAllScores();
  
  return contacts.filter(c => {
    const score = scores.get(c.id);
    return score?.grade === grade;
  });
}

/**
 * Get top leads
 */
export function getTopLeads(contacts: ContactInfo[], limit: number = 10): { contact: ContactInfo; score: LeadScore }[] {
  const results: { contact: ContactInfo; score: LeadScore }[] = [];
  
  for (const contact of contacts) {
    const score = getLeadScore(contact);
    results.push({ contact, score });
  }
  
  return results
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, limit);
}

/**
 * Get leads needing attention (low score but high potential)
 */
export function getLeadsNeedingAttention(contacts: ContactInfo[]): { contact: ContactInfo; score: LeadScore; reason: string }[] {
  const results: { contact: ContactInfo; score: LeadScore; reason: string }[] = [];
  
  for (const contact of contacts) {
    const score = getLeadScore(contact);
    
    // High professional signals but low engagement
    if (score.breakdown.professionalSignals >= 70 && score.breakdown.engagement < 40) {
      results.push({
        contact,
        score,
        reason: 'High potential but needs engagement'
      });
    }
    // Good data but no network
    else if (score.breakdown.dataCompleteness >= 80 && score.breakdown.networkStrength < 30) {
      results.push({
        contact,
        score,
        reason: 'Complete profile but isolated in network'
      });
    }
    // Recent but incomplete
    else if (score.breakdown.recency >= 80 && score.breakdown.dataCompleteness < 50) {
      results.push({
        contact,
        score,
        reason: 'New contact needs more information'
      });
    }
  }
  
  return results.sort((a, b) => b.score.breakdown.professionalSignals - a.score.breakdown.professionalSignals);
}

/**
 * Get grade distribution
 */
export function getGradeDistribution(contacts: ContactInfo[]): Record<LeadScore['grade'], number> {
  const distribution: Record<LeadScore['grade'], number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  
  for (const contact of contacts) {
    const score = getLeadScore(contact);
    distribution[score.grade]++;
  }
  
  return distribution;
}

/**
 * Get average score
 */
export function getAverageScore(contacts: ContactInfo[]): number {
  if (contacts.length === 0) return 0;
  
  let total = 0;
  for (const contact of contacts) {
    const score = getLeadScore(contact);
    total += score.score;
  }
  
  return Math.round(total / contacts.length);
}
