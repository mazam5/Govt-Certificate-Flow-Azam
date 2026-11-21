import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Persona } from '../types';
import { ShieldCheck, Search, AlertCircle, CheckCircle2, Ban, Award, Calendar, Building, BookOpen, User, Download, Sparkles, X } from 'lucide-react';

interface Props {
  activePersona?: Persona | null;
  initialCertNumber?: string;
}

interface PresetCert {
  number: string;
  label: string;
  description: string;
  type: 'valid' | 'revoked' | 'invalid' | 'malformed';
}

const PRESET_CERTIFICATES: PresetCert[] = [
  {
    number: 'PSM-2026-DEMO01',
    label: 'Valid (Solar Tech)',
    description: 'Issued to Rohan Sharma • Grade A (Click to test valid credential)',
    type: 'valid',
  },
  {
    number: 'PSM-2026-DEMO02',
    label: 'Valid (Healthcare GDA)',
    description: 'Issued to Priya Patel • Grade A+ (Click to test valid credential)',
    type: 'valid',
  },
  {
    number: 'PSM-2026-REVOKED',
    label: 'Revoked Credential',
    description: 'Issued to Aaditya Rao • Revoked by State Office (Audit action)',
    type: 'revoked',
  },
  {
    number: 'PSM-2026-NOTFOUND',
    label: 'Unissued / Not Found',
    description: 'Simulates non-existent 404 credential lookup in registry',
    type: 'invalid',
  },
  {
    number: 'INVALID-FORMAT-999',
    label: 'Malformed Identifier',
    description: 'Simulates unrecognized format query rejection',
    type: 'malformed',
  },
];

export const PublicVerificationView: React.FC<Props> = ({ activePersona, initialCertNumber }) => {
  const [certNumber, setCertNumber] = useState(initialCertNumber || '');
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revocation state for Farah (State Office)
  const [isRevoking, setIsRevoking] = useState(false);
  const [revocationReason, setRevocationReason] = useState('Audit verification discrepancy identified during post-issuance review.');

  const handleVerify = async (certToSearch?: string) => {
    const target = (certToSearch || certNumber).trim();
    if (!target) {
      setError('Please enter a certificate number to verify.');
      return;
    }

    setIsSearching(true);
    setError(null);
    setVerificationResult(null);

    try {
      const res = await api.verifyCertificate(target);
      if (res.success && res.data) {
        setVerificationResult(res.data);
      } else {
        setError(res.error || 'Certificate not found. This credential may be invalid or not yet issued.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification lookup failed.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (initialCertNumber) {
      setCertNumber(initialCertNumber);
      handleVerify(initialCertNumber);
    }
  }, [initialCertNumber]);

  const handleRevoke = async () => {
    if (!verificationResult) return;
    if (!revocationReason || revocationReason.trim().length < 5) {
      alert('A valid reason is required to revoke a certificate (min 5 chars).');
      return;
    }

    if (!confirm(`Are you sure you want to REVOKE certificate ${verificationResult.certNumber}? This action takes effect immediately across all verification portals.`)) {
      return;
    }

    setIsRevoking(true);
    try {
      await api.revokeCertificate(verificationResult.certNumber, revocationReason, activePersona);
      alert(`Certificate ${verificationResult.certNumber} has been revoked.`);
      await handleVerify(verificationResult.certNumber);
    } catch (err: any) {
      alert(`Failed to revoke certificate: ${err.message}`);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Header Banner */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl text-indigo-700 mb-3 shadow-xs">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Pragati Skills Mission Credential Verification
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-xl mx-auto">
          Official unauthenticated public registry. Verify the authenticity of vocational skill certificates issued under the Government of India skill framework.
        </p>
      </div>

      {/* Search Input Box */}
      <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-200 mb-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerify();
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value.toUpperCase())}
              placeholder="e.g. PSM-2026-DEMO01"
              className="w-full pl-11 pr-10 py-3 text-sm font-mono uppercase font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            {certNumber && (
              <button
                type="button"
                onClick={() => {
                  setCertNumber('');
                  setVerificationResult(null);
                  setError(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Credential</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Predefined Certificate Buttons */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              Predefined Test Certificates:
            </span>
            <span className="text-[11px] text-slate-500">
              Click any button to populate and verify instantly
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PRESET_CERTIFICATES.map((preset) => {
              const isSelected = certNumber === preset.number;
              const typeColor =
                preset.type === 'valid'
                  ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-900'
                  : preset.type === 'revoked'
                  ? 'border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 text-amber-900'
                  : preset.type === 'invalid'
                  ? 'border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 text-rose-900'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800';

              const dotColor =
                preset.type === 'valid'
                  ? 'bg-emerald-500 ring-emerald-200'
                  : preset.type === 'revoked'
                  ? 'bg-amber-500 ring-amber-200'
                  : preset.type === 'invalid'
                  ? 'bg-rose-500 ring-rose-200'
                  : 'bg-slate-400 ring-slate-200';

              return (
                <button
                  key={preset.number}
                  type="button"
                  onClick={() => {
                    setCertNumber(preset.number);
                    handleVerify(preset.number);
                  }}
                  className={`text-left p-2.5 rounded-xl border transition flex items-start space-x-2.5 cursor-pointer shadow-2xs ${typeColor} ${
                    isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 border-transparent' : ''
                  }`}
                >
                  <span className={`w-2.5 h-2.5 mt-1 rounded-full ring-2 shrink-0 ${dotColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs">{preset.number}</span>
                      <span className="text-[10px] font-semibold uppercase opacity-75">
                        {preset.type === 'valid'
                          ? 'Valid'
                          : preset.type === 'revoked'
                          ? 'Revoked'
                          : preset.type === 'invalid'
                          ? 'Not Found'
                          : 'Malformed'}
                      </span>
                    </div>
                    <p className="text-[11px] truncate opacity-85 mt-0.5">{preset.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center text-rose-800 mb-6">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
          <h4 className="font-bold text-sm">Credential Verification Failed</h4>
          <p className="text-xs text-rose-700 mt-1">{error}</p>
        </div>
      )}

      {/* Verification Result Card */}
      {verificationResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Status Header */}
          <div
            className={`px-6 py-4 flex items-center justify-between text-white ${
              verificationResult.status === 'VALID'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700'
                : 'bg-gradient-to-r from-rose-700 to-red-800'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {verificationResult.status === 'VALID' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-200" />
              ) : (
                <Ban className="w-6 h-6 text-rose-200" />
              )}
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold opacity-90">
                  Registry Status
                </span>
                <h3 className="text-lg font-black tracking-wide">
                  {verificationResult.status === 'VALID'
                    ? 'OFFICIALLY VERIFIED & AUTHENTIC'
                    : 'CERTIFICATE REVOKED'}
                </h3>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono bg-white/20 px-2.5 py-1 rounded-md">
                {verificationResult.certNumber}
              </span>
            </div>
          </div>

          {/* Revocation Warning Banner if Revoked */}
          {verificationResult.status === 'REVOKED' && (
            <div className="bg-rose-50 border-b border-rose-200 px-6 py-3.5 text-xs text-rose-900">
              <p className="font-bold flex items-center">
                <AlertCircle className="w-4 h-4 mr-1 text-rose-600" />
                This certificate was officially revoked on{' '}
                {verificationResult.revokedAt
                  ? new Date(verificationResult.revokedAt).toLocaleString()
                  : 'N/A'}
              </p>
              {verificationResult.revocationReason && (
                <p className="mt-1 text-rose-800 bg-rose-100/70 p-2 rounded-lg font-medium">
                  Revocation Reason: {verificationResult.revocationReason}
                </p>
              )}
            </div>
          )}

          {/* Sanitized Public Certificate Data Grid */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50">
            <div className="flex items-start space-x-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <User className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-500">Candidate Name</span>
                <p className="text-sm font-bold text-slate-900">{verificationResult.candidateName}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <BookOpen className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-500">Certified Course / Trade</span>
                <p className="text-sm font-bold text-slate-900">{verificationResult.courseName}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <Building className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-500">Training Centre</span>
                <p className="text-sm font-bold text-slate-900">{verificationResult.centreName}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <Calendar className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <span className="text-[11px] font-semibold uppercase text-slate-500">Issue Date</span>
                <p className="text-sm font-bold text-slate-900">
                  {new Date(verificationResult.issueDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Privacy Guarantee Note */}
          <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span>🔒 Zero PII Disclosure: Personal contact numbers and national identifiers are strictly protected.</span>
            {verificationResult.status === 'VALID' ? (
              <a
                href={`/api/certificates/${verificationResult.certNumber}/download`}
                target="_blank"
                rel="noreferrer"
                download={`${verificationResult.certNumber}.pdf`}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-xs transition"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Download Certificate PDF
              </a>
            ) : (
              <span className="text-rose-600 font-semibold text-xs flex items-center">
                <Ban className="w-3.5 h-3.5 mr-1" />
                PDF Download Disabled (Revoked)
              </span>
            )}
          </div>

          {/* State Office Revocation Control (Farah only) */}
          {activePersona?.role === 'STATE_OFFICE' && verificationResult.status === 'VALID' && (
            <div className="p-6 bg-amber-50/50 border-t border-amber-200">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-2 flex items-center">
                <Award className="w-4 h-4 mr-1 text-amber-600" />
                State Directorate Authority Action (Farah)
              </h4>
              <div className="space-y-3">
                <input
                  type="text"
                  value={revocationReason}
                  onChange={(e) => setRevocationReason(e.target.value)}
                  placeholder="Mandatory revocation reason"
                  className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white"
                />
                <button
                  onClick={handleRevoke}
                  disabled={isRevoking}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center space-x-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{isRevoking ? 'Revoking Credential...' : 'Revoke Certificate Immediately'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
