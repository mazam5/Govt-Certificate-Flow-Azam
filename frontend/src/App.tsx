import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { useAuthStore } from './store/authStore';
import { api } from './services/api';
import { PersonaSwitcher } from './components/PersonaSwitcher';
import { BatchUploadModal } from './components/BatchUploadModal';
import { BatchDetailView } from './components/BatchDetailView';
import { PublicVerificationView } from './components/PublicVerificationView';
import { LoginPage } from './components/LoginPage';
import {
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Building,
  Smartphone,
  Lock,
  ArrowRight,
} from 'lucide-react';

// ============================================================================
// Public-by-Default Landing Page (Unauthenticated Entry Point)
// ============================================================================
const PublicLandingPage: React.FC = () => {
  const { certNumber } = useParams<{ certNumber?: string }>();
  const { isAuthenticated, activePersona } = useAuthStore();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Public Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center text-lg shadow-sm group-hover:bg-indigo-500 transition">
              C
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white text-base">CertiFlow</span>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700 rounded-full">
                  Pragati Skills Mission
                </span>
              </div>
              <p className="text-[11px] text-slate-400">National Skilling Certificate Public Registry</p>
            </div>
          </Link>

          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
              >
                <span>Staff Workspace ({activePersona?.name})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Staff / Admin Login</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Public Verification Body */}
      <main className="flex-1 py-6">
        <PublicVerificationView activePersona={activePersona} initialCertNumber={certNumber} />
      </main>

      {/* Public Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        Pragati Skills Mission — CertiFlow • Official Public Verification Registry • Zero-PII Compliance
      </footer>
    </div>
  );
};

// ============================================================================
// Protected Batch Detail View
// ============================================================================
const BatchDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, activePersona } = useAuthStore();
  const qClient = useQueryClient();

  if (!isAuthenticated || !activePersona) {
    return <Navigate to="/login" replace />;
  }

  const { data: batch, isLoading, refetch } = useQuery({
    queryKey: ['batch', id],
    queryFn: () => (id ? api.getBatchById(id) : Promise.reject('No ID')),
    enabled: !!id,
  });

  if (isLoading || !batch) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center py-20 text-xs text-slate-500">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading batch details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <PersonaSwitcher activePersona={activePersona} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <BatchDetailView
          batch={batch}
          activePersona={activePersona}
          onBack={() => navigate('/dashboard')}
          onRefresh={() => {
            refetch();
            qClient.invalidateQueries({ queryKey: ['batches'] });
          }}
          onOpenVerify={(certNo) => navigate(`/verify/${certNo}`)}
        />
      </main>
    </div>
  );
};

// ============================================================================
// Authenticated Staff Workspace Dashboard
// ============================================================================
const WorkspaceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const qClient = useQueryClient();
  const { isAuthenticated, activePersona } = useAuthStore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  if (!isAuthenticated || !activePersona) {
    return <Navigate to="/login" replace />;
  }

  const { data: batches = [], isLoading, refetch } = useQuery({
    queryKey: ['batches', activePersona.id],
    queryFn: () => api.getBatches(),
  });

  const filteredBatches = batches.filter((b) => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      b.batchNumber.toLowerCase().includes(q) ||
      b.courseName.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-300">DRAFT</span>;
      case 'SUBMITTED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">UNDER DISTRICT REVIEW</span>;
      case 'DISTRICT_APPROVED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-teal-100 text-teal-800 border border-teal-300">DISTRICT APPROVED</span>;
      case 'QUALITY_APPROVED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-300">QUALITY VERIFIED</span>;
      case 'STATE_APPROVED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">STATE APPROVED / ISSUED</span>;
      case 'CHANGES_REQUESTED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300">CHANGES REQUESTED</span>;
      case 'ESCALATED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-400 font-extrabold animate-bounce">⚠️ SLA ESCALATED</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Workspace Sub-header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter by batch number, course, or status..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
            title="Refresh Server State"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {activePersona.role === 'TRAINING_CENTRE' && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Batch</span>
            </button>
          )}
        </div>
      </div>

      {/* Batches Table / Grid */}
      {filteredBatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No Batches in Jurisdiction</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {activePersona.role === 'TRAINING_CENTRE'
              ? "Click 'Upload Batch' to submit your candidate roster spreadsheet."
              : 'No candidate batches currently waiting for review in this state.'}
          </p>
          {activePersona.role === 'TRAINING_CENTRE' && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition"
            >
              Upload First Batch
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBatches.map((batch) => {
            const districtApprovals = (batch.approvals || []).filter(
              (a) => a.level === 'DISTRICT' && a.status === 'APPROVED'
            );

            return (
              <div
                key={batch.id}
                onClick={() => navigate(`/batch/${batch.id}`)}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-300 transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {batch.batchNumber}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">v{batch.version}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{batch.courseName}</h4>
                  <div className="flex items-center space-x-1.5 text-xs text-slate-500 mt-1">
                    <Building className="w-3.5 h-3.5" />
                    <span className="truncate">{batch.centre?.name || 'Training Centre'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>{getStatusBadge(batch.status)}</div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-700">
                      {batch.totalCandidates} Candidates
                    </span>
                    {districtApprovals.length > 0 && batch.status === 'SUBMITTED' && (
                      <span className="block text-[10px] text-blue-600 font-medium">
                        {districtApprovals.length}/2 Approvals
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <BatchUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={() => {
            setIsUploadModalOpen(false);
            refetch();
            qClient.invalidateQueries({ queryKey: ['batches'] });
          }}
          activePersona={activePersona}
        />
      )}
    </div>
  );
};

// ============================================================================
// Staff Main Layout (Protected)
// ============================================================================
const StaffLayout: React.FC = () => {
  const qClient = useQueryClient();
  const { isAuthenticated, activePersona, jwtToken } = useAuthStore();
  const [liveAlerts, setLiveAlerts] = useState<string[]>([]);
  const [deliveryProgress, setDeliveryProgress] = useState<{
    deliveredCount: number;
    totalCandidates: number;
    percentage: number;
  } | null>(null);

  // Real-time Server-Sent Events Listener with Authenticated Token
  useEffect(() => {
    if (!isAuthenticated || !jwtToken) return;

    const sse = new EventSource(`/api/events/stream?token=${jwtToken}`);

    sse.addEventListener('BATCH_STATUS_UPDATED', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setLiveAlerts((prev) => [
        `🔄 Batch ${payload.data.batchNumber} transitioned to [${payload.data.status}]`,
        ...prev.slice(0, 4),
      ]);
      qClient.invalidateQueries({ queryKey: ['batches'] });
      qClient.invalidateQueries({ queryKey: ['batch', payload.data.batchId] });
    });

    sse.addEventListener('BATCH_APPROVAL_RECORDED', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setLiveAlerts((prev) => [
        `✍️ Approval recorded for ${payload.data.batchNumber} by ${payload.data.approvedBy}`,
        ...prev.slice(0, 4),
      ]);
      qClient.invalidateQueries({ queryKey: ['batches'] });
      qClient.invalidateQueries({ queryKey: ['batch', payload.data.batchId] });
    });

    sse.addEventListener('SLA_ESCALATED_ALERT', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setLiveAlerts((prev) => [
        `⚠️ SLA ALERT: Batch ${payload.data.batchNumber} breached SLA in [${payload.data.state}]. Escalated!`,
        ...prev.slice(0, 4),
      ]);
      qClient.invalidateQueries({ queryKey: ['batches'] });
    });

    sse.addEventListener('WHATSAPP_DELIVERY_PROGRESS', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setDeliveryProgress({
        deliveredCount: payload.data.deliveredCount,
        totalCandidates: payload.data.totalCandidates,
        percentage: payload.data.percentage,
      });
      qClient.invalidateQueries({ queryKey: ['batch', payload.data.batchId] });
    });

    sse.addEventListener('CERTIFICATE_REVOKED', (e: MessageEvent) => {
      const payload = JSON.parse(e.data);
      setLiveAlerts((prev) => [
        `🚫 Certificate ${payload.data.certNumber} was REVOKED by State Office`,
        ...prev.slice(0, 4),
      ]);
      qClient.invalidateQueries({ queryKey: ['batches'] });
    });

    return () => sse.close();
  }, [isAuthenticated, jwtToken, qClient]);

  if (!isAuthenticated || !activePersona) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Persistent Reviewer Role Switcher Top Bar */}
      <PersonaSwitcher activePersona={activePersona} />

      {/* Live SSE Alert Banner */}
      {liveAlerts.length > 0 && (
        <div className="bg-slate-900 text-indigo-300 px-4 py-2 text-xs border-b border-indigo-900/50 flex items-center justify-between">
          <div className="flex items-center space-x-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-semibold text-white">Live Real-time Bus:</span>
            <span className="truncate">{liveAlerts[0]}</span>
          </div>
          <button
            onClick={() => setLiveAlerts([])}
            className="text-[11px] text-slate-400 hover:text-white shrink-0 ml-4 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* WhatsApp Live Delivery Progress Bar */}
      {deliveryProgress && deliveryProgress.percentage < 100 && (
        <div className="bg-emerald-950 text-emerald-200 px-6 py-2.5 border-b border-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Smartphone className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="font-bold">WhatsApp Dispatch in Progress:</span>
            <span>
              {deliveryProgress.deliveredCount} / {deliveryProgress.totalCandidates} Delivered ({deliveryProgress.percentage}%)
            </span>
          </div>
          <div className="w-48 bg-emerald-900 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-400 h-full transition-all duration-300"
              style={{ width: `${deliveryProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <WorkspaceDashboard />
      </main>
    </div>
  );
};

// ============================================================================
// Root Application
// ============================================================================
export const App: React.FC = () => {
  const { initSession } = useAuthStore();

  useEffect(() => {
    initSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Zone (Default Entry Point) */}
          <Route path="/" element={<PublicLandingPage />} />
          <Route path="/verify" element={<PublicLandingPage />} />
          <Route path="/verify/:certNumber" element={<PublicLandingPage />} />

          {/* Staff Login & 1-Click Reviewer Access */}
          <Route path="/login" element={<LoginPage />} />

          {/* Authenticated Staff Workspace */}
          <Route path="/dashboard" element={<StaffLayout />} />
          <Route path="/batch/:id" element={<BatchDetailRoute />} />

          {/* Backwards-compatible Role Redirection */}
          <Route path="/centre" element={<Navigate to="/dashboard" replace />} />
          <Route path="/district" element={<Navigate to="/dashboard" replace />} />
          <Route path="/quality" element={<Navigate to="/dashboard" replace />} />
          <Route path="/state" element={<Navigate to="/dashboard" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
