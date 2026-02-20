/**
 * Relationship Mapping Service
 * Discover and visualize connections between contacts
 * Uses company, email domain, and network analysis
 */

import { ContactInfo } from '../types';

// ==================== TYPES ====================

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  strength: number; // 0-1
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  confirmed: boolean;
}

export type RelationshipType =
  | 'colleague' // same company
  | 'industry_peer' // same industry
  | 'introduced_by' // manually linked
  | 'event' // met at same event
  | 'shared_connection' // connected through mutual contact
  | 'business_partner' // business relationship
  | 'custom';

export interface NetworkNode {
  id: string;
  name: string;
  company: string;
  connections: number;
  centrality: number; // how central they are in the network
  cluster?: string;
}

export interface NetworkCluster {
  id: string;
  name: string;
  members: string[];
  commonality: string; // what connects them
}

export interface NetworkAnalysis {
  nodes: NetworkNode[];
  edges: Relationship[];
  clusters: NetworkCluster[];
  keyConnectors: string[]; // most connected people
  isolatedContacts: string[]; // contacts with no connections
}

// ==================== RELATIONSHIP STORAGE ====================

const RELATIONSHIPS_KEY = 'kksmartscan_relationships';

/**
 * Get all relationships
 */
export function getAllRelationships(): Relationship[] {
  try {
    return JSON.parse(localStorage.getItem(RELATIONSHIPS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Save relationships
 */
function saveRelationships(relationships: Relationship[]): void {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(relationships));
}

/**
 * Get relationships for a contact
 */
export function getContactRelationships(contactId: string): Relationship[] {
  return getAllRelationships().filter(
    r => r.sourceId === contactId || r.targetId === contactId
  );
}

// ==================== RELATIONSHIP DISCOVERY ====================

/**
 * Discover relationships between contacts automatically
 */
export function discoverRelationships(contacts: ContactInfo[]): Relationship[] {
  const discovered: Relationship[] = [];
  const existing = getAllRelationships();
  const existingPairs = new Set(
    existing.map(r => [r.sourceId, r.targetId].sort().join(':'))
  );
  
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const relationship = findRelationship(contacts[i], contacts[j]);
      
      if (relationship) {
        const pairKey = [relationship.sourceId, relationship.targetId].sort().join(':');
        
        if (!existingPairs.has(pairKey)) {
          discovered.push(relationship);
          existingPairs.add(pairKey);
        }
      }
    }
  }
  
  // Save discovered relationships
  if (discovered.length > 0) {
    saveRelationships([...existing, ...discovered]);
  }
  
  return discovered;
}

/**
 * Find potential relationship between two contacts
 */
function findRelationship(a: ContactInfo, b: ContactInfo): Relationship | null {
  // Check for colleague (same company)
  if (a.firmName && b.firmName) {
    const firmA = normalizeCompanyName(a.firmName);
    const firmB = normalizeCompanyName(b.firmName);
    
    if (firmA === firmB) {
      return createRelationship(a.id, b.id, 'colleague', 0.95, 
        `Both work at ${a.firmName}`);
    }
    
    // Check for similar company names (abbreviations, etc.)
    if (areSimilarCompanies(firmA, firmB)) {
      return createRelationship(a.id, b.id, 'colleague', 0.7,
        `Possibly same company: ${a.firmName} / ${b.firmName}`);
    }
  }
  
  // Check for same email domain (colleagues)
  if (a.email && b.email) {
    const domainA = a.email.split('@')[1]?.toLowerCase();
    const domainB = b.email.split('@')[1]?.toLowerCase();
    
    if (domainA && domainB && domainA === domainB) {
      // Skip personal email domains
      if (!isPersonalEmailDomain(domainA)) {
        return createRelationship(a.id, b.id, 'colleague', 0.9,
          `Share email domain: @${domainA}`);
      }
    }
  }
  
  // Check for same industry
  if (a.industry && b.industry && a.industry === b.industry) {
    // Only suggest if same non-generic industry
    if (!isGenericIndustry(a.industry)) {
      return createRelationship(a.id, b.id, 'industry_peer', 0.5,
        `Both in ${a.industry} industry`);
    }
  }
  
  return null;
}

/**
 * Create a relationship object
 */
function createRelationship(
  sourceId: string,
  targetId: string,
  type: RelationshipType,
  strength: number,
  reason: string
): Relationship {
  return {
    id: `rel_${crypto.randomUUID()}`,
    sourceId,
    targetId,
    type,
    strength,
    reason,
    createdAt: Date.now(),
    confirmed: false
  };
}

// ==================== MANUAL RELATIONSHIPS ====================

/**
 * Create a manual relationship between contacts
 */
export function createManualRelationship(
  sourceId: string,
  targetId: string,
  type: RelationshipType,
  reason?: string
): Relationship {
  const relationships = getAllRelationships();
  
  // Check if relationship already exists
  const existing = relationships.find(
    r => (r.sourceId === sourceId && r.targetId === targetId) ||
         (r.sourceId === targetId && r.targetId === sourceId)
  );
  
  if (existing) {
    // Update existing relationship
    existing.type = type;
    existing.confirmed = true;
    if (reason) existing.reason = reason;
    saveRelationships(relationships);
    return existing;
  }
  
  // Create new relationship
  const relationship = createRelationship(
    sourceId,
    targetId,
    type,
    1.0, // Manual relationships are high confidence
    reason || `Manually linked as ${type}`
  );
  relationship.confirmed = true;
  
  relationships.push(relationship);
  saveRelationships(relationships);
  
  return relationship;
}

/**
 * Delete a relationship
 */
export function deleteRelationship(relationshipId: string): void {
  const relationships = getAllRelationships();
  saveRelationships(relationships.filter(r => r.id !== relationshipId));
}

/**
 * Confirm a suggested relationship
 */
export function confirmRelationship(relationshipId: string): Relationship | null {
  const relationships = getAllRelationships();
  const relationship = relationships.find(r => r.id === relationshipId);
  
  if (relationship) {
    relationship.confirmed = true;
    relationship.strength = Math.min(1, relationship.strength + 0.2);
    saveRelationships(relationships);
  }
  
  return relationship;
}

/**
 * Dismiss a suggested relationship
 */
export function dismissRelationship(relationshipId: string): void {
  deleteRelationship(relationshipId);
}

// ==================== NETWORK ANALYSIS ====================

/**
 * Analyze the contact network
 */
export function analyzeNetwork(contacts: ContactInfo[]): NetworkAnalysis {
  const relationships = getAllRelationships();
  const nodes: NetworkNode[] = [];
  const clusters: NetworkCluster[] = [];
  
  // Build node map
  const connectionCounts: Record<string, number> = {};
  for (const rel of relationships) {
    connectionCounts[rel.sourceId] = (connectionCounts[rel.sourceId] || 0) + 1;
    connectionCounts[rel.targetId] = (connectionCounts[rel.targetId] || 0) + 1;
  }
  
  const maxConnections = Math.max(...Object.values(connectionCounts), 1);
  
  // Create nodes
  for (const contact of contacts) {
    const connections = connectionCounts[contact.id] || 0;
    nodes.push({
      id: contact.id,
      name: contact.name,
      company: contact.firmName || '',
      connections,
      centrality: connections / maxConnections
    });
  }
  
  // Build company clusters
  const companyContacts: Record<string, string[]> = {};
  for (const contact of contacts) {
    if (contact.firmName) {
      const key = normalizeCompanyName(contact.firmName);
      if (!companyContacts[key]) companyContacts[key] = [];
      companyContacts[key].push(contact.id);
    }
  }
  
  for (const [company, members] of Object.entries(companyContacts)) {
    if (members.length >= 2) {
      clusters.push({
        id: `cluster_${crypto.randomUUID()}`,
        name: company,
        members,
        commonality: `Colleagues at ${company}`
      });
      
      // Update node cluster assignments
      for (const memberId of members) {
        const node = nodes.find(n => n.id === memberId);
        if (node) node.cluster = company;
      }
    }
  }
  
  // Find key connectors (top 10% most connected)
  const sortedByConnections = [...nodes].sort((a, b) => b.connections - a.connections);
  const keyConnectorCount = Math.max(1, Math.ceil(nodes.length * 0.1));
  const keyConnectors = sortedByConnections
    .slice(0, keyConnectorCount)
    .filter(n => n.connections > 0)
    .map(n => n.id);
  
  // Find isolated contacts
  const isolatedContacts = nodes
    .filter(n => n.connections === 0)
    .map(n => n.id);
  
  return {
    nodes,
    edges: relationships,
    clusters,
    keyConnectors,
    isolatedContacts
  };
}

/**
 * Get mutual connections between two contacts
 */
export function getMutualConnections(
  contactIdA: string,
  contactIdB: string
): string[] {
  const relationships = getAllRelationships();
  
  const connectionsA = new Set(
    relationships
      .filter(r => r.sourceId === contactIdA || r.targetId === contactIdA)
      .map(r => r.sourceId === contactIdA ? r.targetId : r.sourceId)
  );
  
  const connectionsB = new Set(
    relationships
      .filter(r => r.sourceId === contactIdB || r.targetId === contactIdB)
      .map(r => r.sourceId === contactIdB ? r.targetId : r.sourceId)
  );
  
  return [...connectionsA].filter(id => connectionsB.has(id));
}

/**
 * Get shortest path between two contacts
 */
export function findConnectionPath(
  contacts: ContactInfo[],
  startId: string,
  endId: string,
  maxDepth: number = 5
): string[] | null {
  const relationships = getAllRelationships();
  
  // Build adjacency list
  const graph: Record<string, string[]> = {};
  for (const contact of contacts) {
    graph[contact.id] = [];
  }
  for (const rel of relationships) {
    if (graph[rel.sourceId]) graph[rel.sourceId].push(rel.targetId);
    if (graph[rel.targetId]) graph[rel.targetId].push(rel.sourceId);
  }
  
  // BFS to find shortest path
  const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }];
  const visited = new Set<string>([startId]);
  
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    
    if (id === endId) return path;
    if (path.length >= maxDepth) continue;
    
    for (const neighbor of graph[id] || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, path: [...path, neighbor] });
      }
    }
  }
  
  return null;
}

/**
 * Get relationship suggestions for a contact
 */
export function getRelationshipSuggestions(
  contact: ContactInfo,
  allContacts: ContactInfo[],
  limit: number = 5
): { contact: ContactInfo; relationship: Relationship }[] {
  const existing = getContactRelationships(contact.id);
  const existingIds = new Set([
    ...existing.map(r => r.sourceId),
    ...existing.map(r => r.targetId)
  ]);
  
  const suggestions: { contact: ContactInfo; relationship: Relationship }[] = [];
  
  for (const other of allContacts) {
    if (other.id === contact.id || existingIds.has(other.id)) continue;
    
    const rel = findRelationship(contact, other);
    if (rel) {
      suggestions.push({ contact: other, relationship: rel });
    }
  }
  
  return suggestions
    .sort((a, b) => b.relationship.strength - a.relationship.strength)
    .slice(0, limit);
}

// ==================== UTILITIES ====================

const PERSONAL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'mail.com'
];

const GENERIC_INDUSTRIES = [
  'Business', 'Services', 'Consulting', 'Other', 'General', 'Unclassified'
];

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|pvt|private|limited)\b\.?/gi, '')
    .replace(/[.,]/g, '')
    .trim();
}

function areSimilarCompanies(a: string, b: string): boolean {
  // Check if one is an abbreviation of the other
  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  
  // If very similar length difference, might be abbreviation
  const abbrevA = aWords.map(w => w[0]).join('').toLowerCase();
  const abbrevB = bWords.map(w => w[0]).join('').toLowerCase();
  
  return abbrevA === b.toLowerCase() || abbrevB === a.toLowerCase();
}

function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.includes(domain.toLowerCase());
}

function isGenericIndustry(industry: string): boolean {
  return GENERIC_INDUSTRIES.some(g => 
    industry.toLowerCase().includes(g.toLowerCase())
  );
}
