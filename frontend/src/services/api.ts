import type { Batch, Persona } from '../types';
import { useAuthStore } from '../store/authStore';

export const PERSONAS: Persona[] = [
  {
    id: 'user-anika-001',
    name: 'Anika',
    key: 'anika',
    email: 'anika@pragati.gov.in',
    role: 'TRAINING_CENTRE',
    district: 'District A',
    description: 'Training Centre Lead (Upload, edit & submit candidate batches)',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: 'user-dev-001',
    name: 'Dev',
    key: 'dev',
    email: 'dev@district-a.gov.in',
    role: 'DISTRICT_OFFICER',
    district: 'District A',
    description: 'District Officer (Signatory 1 - District A approval)',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    id: 'user-meera-001',
    name: 'Meera',
    key: 'meera',
    email: 'meera@district-a.gov.in',
    role: 'DISTRICT_OFFICER',
    district: 'District A',
    description: 'District Officer (Signatory 2 - District A approval)',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    id: 'user-kabir-001',
    name: 'Kabir',
    key: 'kabir',
    email: 'kabir@district-a.gov.in',
    role: 'DISTRICT_OFFICER',
    district: 'District A',
    description: 'District Officer (Signatory 3 - District A approval)',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    id: 'user-neha-001',
    name: 'Neha',
    key: 'neha',
    email: 'neha@quality.pragati.gov.in',
    role: 'QUALITY_TEAM',
    district: null,
    description: 'Quality Team (Mandatory audit for large batches >= 50 candidates)',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    id: 'user-farah-001',
    name: 'Farah',
    key: 'farah',
    email: 'farah@state.pragati.gov.in',
    role: 'STATE_OFFICE',
    district: null,
    description: 'State Director (Final sanction, SLA escalation view, Revocation)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
];

const API_BASE = '/api';

export function getHeaders(): HeadersInit {
  const token = useAuthStore.getState().jwtToken || localStorage.getItem('certiflow_jwt_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export const api = {
  // Authentication Endpoints
  async login(email: string, password?: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: password || 'pragati2026' }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Login failed');
    return json.data;
  },

  async demoSwitch(personaKey: string) {
    const res = await fetch(`${API_BASE}/auth/demo-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: personaKey.toLowerCase() }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to switch demo persona');
    return json.data;
  },

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch user session');
    return json.data;
  },

  // Batch Management
  async getBatches(_activePersona?: Persona | null): Promise<Batch[]> {
    const res = await fetch(`${API_BASE}/batches`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    return json.data || [];
  },

  async getBatchById(id: string, _activePersona?: Persona | null): Promise<Batch> {
    const res = await fetch(`${API_BASE}/batches/${id}`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch batch');
    return json.data;
  },

  async uploadBatch(file: File, courseName: string, _activePersona?: Persona | null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseName', courseName);

    const token = useAuthStore.getState().jwtToken || localStorage.getItem('certiflow_jwt_token');
    const headers: Record<string, string> = {};
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
      const err: any = new Error(json.error || 'Upload failed');
      err.errors = json.errors || [];
      err.errorCount = json.errorCount || (json.errors ? json.errors.length : 0);
      throw err;
    }
    return json.data;
  },

  async submitBatch(batchId: string, _activePersona?: Persona | null) {
    const res = await fetch(`${API_BASE}/batches/${batchId}/submit`, {
      method: 'POST',
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Submission failed');
    return json.data;
  },

  async approveBatch(batchId: string, comments?: string, _activePersona?: Persona | null) {
    const res = await fetch(`${API_BASE}/batches/${batchId}/approve`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ comments }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Approval failed');
    return json.data;
  },

  async requestChanges(batchId: string, reason: string, _activePersona?: Persona | null) {
    const res = await fetch(`${API_BASE}/batches/${batchId}/request-changes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to request changes');
    return json.data;
  },

  async resubmitBatch(batchId: string, file: File | null, _activePersona?: Persona | null) {
    const formData = new FormData();
    if (file) formData.append('file', file);

    const token = useAuthStore.getState().jwtToken || localStorage.getItem('certiflow_jwt_token');
    const headers: Record<string, string> = {};
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

  // Public Verification (Zero Authentication Required)
  async verifyCertificate(certNumber: string) {
    const res = await fetch(`${API_BASE}/verify/${certNumber.trim().toUpperCase()}`);
    const json = await res.json();
    return json;
  },

  // State Office Revocation
  async revokeCertificate(certNumber: string, reason: string, _activePersona?: Persona | null) {
    const res = await fetch(`${API_BASE}/certificates/${certNumber}/revoke`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Revocation failed');
    return json.data;
  },
};
