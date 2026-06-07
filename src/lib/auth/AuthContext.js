'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/db/localClient';

const AuthContext = createContext({
  user: null,
  loading: true,
  workspaces: [],
  activeWorkspaceId: null,
  setActiveWorkspaceId: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null);

  // We initialize the client inside useEffect or lazily to avoid server-side execution issues in Next.js
  const [db, setDb] = useState(null);

  useEffect(() => {
    const client = createClient();
    setDb(client);

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        setUser(session?.user || null);
      } catch (err) {
        console.error('Error getting session:', err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Fetch workspaces when user changes
  useEffect(() => {
    if (!db) return;

    const fetchWorkspaces = async () => {
      if (!user) {
        setWorkspaces([]);
        setActiveWorkspaceIdState(null);
        return;
      }

      try {
        const { data, error } = await db.from('workspaces').select('*');
        if (!error && data) {
          setWorkspaces(data);
          // Load stored workspace ID or default to the first one
          const stored =
            typeof window !== 'undefined'
              ? localStorage.getItem('devhub:active-workspace-id')
              : null;
          const exists = data.some((ws) => ws.id === stored);
          if (stored && exists) {
            setActiveWorkspaceIdState(stored);
          } else if (data.length > 0) {
            const defaultWs = data[0].id;
            setActiveWorkspaceIdState(defaultWs);
            if (typeof window !== 'undefined') {
              localStorage.setItem('devhub:active-workspace-id', defaultWs);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching workspaces:', err);
      }
    };

    fetchWorkspaces();
  }, [user, db]);

  const setActiveWorkspaceId = (id) => {
    setActiveWorkspaceIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('devhub:active-workspace-id', id);
    }
    window.dispatchEvent(
      new CustomEvent('devhub:workspace-changed', { detail: { workspaceId: id } })
    );
  };

  const signOut = async () => {
    if (db) {
      await db.auth.signOut();
    }
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceIdState(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('devhub:active-workspace-id');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
