import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { PERSONAS } from '../services/api';
import type { Persona } from '../types';
import { UserCheck, Shield, Award, CheckCircle2, AlertTriangle, Building, LogOut } from 'lucide-react';

interface Props {
  activePersona: Persona;
}

export const PersonaSwitcher: React.FC<Props> = ({ activePersona }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { demoSwitch, logout } = useAuthStore();

  const handleSelectPersona = async (p: Persona) => {
    const key = p.key || p.name.toLowerCase();
    await demoSwitch(key);
    await queryClient.invalidateQueries();
  };

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate('/');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'TRAINING_CENTRE':
        return <Building className="w-4 h-4 mr-1 text-emerald-600" />;
      case 'DISTRICT_OFFICER':
        return <UserCheck className="w-4 h-4 mr-1 text-blue-600" />;
      case 'QUALITY_TEAM':
        return <CheckCircle2 className="w-4 h-4 mr-1 text-purple-600" />;
      case 'STATE_OFFICE':
        return <Award className="w-4 h-4 mr-1 text-amber-600" />;
      default:
        return <Shield className="w-4 h-4 mr-1" />;
    }
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Platform Identity */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-lg shadow-sm">
              C
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-tight text-white text-base">CertiFlow</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-indigo-950 text-indigo-300 border border-indigo-700 rounded-full">
                  Pragati Skills Mission
                </span>
              </div>
              <p className="text-xs text-slate-400">Authenticated Staff & Reviewer Workspace</p>
            </div>
          </div>

          {/* Persistent Staff Role Switcher Bar */}
          <div className="flex items-center flex-wrap gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider px-2">
              Role:
            </span>
            {PERSONAS.map((p) => {
              const isSelected = activePersona.id === p.id || activePersona.name === p.name;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPersona(p)}
                  className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/50'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title={p.description}
                >
                  {getRoleIcon(p.role)}
                  <span className="font-semibold">{p.name}</span>
                  {p.district && <span className="ml-1 text-[10px] opacity-75">({p.district})</span>}
                </button>
              );
            })}
          </div>

          {/* Log Out / Public View Action */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:text-white transition shadow-xs"
              title="End session and return to Public Verification Portal"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Log Out / Public View</span>
            </button>
          </div>
        </div>

        {/* Active Persona Banner Details */}
        <div className="mt-2 py-1 px-3 bg-slate-800/60 rounded-md text-xs text-slate-300 flex flex-wrap items-center justify-between border border-slate-700/50 gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-white">Active Identity:</span>
            <span className="text-indigo-400 font-semibold">{activePersona.name}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-300">{activePersona.description}</span>
          </div>
          {activePersona.role === 'DISTRICT_OFFICER' && (
            <span className="text-amber-300 flex items-center font-medium text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Rule: Requires 2 distinct district officer approvals to advance
            </span>
          )}
          {activePersona.role === 'QUALITY_TEAM' && (
            <span className="text-purple-300 flex items-center font-medium text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Rule: Required step ONLY for large batches (≥ 50 candidates)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
