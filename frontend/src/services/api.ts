import type { Batch, Persona } from '../types';
import { useAuthStore } from '../store/authStore';

export const PERSONAS: Persona[] = [
  {
    id: 'user-anika-001',
    name: 'Anika',
    role: 'TRAINING_CENTRE',
    district: 'District A',
    description: 'Training Centre Lead (Upload, edit & submit candidate batches)',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: 'user-dev-001',
    name: 'Dev',
    role: 'DISTRICT_OFFICER',
    district: 'District A',
    description: 'District Officer (Signatory 1 - District A approval)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    id: 'user-meera-001',
    name: 'Meera',
    role: 'DISTRICT_OFFICER',
    district: 'District A',
    description: 'District Officer (Signatory 2 - District A approval)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    id: 'user-kabir-001',
    name: 'Kabir',
    role: 'DISTRICT_OFFICER',
    district: 'District A',
    description: 'District Officer (Signatory 3 - District A approval)',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    id: 'user-neha-001',
    name: 'Neha',
    role: 'QUALITY_TEAM',
    district: null,
    description: 'Quality Team (Mandatory audit for large batches >= 50 candidates)',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    id: 'user-farah-001',
    name: 'Farah',
    role: 'STATE_OFFICE',
    district: null,
    description: 'State Director (Final sanction, SLA escalation view, Revocation)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    id: 'public-verifier',
    name: 'Public / Employer',
    role: 'PUBLIC',
    district: null,
    description: 'Unauthenticated Public Verification Portal (Zero PII leak)',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
  },
];

const API_BASE = '/api';

export function getHeaders(activePersona: Persona): HeadersInit {
  const token = useAuthStore.getState().jwtToken || localStorage.getItem('certiflow_jwt_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': activePersona.id,
    'x-persona': activePersona.name.toLowerCase(),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export const api = {
  async getBatches(activePersona: Persona): Promise<Batch[]> {
    const res = await fetch(`${API_BASE}/batches`, {
      headers: getHeaders(activePersona),
    });
    const json = await res.json();
    return json.data || [];
  },

  async getBatchById(id: string, activePersona: Persona): Promise<Batch> {
    const res = await fetch(`${API_BASE}/batches/${id}`, {
      headers: getHeaders(activePersona),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch batch');
    return json.data;
  },

  async uploadBatch(file: File, courseName: string, activePersona: Persona) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseName', courseName);

    const token = useAuthStore.getState().jwtToken || localStorage.getItem('certiflow_jwt_token');
    const headers: Record<string, string> = {
      'x-user-id': activePersona.id,
      'x-persona': activePersona.name.toLowerCase(),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/batches/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) {
      const error: any = new Error(json.error || 'Upload failed');
      error.errors = json.errors;
      error.errorCount = json.errorCount;
      throw error;
    }
    return json.data;
  },

  async submitBatch(batchId: string, activePersona: Persona) {
    const res = await fetch(`${API_BASE}/batches/${batchId}/submit`, {
      method: 'POST',
      headers: getHeaders(activePersona),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Submission failed');
    return json.data;
  },

  async approveBatch(batchId: string, comments: string, activePersona: Persona) {
    const res = await fetch(`${API_BASE}/batches/${batchId}/approve`, {
      method: 'POST',
      headers: getHeaders(activePersona),
      body: JSON.stringify({ comments }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Approval failed');
    return json.data;
  },

  async requestChanges(batchId: string, reason: string, activePersona: Persona) {
    const res = await fetch(`${API_BASE}/batches/${batchId}/request-changes`, {
      method: 'POST',
      headers: getHeaders(activePersona),
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to request changes');
    return json.data;
  },

  async resubmitBatch(batchId: string, file: File | null, activePersona: Persona) {
    const formData = new FormData();
    if (file) formData.append('file', file);

    const token = useAuthStore.getState().jwtToken || localStorage.getItem('certiflow_jwt_token');
    const headers: Record<string, string> = {
      'x-user-id': activePersona.id,
      'x-persona': activePersona.name.toLowerCase(),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/batches/${batchId}/resubmit`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Resubmission failed');
    return json.data;
  },

  async verifyCertificate(certNumber: string) {
    const res = await fetch(`${API_BASE}/verify/${certNumber.trim().toUpperCase()}`);
    const json = await res.json();
    return json;
  },

  async revokeCertificate(certNumber: string, reason: string, activePersona: Persona) {
    const res = await fetch(`${API_BASE}/certificates/${certNumber}/revoke`, {
      method: 'POST',
      headers: getHeaders(activePersona),
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Revocation failed');
    return json.data;
  },
};
