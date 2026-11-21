import { create } from 'zustand';
import type { Persona } from '../types';
import { PERSONAS } from '../services/api';

interface AuthState {
  activePersona: Persona;
  jwtToken: string | null;
  setPersona: (persona: Persona) => Promise<void>;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  activePersona: PERSONAS[0], // Anika by default
  jwtToken: null,

  setPersona: async (persona: Persona) => {
    try {
      // Fetch signed JWT token for this persona
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: persona.name.toLowerCase() }),
      });
      const json = await res.json();
      const token = json.data?.token || null;

      set({ activePersona: persona, jwtToken: token });
      if (token) {
        localStorage.setItem('certiflow_jwt_token', token);
      }
    } catch (err) {
      set({ activePersona: persona });
    }
  },

  setToken: (token: string | null) => {
    set({ jwtToken: token });
  },
}));
