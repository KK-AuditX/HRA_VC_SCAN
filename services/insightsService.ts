/**
 * Predictive Insights Service
 * AI-driven analytics and recommendations
 * Uses pattern analysis for insights without excessive API calls
 */

import { ContactInfo } from '../types';
import { getContactTags } from './smartTagging';
import { getContactRelationships, discoverRelationships } from './relationshipMapping';

// ==================== TYPES ====================

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
  action?: InsightAction;
  data?: Record<string, unknown>;
  createdAt: number;
  expiresAt?: number;
  dismissed?: boolean;
}

export type InsightType =
  | 'growth_trend'
  | 'data_quality'
  | 'network_opportunity'
  | 'engagement_needed'
  | 'milestone'
  | 'risk_alert'
  | 'recommendation';

export interface InsightAction {
  label: string;
  type: 'tag' | 'follow_up' | 'complete_data' | 'export' | 'review';
  payload: Record<string, unknown>;
}

export interface TrendData {
  period: string;
  count: number;
  change: number;
  changePercent: number;
}

export interface IndustryBreakdown {
  industry: string;
  count: number;
  percentage: number;
  trend: 'growing' | 'stable' | 'declining';
}

export interface DataQualityReport {
  overallScore: number;
  completeness: number;
  accuracy: number;
  freshness: number;
  issues: DataQualityIssue[];
}

export interface DataQualityIssue {
  field: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

// ==================== INSIGHTS STORAGE ====================

const INSIGHTS_KEY = 'kksmartscan_insights';

export function getAllInsights(): Insight[] {
  try {
    const insights = JSON.parse(localStorage.getItem(INSIGHTS_KEY) || '[]');
    // Filter out expired insights
    return insights.filter((i: Insight) => 
      !i.expiresAt || i.expiresAt > Date.now()
    );
  } catch {
    return [];
  }
}

function saveInsights(insights: Insight[]): void {
  localStorage.setItem(INSIGHTS_KEY, JSON.stringify(insights));
}

export function dismissInsight(insightId: string): void {
  const insights = getAllInsights();
  const insight = insights.find(i => i.id === insightId);
  if (insight) {
    insight.dismissed = true;
    saveInsights(insights);
  }
}

// ==================== INSIGHT GENERATION ====================

/**
 * Generate all insights for contacts
 */
export function generateInsights(contacts: ContactInfo[]): Insight[] {
  const newInsights: Insight[] = [];
  
  // Data quality insights
  const qualityInsights = generateDataQualityInsights(contacts);
  newInsights.push(...qualityInsights);
  
  // Growth trend insights
  const trendInsights = generateTrendInsights(contacts);
  newInsights.push(...trendInsights);
  
  // Network opportunity insights
  const networkInsights = generateNetworkInsights(contacts);
  newInsights.push(...networkInsights);
  
  // Engagement insights
  const engagementInsights = generateEngagementInsights(contacts);
  newInsights.push(...engagementInsights);
  
  // Milestone insights
  const milestoneInsights = generateMilestoneInsights(contacts);
  newInsights.push(...milestoneInsights);
  
  // Save new insights (merge with existing, avoiding duplicates)
  const existing = getAllInsights().filter(i => !i.dismissed);
  const existingTitles = new Set(existing.map(i => i.title));
  const uniqueNew = newInsights.filter(i => !existingTitles.has(i.title));
  
  saveInsights([...existing, ...uniqueNew]);
  
  return [...existing, ...uniqueNew];
}

/**
 * Generate data quality insights
 */
function generateDataQualityInsights(contacts: ContactInfo[]): Insight[] {
  const insights: Insight[] = [];
  const report = analyzeDataQuality(contacts);
  
  // Overall quality insight
  if (report.overallScore < 50) {
    insights.push(createInsight(
      'data_quality',
      'Data Quality Needs Attention',
      `Your contact database has a quality score of ${report.overallScore}%. ${report.issues.length} issues detected.`,
      'high',
      true,
      {
        label: 'Review Issues',
        type: 'review',
        payload: { issues: report.issues }
      }
    ));
  }
  
  // Missing emails insight
  const missingEmails = contacts.filter(c => !c.email);
  if (missingEmails.length > contacts.length * 0.3) {
    insights.push(createInsight(
      'data_quality',
      'Many Contacts Missing Emails',
      `${missingEmails.length} contacts (${Math.round(missingEmails.length / contacts.length * 100)}%) don't have email addresses.`,
      'medium',
      true,
      {
        label: 'View Contacts',
        type: 'complete_data',
        payload: { field: 'email', contactIds: missingEmails.map(c => c.id) }
      }
    ));
  }
  
  // Missing phone numbers insight
  const missingPhones = contacts.filter(c => !c.phone);
  if (missingPhones.length > contacts.length * 0.4) {
    insights.push(createInsight(
      'data_quality',
      'Phone Numbers Could Be More Complete',
      `${missingPhones.length} contacts don't have phone numbers registered.`,
      'low',
      true,
      {
        label: 'View Contacts',
        type: 'complete_data',
        payload: { field: 'phone', contactIds: missingPhones.map(c => c.id) }
      }
    ));
  }
  
  // Unclassified industry insight
  const unclassified = contacts.filter(c => 
    !c.industry || c.industry === 'Unclassified' || c.industry === 'Other'
  );
  if (unclassified.length > 5) {
    insights.push(createInsight(
      'data_quality',
      'Contacts Need Industry Classification',
      `${unclassified.length} contacts haven't been classified by industry.`,
      'low',
      true,
      {
        label: 'Auto-Tag',
        type: 'tag',
        payload: { contactIds: unclassified.map(c => c.id) }
      }
    ));
  }
  
  return insights;
}

/**
 * Generate trend insights
 */
function generateTrendInsights(contacts: ContactInfo[]): Insight[] {
  const insights: Insight[] = [];
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
  
  const lastWeek = contacts.filter(c => c.createdAt >= oneWeekAgo);
  const previousWeek = contacts.filter(c => c.createdAt >= twoWeeksAgo && c.createdAt < oneWeekAgo);
  
  // Growth comparison
  const growth = lastWeek.length - previousWeek.length;
  const growthPercent = previousWeek.length > 0 
    ? Math.round((growth / previousWeek.length) * 100)
    : (lastWeek.length > 0 ? 100 : 0);
  
  if (growthPercent > 50 && lastWeek.length >= 3) {
    insights.push(createInsight(
      'growth_trend',
      'Network Growing Fast!',
      `You added ${lastWeek.length} contacts this week, ${growthPercent}% more than last week.`,
      'low',
      false
    ));
  } else if (growth < 0 && previousWeek.length >= 5) {
    insights.push(createInsight(
      'growth_trend',
      'Networking Activity Slowed',
      `You added fewer contacts this week than last week. Time to network?`,
      'low',
      false
    ));
  }
  
  // Industry trend
  const industryGrowth = getIndustryGrowth(contacts);
  const fastestGrowing = industryGrowth.find(i => i.trend === 'growing');
  if (fastestGrowing && fastestGrowing.count >= 3) {
    insights.push(createInsight(
      'growth_trend',
      `${fastestGrowing.industry} Network Expanding`,
      `Your ${fastestGrowing.industry} contacts are growing. Consider deepening these connections.`,
      'low',
      false
    ));
  }
  
  return insights;
}

/**
 * Generate network opportunity insights
 */
function generateNetworkInsights(contacts: ContactInfo[]): Insight[] {
  const insights: Insight[] = [];
  
  // Discover relationships first
  discoverRelationships(contacts);
  
  // Find contacts with many connections (key connectors)
  const connectionCounts = new Map<string, number>();
  for (const contact of contacts) {
    const rels = getContactRelationships(contact.id);
    connectionCounts.set(contact.id, rels.length);
  }
  
  const avgConnections = [...connectionCounts.values()].reduce((a, b) => a + b, 0) / contacts.length;
  const wellConnected = contacts.filter(c => (connectionCounts.get(c.id) || 0) > avgConnections * 2);
  
  if (wellConnected.length > 0) {
    const topConnector = wellConnected.sort((a, b) => 
      (connectionCounts.get(b.id) || 0) - (connectionCounts.get(a.id) || 0)
    )[0];
    
    insights.push(createInsight(
      'network_opportunity',
      'Key Network Connector',
      `${topConnector.name} is highly connected in your network. They could introduce you to others.`,
      'medium',
      true,
      {
        label: 'View Profile',
        type: 'review',
        payload: { contactId: topConnector.id }
      }
    ));
  }
  
  // Find isolated contacts that could benefit from connections
  const isolated = contacts.filter(c => (connectionCounts.get(c.id) || 0) === 0);
  if (isolated.length > contacts.length * 0.5 && contacts.length >= 10) {
    insights.push(createInsight(
      'network_opportunity',
      'Discover Hidden Connections',
      `${isolated.length} contacts aren't linked to anyone. There might be connections to discover.`,
      'low',
      true,
      {
        label: 'Find Connections',
        type: 'review',
        payload: { type: 'discover_relationships' }
      }
    ));
  }
  
  return insights;
}

/**
 * Generate engagement insights
 */
function generateEngagementInsights(contacts: ContactInfo[]): Insight[] {
  const insights: Insight[] = [];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  // Recently added contacts that might need follow-up
  const recentUnfollowed = contacts.filter(c => {
    const tags = getContactTags(c.id);
    return c.createdAt > thirtyDaysAgo && 
           !tags.includes('followed_up') && 
           !tags.includes('contacted');
  });
  
  if (recentUnfollowed.length > 0) {
    insights.push(createInsight(
      'engagement_needed',
      'New Contacts Need Follow-up',
      `${recentUnfollowed.length} contacts added in the last 30 days haven't been followed up.`,
      'medium',
      true,
      {
        label: 'View List',
        type: 'follow_up',
        payload: { contactIds: recentUnfollowed.map(c => c.id) }
      }
    ));
  }
  
  // VIP contacts without recent engagement
  const vipContacts = contacts.filter(c => {
    const tags = getContactTags(c.id);
    return tags.includes('VIP') || tags.includes('Decision Maker');
  });
  
  if (vipContacts.length > 0) {
    insights.push(createInsight(
      'engagement_needed',
      'VIP Contacts Identified',
      `You have ${vipContacts.length} VIP or Decision Maker contacts. Keep them engaged!`,
      'high',
      true,
      {
        label: 'View VIPs',
        type: 'review',
        payload: { tag: 'VIP' }
      }
    ));
  }
  
  return insights;
}

/**
 * Generate milestone insights
 */
function generateMilestoneInsights(contacts: ContactInfo[]): Insight[] {
  const insights: Insight[] = [];
  
  // Contact count milestones
  const milestones = [10, 25, 50, 100, 250, 500, 1000];
  for (const milestone of milestones) {
    if (contacts.length >= milestone && contacts.length < milestone * 1.1) {
      insights.push(createInsight(
        'milestone',
        `${milestone} Contacts Milestone!`,
        `Congratulations! Your network has grown to ${contacts.length} contacts.`,
        'low',
        false,
        undefined,
        { expiresIn: 7 * 24 * 60 * 60 * 1000 } // Expires in a week
      ));
      break;
    }
  }
  
  // Industry diversity milestone
  const industries = new Set(contacts.map(c => c.industry).filter(Boolean));
  if (industries.size >= 10) {
    insights.push(createInsight(
      'milestone',
      'Diverse Network Achievement',
      `Your contacts span ${industries.size} different industries. Great network diversity!`,
      'low',
      false,
      undefined,
      { expiresIn: 30 * 24 * 60 * 60 * 1000 }
    ));
  }
  
  return insights;
}

// ==================== DATA QUALITY ANALYSIS ====================

/**
 * Analyze data quality of contacts
 */
export function analyzeDataQuality(contacts: ContactInfo[]): DataQualityReport {
  if (contacts.length === 0) {
    return {
      overallScore: 100,
      completeness: 100,
      accuracy: 100,
      freshness: 100,
      issues: []
    };
  }
  
  const issues: DataQualityIssue[] = [];
  
  // Calculate completeness
  const fields = ['name', 'firmName', 'jobTitle', 'email', 'phone', 'industry'] as const;
  let totalFields = 0;
  let filledFields = 0;
  
  for (const contact of contacts) {
    for (const field of fields) {
      totalFields++;
      if (contact[field] && contact[field].trim()) {
        filledFields++;
      }
    }
  }
  
  const completeness = Math.round((filledFields / totalFields) * 100);
  
  // Find specific issues
  const missingEmail = contacts.filter(c => !c.email);
  if (missingEmail.length > 0) {
    issues.push({
      field: 'email',
      count: missingEmail.length,
      severity: missingEmail.length > contacts.length * 0.5 ? 'high' : 'medium',
      suggestion: 'Add email addresses to improve communication capability'
    });
  }
  
  const missingPhone = contacts.filter(c => !c.phone);
  if (missingPhone.length > 0) {
    issues.push({
      field: 'phone',
      count: missingPhone.length,
      severity: 'low',
      suggestion: 'Consider adding phone numbers for alternative contact method'
    });
  }
  
  const missingCompany = contacts.filter(c => !c.firmName);
  if (missingCompany.length > 0) {
    issues.push({
      field: 'firmName',
      count: missingCompany.length,
      severity: missingCompany.length > contacts.length * 0.3 ? 'medium' : 'low',
      suggestion: 'Add company names to better organize contacts'
    });
  }
  
  const missingIndustry = contacts.filter(c => !c.industry || c.industry === 'Unclassified');
  if (missingIndustry.length > 0) {
    issues.push({
      field: 'industry',
      count: missingIndustry.length,
      severity: 'low',
      suggestion: 'Classify contacts by industry for better filtering'
    });
  }
  
  // Calculate accuracy (basic heuristics)
  let accuracyScore = 100;
  
  // Check for potential issues
  const possibleDuplicates = findPossibleDuplicateCount(contacts);
  if (possibleDuplicates > 0) {
    accuracyScore -= Math.min(30, possibleDuplicates * 2);
    issues.push({
      field: 'duplicates',
      count: possibleDuplicates,
      severity: possibleDuplicates > 10 ? 'high' : 'medium',
      suggestion: 'Review and merge potential duplicate contacts'
    });
  }
  
  // Calculate freshness
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentContacts = contacts.filter(c => c.createdAt > thirtyDaysAgo);
  const freshness = Math.min(100, 50 + Math.round((recentContacts.length / contacts.length) * 50));
  
  // Overall score
  const overallScore = Math.round(
    (completeness * 0.4) + (accuracyScore * 0.4) + (freshness * 0.2)
  );
  
  return {
    overallScore,
    completeness,
    accuracy: accuracyScore,
    freshness,
    issues
  };
}

// ==================== TREND ANALYSIS ====================

/**
 * Get contacts added over time periods
 */
export function getContactTrends(
  contacts: ContactInfo[],
  periods: number = 6
): TrendData[] {
  const trends: TrendData[] = [];
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < periods; i++) {
    const periodEnd = now - (i * weekMs);
    const periodStart = periodEnd - weekMs;
    
    const count = contacts.filter(c => 
      c.createdAt >= periodStart && c.createdAt < periodEnd
    ).length;
    
    const prevCount = contacts.filter(c =>
      c.createdAt >= periodStart - weekMs && c.createdAt < periodStart
    ).length;
    
    const change = count - prevCount;
    const changePercent = prevCount > 0 ? Math.round((change / prevCount) * 100) : 0;
    
    trends.push({
      period: `Week ${periods - i}`,
      count,
      change,
      changePercent
    });
  }
  
  return trends.reverse();
}

/**
 * Get industry growth analysis
 */
export function getIndustryGrowth(contacts: ContactInfo[]): IndustryBreakdown[] {
  const industryContacts: Record<string, ContactInfo[]> = {};
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  for (const contact of contacts) {
    const industry = contact.industry || 'Unclassified';
    if (!industryContacts[industry]) industryContacts[industry] = [];
    industryContacts[industry].push(contact);
  }
  
  return Object.entries(industryContacts).map(([industry, industryList]) => {
    const recentCount = industryList.filter(c => c.createdAt > thirtyDaysAgo).length;
    const olderCount = industryList.length - recentCount;
    
    let trend: 'growing' | 'stable' | 'declining' = 'stable';
    if (recentCount > olderCount * 0.5 && recentCount >= 2) {
      trend = 'growing';
    } else if (recentCount === 0 && olderCount >= 5) {
      trend = 'declining';
    }
    
    return {
      industry,
      count: industryList.length,
      percentage: Math.round((industryList.length / contacts.length) * 100),
      trend
    };
  }).sort((a, b) => b.count - a.count);
}

// ==================== UTILITIES ====================

function createInsight(
  type: InsightType,
  title: string,
  description: string,
  priority: Insight['priority'],
  actionable: boolean,
  action?: InsightAction,
  options?: { expiresIn?: number }
): Insight {
  return {
    id: `insight_${crypto.randomUUID()}`,
    type,
    title,
    description,
    priority,
    actionable,
    action,
    createdAt: Date.now(),
    expiresAt: options?.expiresIn ? Date.now() + options.expiresIn : undefined
  };
}

function findPossibleDuplicateCount(contacts: ContactInfo[]): number {
  let duplicates = 0;
  const seen = new Map<string, boolean>();
  
  for (const contact of contacts) {
    // Check by email
    if (contact.email) {
      const emailKey = contact.email.toLowerCase();
      if (seen.has(emailKey)) duplicates++;
      seen.set(emailKey, true);
    }
    
    // Check by name + company
    if (contact.name && contact.firmName) {
      const nameKey = `${contact.name.toLowerCase()}_${contact.firmName.toLowerCase()}`;
      if (seen.has(nameKey)) duplicates++;
      seen.set(nameKey, true);
    }
  }
  
  return duplicates;
}
