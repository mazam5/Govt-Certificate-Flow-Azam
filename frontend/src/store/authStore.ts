import { create } from 'zustand';
import type { Persona } from '../types';
import { PERSONAS, api } from '../services/api';

interface AuthState {
  isAuthenticated: boolean;
  activePersona: Persona | null;
  jwtToken: string | null;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  demoSwitch: (personaKey: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  initSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  activePersona: null,
  jwtToken: null,

  initSession: () => {
    try {
      const storedToken = localStorage.getItem('certiflow_jwt_token');
      const storedPersonaRaw = localStorage.getItem('certiflow_persona');

      if (storedToken && storedPersonaRaw) {
        const parsed = JSON.parse(storedPersonaRaw);
        const matching = PERSONAS.find((p) => p.id === parsed.id || p.email === parsed.email) || parsed;
        set({
          isAuthenticated: true,
          activePersona: matching,
          jwtToken: storedToken,
        });
      }
    } catch {
      localStorage.removeItem('certiflow_jwt_token');
      localStorage.removeItem('certiflow_persona');
    }
  },

  login: async (email: string, password?: string) => {
    try {
      const data = await api.login(email, password);
      const user = data.user;
      const token = data.token;

      const matchingPersona = PERSONAS.find(
        (p) => p.email?.toLowerCase() === user.email?.toLowerCase() || p.id === user.id
      ) || {
        id: user.id,
        name: user.name,
        role: user.role,
        district: user.district,
        description: `${user.role} Official`,
        badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      };

      set({
        isAuthenticated: true,
        activePersona: matchingPersona,
        jwtToken: token,
      });

      localStorage.setItem('certiflow_jwt_token', token);
      localStorage.setItem('certiflow_persona', JSON.stringify(matchingPersona));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  },

  demoSwitch: async (personaKey: string) => {
    try {
      const data = await api.demoSwitch(personaKey);
      const user = data.user;
      const token = data.token;

      const matchingPersona = PERSONAS.find(
        (p) => (p.key || p.name).toLowerCase() === personaKey.toLowerCase()
      ) || {
        id: user.id,
        name: user.name,
        role: user.role,
        district: user.district,
        description: `${user.role} Official`,
        badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      };

      set({
        isAuthenticated: true,
        activePersona: matchingPersona,
        jwtToken: token,
      });

      localStorage.setItem('certiflow_jwt_token', token);
      localStorage.setItem('certiflow_persona', JSON.stringify(matchingPersona));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Persona switch failed' };
    }
  },

  logout: () => {
    api.logout().catch(() => {});
    localStorage.removeItem('certiflow_jwt_token');
    localStorage.removeItem('certiflow_persona');
    set({
      isAuthenticated: false,
      activePersona: null,
      jwtToken: null,
    });
  },
}));
