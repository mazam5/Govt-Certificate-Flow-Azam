import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { PERSONAS } from '../services/api';
import {
  ShieldCheck,
  Building,
  UserCheck,
  CheckCircle2,
  Award,
  ArrowRight,
  Lock,
  Mail,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { login, demoSwitch } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your staff email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const res = await login(email.trim(), password);
    setIsLoading(false);

    if (res.success) {
      await queryClient.invalidateQueries();
      navigate('/dashboard');
    } else {
      setError(res.error || 'Login failed. Please verify credentials.');
    }
  };

  const handleDemoSwitch = async (personaKey: string) => {
    setIsLoading(true);
    setError(null);

    const res = await demoSwitch(personaKey);
    setIsLoading(false);

    if (res.success) {
      await queryClient.invalidateQueries();
      navigate('/dashboard');
    } else {
      setError(res.error || 'Failed to switch to demo persona.');
    }
  };

  const getPersonaIcon = (role: string) => {
    switch (role) {
      case 'TRAINING_CENTRE':
        return <Building className="w-5 h-5 text-emerald-600" />;
      case 'DISTRICT_OFFICER':
        return <UserCheck className="w-5 h-5 text-blue-600" />;
      case 'QUALITY_TEAM':
        return <CheckCircle2 className="w-5 h-5 text-purple-600" />;
      case 'STATE_OFFICE':
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-indigo-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex flex-col justify-between">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center text-lg shadow-md group-hover:bg-indigo-500 transition">
              C
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-base tracking-tight">CertiFlow</span>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700 rounded-full">
                  Staff Workspace
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Pragati Skills Mission Governance Portal</p>
            </div>
          </Link>

          <Link
            to="/"
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition"
          >
            <span>Public Verification Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="max-w-6xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-xs font-medium text-indigo-300 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Zero-Trust Authenticated Staff Access</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Pragati Mission Staff & Reviewer Portal
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-xl mx-auto">
            Sign in with official credentials or select a verified reviewer persona below for instant 1-click evaluation access.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-6 w-full p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Column 1: Standard Credential Login */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center space-x-2.5 mb-5 pb-4 border-b border-slate-800">
              <Lock className="w-5 h-5 text-indigo-400" />
              <div>
                <h2 className="text-base font-bold text-white">Staff Sign In</h2>
                <p className="text-xs text-slate-400">Enter your assigned governmental credentials</p>
              </div>
            </div>

            <form onSubmit={handleStandardLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Official Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. farah@state.pragati.gov.in"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (demo: any)"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In to Mission Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
              Protected by HS256 signed JSON Web Tokens & Zero-Trust RBAC guards.
            </div>
          </div>

          {/* Column 2: 1-Click Reviewer Access Panel */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>⚡ Quick Reviewer Access</span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-700 rounded-md">
                    1-Click Demo JWT
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Instant authenticated session switch as per governance workflow roles
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {PERSONAS.map((p) => {
                const key = p.key || p.name.toLowerCase();
                return (
                  <button
                    key={p.id}
                    onClick={() => handleDemoSwitch(key)}
                    disabled={isLoading}
                    className="text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/80 hover:border-slate-700 transition group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          {getPersonaIcon(p.role)}
                          <span className="font-bold text-white text-xs group-hover:text-indigo-400 transition">
                            {p.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {p.role.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                        {p.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-indigo-400 font-semibold group-hover:translate-x-0.5 transition">
                      <span>Launch Role Workspace</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        Pragati Skills Mission — CertiFlow Platform • Government of India Skilling Initiative
      </footer>
    </div>
  );
};
