'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Clock3, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { createClient } from "@/lib/db/localSupabase";

const DEADLINE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_MCP_SYNC_MS = 30 * 60 * 1000;

function formatTimeLeft(targetDate) {
  const msLeft = new Date(targetDate).getTime() - Date.now();
  if (msLeft <= 0) return "vencida";

  const totalMinutes = Math.ceil(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function buildMcpAlerts(connections) {
  if (!Array.isArray(connections)) return [];

  const now = Date.now();
  return connections.map((conn) => {
    if (!conn.is_active) {
      return {
        id: `mcp-${conn.id}`,
        level: "warning",
        name: conn.name,
        message: "desconectado",
      };
    }

    if (!conn.last_sync) {
      return {
        id: `mcp-${conn.id}`,
        level: "warning",
        name: conn.name,
        message: "sin ultima sincronizacion",
      };
    }

    const elapsed = now - new Date(conn.last_sync).getTime();
    if (elapsed > STALE_MCP_SYNC_MS) {
      return {
        id: `mcp-${conn.id}`,
        level: "warning",
        name: conn.name,
        message: "sincronizacion atrasada",
      };
    }

    return {
      id: `mcp-${conn.id}`,
      level: "ok",
      name: conn.name,
      message: "operativo",
    };
  });
}

export default function NotificationCenter({ projectId, collapsed }) {
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deadlineAlerts, setDeadlineAlerts] = useState([]);
  const [mcpAlerts, setMcpAlerts] = useState([]);

  const fetchAlerts = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const now = new Date();
    const end = new Date(now.getTime() + DEADLINE_WINDOW_MS);

    const [tasksResult, mcpResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, due_date, priority, status")
        .eq("project_id", projectId)
        .neq("status", "completed")
        .not("due_date", "is", null)
        .lte("due_date", end.toISOString())
        .order("due_date", { ascending: true }),
      supabase
        .from("mcp_connections")
        .select("id, name, is_active, last_sync")
        .order("created_at", { ascending: false }),
    ]);

    const tasks = (tasksResult.data || []).filter((task) => {
      const dueTs = new Date(task.due_date).getTime();
      const delta = dueTs - now.getTime();
      return delta > 0 && delta <= DEADLINE_WINDOW_MS;
    });

    setDeadlineAlerts(tasks);
    setMcpAlerts(buildMcpAlerts(mcpResult.data || []));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60000);
    return () => clearInterval(timer);
  }, [fetchAlerts]);

  useEffect(() => {
    if (collapsed) setOpen(false);
  }, [collapsed]);

  const criticalMcpAlerts = useMemo(
    () => mcpAlerts.filter((alert) => alert.level !== "ok"),
    [mcpAlerts]
  );

  const unreadCount = deadlineAlerts.length + criticalMcpAlerts.length;

  return (
    <div className="px-2 py-2 border-b border-borders-subtle">
      <button
        data-testid="notification-bell"
        onClick={() => !collapsed && setOpen((prev) => !prev)}
        className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-between"} rounded-md px-2.5 py-2 text-xs transition-all ${
          open
            ? "bg-surface-elevated text-text-primary"
            : "text-text-muted hover:text-text-primary hover:bg-surface-card"
        }`}
        title={collapsed ? "Notificaciones" : undefined}
      >
        <span className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          {!collapsed && <span>Notificaciones</span>}
        </span>
        <span
          className={`ml-2 min-w-5 h-5 px-1 rounded-full border text-[10px] font-semibold flex items-center justify-center ${
            unreadCount > 0
              ? "border-[#F778BA]/40 text-danger bg-[#F778BA]/10"
              : "border-borders-strong text-text-muted bg-surface-card"
          }`}
        >
          {unreadCount}
        </span>
      </button>

      {!collapsed && open && (
        <div className="mt-2 rounded-lg border border-borders-subtle bg-surface-app overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-borders-subtle">
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-semibold">
              Centro de Alertas
            </p>
            <button
              onClick={fetchAlerts}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Actualizar alertas"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-2">
                Deadlines &lt; 24h
              </p>
              {deadlineAlerts.length === 0 ? (
                <p className="text-[11px] text-success">Sin tareas por vencer en las proximas 24 horas.</p>
              ) : (
                <div className="space-y-2">
                  {deadlineAlerts.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-md border border-[#F778BA]/25 bg-[#F778BA]/5 px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-danger mt-0.5 flex-shrink-0" strokeWidth={1.7} />
                        <div className="min-w-0">
                          <p className="text-[11px] text-text-primary font-medium truncate">{task.title}</p>
                          <p className="text-[10px] text-danger mt-0.5 flex items-center gap-1">
                            <Clock3 className="w-3 h-3" strokeWidth={1.7} />
                            vence en {formatTimeLeft(task.due_date)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-2">
                Estado Agentes MCP
              </p>
              {mcpAlerts.length === 0 ? (
                <p className="text-[11px] text-text-muted">No hay conexiones MCP registradas.</p>
              ) : (
                <div className="space-y-1.5">
                  {mcpAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-md border px-2.5 py-2 flex items-center justify-between ${
                        alert.level === "ok"
                          ? "border-[#3FB950]/25 bg-[#3FB950]/5"
                          : "border-[#FFA657]/25 bg-[#FFA657]/8"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {alert.level === "ok" ? (
                          <Wifi className="w-3.5 h-3.5 text-success flex-shrink-0" strokeWidth={1.7} />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-[#FFA657] flex-shrink-0" strokeWidth={1.7} />
                        )}
                        <p className="text-[11px] text-text-primary truncate">{alert.name}</p>
                      </div>
                      <span
                        className={`text-[10px] font-medium ${
                          alert.level === "ok" ? "text-success" : "text-[#FFA657]"
                        }`}
                      >
                        {alert.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}