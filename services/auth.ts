
import { AccessStatus } from "../types";

export function getAccessStatus(email: string, ownerEmail: string): AccessStatus {
  if (email === ownerEmail) return 'approved';
  if (email === 'local@sandbox') return 'approved';
  
  const approvals = JSON.parse(localStorage.getItem('kksmartscan_approvals') || '{}');
  return approvals[email] || 'pending';
}

export function saveUserApproval(email: string, status: AccessStatus) {
  const approvals = JSON.parse(localStorage.getItem('kksmartscan_approvals') || '{}');
  approvals[email] = status;
  localStorage.setItem('kksmartscan_approvals', JSON.stringify(approvals));
}

export function getAllUsers(): Record<string, AccessStatus> {
  return JSON.parse(localStorage.getItem('kksmartscan_approvals') || '{}');
}
