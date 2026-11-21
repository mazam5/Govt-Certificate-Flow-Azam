import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { useAuthStore } from './store/authStore';
import type { Persona } from './types';
import { api } from './services/api';
import { PersonaSwitcher } from './components/PersonaSwitcher';
import { BatchUploadModal } from './components/BatchUploadModal';
import { BatchDetailView } from './components/BatchDetailView';
import { PublicVerificationView } from './components/PublicVerificationView';
import {
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Building,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';

// Wrapper for Direct /verify/:certNumber route
const PublicVerifyRoute: React.FC = () => {
  const { certNumber } = useParams<{ certNumber?: string }>();
  const activePersona = useAuthStore((s) => s.activePersona);
  return <PublicVerificationView activePersona={activePersona} initialCertNumber={certNumber} />;
};

// Wrapper for /batch/:id route
const BatchDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const activePersona = useAuthStore((s) => s.activePersona);
  const qClient = useQueryClient();

  const { data: batch, isLoading, refetch } = useQuery({
    queryKey: ['batch', id],
    queryFn: () => (id ? api.getBatchById(id, activePersona) : Promise.reject('No ID')),
    enabled: !!id,
  });

  if (isLoading || !batch) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-slate-500">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
        Loading batch details...
      </div>
    );
  }

  return (
    <BatchDetailView
      batch={batch}
      activePersona={activePersona}
      onBack={() => navigate(-1)}
      onRefresh={() => {
        refetch();
        qClient.invalidateQueries({ queryKey: ['batches'] });
      }}
      onOpenVerify={(certNo) => navigate(`/verify/${certNo}`)}
    />
  );
};

// Main Workspace Component with TanStack Query
const WorkspaceDashboard: React.FC<{ roleFilter?: string }> = ({ roleFilter: _roleFilter }) => {
  const navigate = useNavigate();
  const qClient = useQueryClient();
  const activePersona = useAuthStore((s) => s.activePersona);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const { data: batches = [], isLoading, refetch } = useQuery({
    queryKey: ['batches', activePersona.id],
    queryFn: () => api.getBatches(activePersona),
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

                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1 mb-1">
                    {batch.courseName}
                  </h4>

                  <div className="text-xs text-slate-500 space-y-1 mb-4">
                    <div className="flex items-center">
                      <Building className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      <span>{batch.centre?.name || 'Pragati Centre'}</span>
                    </div>
                    <div>{batch.totalCandidates} Candidates Enrolled</div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    {batch.status === 'DRAFT' && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                        DRAFT
                      </span>
                    )}
                    {batch.status === 'SUBMITTED' && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                        DISTRICT REVIEW ({districtApprovals.length}/2)
                      </span>
                    )}
                    {batch.status === 'DISTRICT_APPROVED' && (
                      <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px]">
                        DISTRICT APPROVED
                      </span>
                    )}
                    {batch.status === 'QUALITY_APPROVED' && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px]">
                        QUALITY APPROVED
                      </span>
                    )}
                    {batch.status === 'STATE_APPROVED' && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        ISSUED
                      </span>
                    )}
                    {batch.status === 'CHANGES_REQUESTED' && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                        CHANGES REQUESTED
                      </span>
                    )}
                    {batch.status === 'ESCALATED' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-[10px]">
                        ⚠️ SLA ESCALATED
                      </span>
                    )}
                  </div>

                  <span className="text-indigo-600 font-semibold text-[11px]">
                    View Details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Accessible Radix Upload Modal */}
      <BatchUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => {
          refetch();
          qClient.invalidateQueries({ queryKey: ['batches'] });
        }}
        activePersona={activePersona}
      />
    </div>
  );
};

// Main Layout Component
const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const qClient = useQueryClient();
  const { activePersona, setPersona } = useAuthStore();
  const [liveAlerts, setLiveAlerts] = useState<string[]>([]);
  const [deliveryProgress, setDeliveryProgress] = useState<{
    deliveredCount: number;
    totalCandidates: number;
    percentage: number;
  } | null>(null);

  // Initialize signed JWT on load
  useEffect(() => {
    setPersona(activePersona);
  }, []);

  // SSE Stream Listener
  useEffect(() => {
    const sse = new EventSource('/api/events/stream');

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
  }, [qClient]);

  // Navigate when persona changes
  const handlePersonaSelect = async (persona: Persona) => {
    await setPersona(persona);
    if (persona.role === 'PUBLIC') {
      navigate('/verify');
    } else if (persona.role === 'TRAINING_CENTRE') {
      navigate('/centre');
    } else if (persona.role === 'DISTRICT_OFFICER') {
      navigate('/district');
    } else if (persona.role === 'QUALITY_TEAM') {
      navigate('/quality');
    } else if (persona.role === 'STATE_OFFICE') {
      navigate('/state');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Persona Switcher Top Bar */}
      <PersonaSwitcher
        activePersona={activePersona}
        onSelectPersona={handlePersonaSelect}
      />

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
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 mb-6 border-b border-slate-200 pb-3">
          <button
            onClick={() => {
              if (activePersona.role === 'TRAINING_CENTRE') navigate('/centre');
              else if (activePersona.role === 'DISTRICT_OFFICER') navigate('/district');
              else if (activePersona.role === 'QUALITY_TEAM') navigate('/quality');
              else if (activePersona.role === 'STATE_OFFICE') navigate('/state');
              else navigate('/centre');
            }}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white shadow-xs"
          >
            Batch Issuance Workflow
          </button>
          <button
            onClick={() => navigate('/verify')}
            className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition flex items-center space-x-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Public Verification Portal</span>
          </button>
        </div>

        {/* Dynamic Route View */}
        <Routes>
          <Route path="/" element={<Navigate to="/centre" replace />} />
          <Route path="/centre" element={<WorkspaceDashboard roleFilter="TRAINING_CENTRE" />} />
          <Route path="/district" element={<WorkspaceDashboard roleFilter="DISTRICT_OFFICER" />} />
          <Route path="/quality" element={<WorkspaceDashboard roleFilter="QUALITY_TEAM" />} />
          <Route path="/state" element={<WorkspaceDashboard roleFilter="STATE_OFFICE" />} />
          <Route path="/batch/:id" element={<BatchDetailRoute />} />
          <Route path="/verify" element={<PublicVerifyRoute />} />
          <Route path="/verify/:certNumber" element={<PublicVerifyRoute />} />
        </Routes>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
