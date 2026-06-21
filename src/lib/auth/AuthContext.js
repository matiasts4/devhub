'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/db/localClient';

const AuthContext = createContext({
  user: null,
  loading: true,
  workspaces: [],
  activeWorkspaceId: null,
  setActiveWorkspaceId: () => {},
  projectMemberships: [],
  activeProjectId: null,
  setActiveProjectId: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null);
  const [projectMemberships, setProjectMemberships] = useState([]);
  const [activeProjectId, setActiveProjectIdState] = useState(null);

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (user && user.id !== 'local-user') {
        window.__devhub_authenticated = true;
      } else {
        window.__devhub_authenticated = false;
      }
    }
  }, [user]);

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

  // Fetch cloud project memberships when user changes
  useEffect(() => {
    if (!db) return;

    const fetchProjectMemberships = async () => {
      if (!user || user.id === 'local-user') {
        setProjectMemberships([]);
        setActiveProjectIdState(null);
        return;
      }

      try {
        const { data, error } = await db
          .from('project_members')
          .select('role, project_id, projects(id, name, color, status, description)')
          .eq('user_id', user.id);
        if (!error && data) {
          const memberships = data.map((row) => ({
            projectId: row.project_id,
            role: row.role,
            project: row.projects,
          }));
          setProjectMemberships(memberships);

          const stored =
            typeof window !== 'undefined' ? localStorage.getItem('devhub:active-project-id') : null;
          const exists = memberships.some((m) => m.projectId === stored);
          if (stored && exists) {
            setActiveProjectIdState(stored);
          } else if (memberships.length > 0) {
            const defaultProjectId = memberships[0].projectId;
            setActiveProjectIdState(defaultProjectId);
            if (typeof window !== 'undefined') {
              localStorage.setItem('devhub:active-project-id', defaultProjectId);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching project memberships:', err);
      }
    };

    fetchProjectMemberships();
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

  const setActiveProjectId = (id) => {
    setActiveProjectIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('devhub:active-project-id', id);
    }
    window.dispatchEvent(new CustomEvent('devhub:project-changed', { detail: { projectId: id } }));
  };

  const signOut = async () => {
    if (db) {
      await db.auth.signOut();
    }
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceIdState(null);
    setProjectMemberships([]);
    setActiveProjectIdState(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('devhub:active-workspace-id');
      localStorage.removeItem('devhub:active-project-id');
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
        projectMemberships,
        activeProjectId,
        setActiveProjectId,
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
