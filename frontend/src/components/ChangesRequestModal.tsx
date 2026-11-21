import React, { useState } from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  batchNumber: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export const ChangesRequestModal: React.FC<Props> = ({ isOpen, batchNumber, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 5) {
      setError('A mandatory reason is required (minimum 5 characters).');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to request changes');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-rose-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-5 h-5 text-rose-200" />
            <h3 className="text-base font-bold">Request Changes / Send Back</h3>
          </div>
          <button onClick={onClose} className="text-rose-200 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
            <p className="font-semibold flex items-center mb-1">
              <AlertCircle className="w-4 h-4 mr-1 text-rose-600" />
              Batch: {batchNumber}
            </p>
            <p>
              <strong>Policy Reminder:</strong> Sending back this batch will notify the Training Centre. When the centre resubmits, all prior approvals will be marked <code className="bg-rose-100 px-1 py-0.5 rounded">REVOKED_ON_RESUBMIT</code> so reviewers never sign off on unreviewed data.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Mandatory Reason for Changes
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Discrepancy observed in candidate practical completion records. Please rectify and re-verify attendance."
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition"
            />
          </div>

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? 'Sending Back...' : 'Send Back to Training Centre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
