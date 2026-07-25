import { Plus } from 'lucide-react';
import { UiHeader } from '@/components/ui/system';
import MetricCard from '../components/MetricCard';
import HistorialCommits from '../components/HistorialCommits';
import UltimasInteracciones from '../components/UltimasInteracciones';
import AgentActivityFeed from '../components/AgentActivityFeed';
import UsageChart from '../components/UsageChart';
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sileo } from 'sileo';
import { createClient } from '@/lib/db/localClient';

export default function Dashboard() {
  const { project } = useOutletContext() || {};
  const db = createClient();
  const [metricsData, setMetricsData] = useState(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/metrics');
        const data = await res.json();
        if (data.success) {
          setMetricsData(data);
        }
      } catch (err) {
        console.error('Error fetching metrics', err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const metricCards = [
    {
      id: 'active-sessions',
      title: 'Sesiones OpenCode',
      value: metricsData ? metricsData.kpis.total_sessions : '-',
      subtitle: 'Sesiones únicas registradas',
      icon: 'Bot',
      accentColor: '#00F0FF',
      progressValue: 100,
      badge: 'Activo',
      trend: 'En vivo',
    },
    {
      id: 'tool-usage',
      title: 'Herramientas Ejecutadas',
      value: metricsData ? metricsData.kpis.total_tools_used : '-',
      subtitle: 'Comandos disparados por LLM',
      icon: 'Activity',
      accentColor: '#B026FF',
      progressValue: 100,
      badge: 'Sistema',
      trend: 'Todas las herramientas',
    },
    {
      id: 'avg-time',
      title: 'Tiempo de Herramientas',
      value:
        metricsData && metricsData.kpis.avg_tool_duration_ms
          ? `${Math.round(metricsData.kpis.avg_tool_duration_ms)}ms`
          : '-',
      subtitle: 'Promedio de ejecución',
      icon: 'Clock',
      accentColor: '#39FF14',
      progressValue: 100,
      badge: 'Performance',
      trend: 'Rápido',
    },
    {
      id: 'errors',
      title: 'Errores de Agente',
      value: metricsData ? metricsData.kpis.total_errors : '-',
      subtitle: 'Alertas de contexto/herramienta',
      icon: 'AlertTriangle',
      accentColor: '#FF007F',
      progressValue: 30,
      badge: metricsData && metricsData.kpis.total_errors > 0 ? 'Revisar' : 'Estable',
      trend: 'Histórico',
    },
  ];

  const handleStaleTasks = async (tasks) => {
    const resetTasks = async () => {
      for (const t of tasks) {
        await db
          .from('tasks')
          .update({ status: 'pending', stale_alert: false, priority: 'medium' })
          .eq('id', t.id);
      }
      sileo.success({ title: 'Tareas estancadas reseteadas a Pendiente' });
    };

    const escalateTasks = async () => {
      for (const t of tasks) {
        await db.from('tasks').update({ priority: 'critical', stale_alert: false }).eq('id', t.id);
      }
      sileo.success({ title: 'Prioridad escalada a crítica' });
    };

    const toastId = sileo.warning({
      title: 'Tareas Estancadas Detectadas',
      duration: 15000,
      description: (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Hay {tasks.length} tareas en progreso por más de 48h en el proyecto.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                sileo.dismiss(toastId);
                resetTasks();
              }}
              className="px-2 py-1 text-xs bg-surface-elevated hover:bg-surface-active rounded border border-borders-subtle"
            >
              Resetear a Pendiente
            </button>
            <button
              onClick={() => {
                sileo.dismiss(toastId);
                escalateTasks();
              }}
              className="px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded border border-red-500/30"
            >
              Escalar Prioridad
            </button>
          </div>
        </div>
      ),
    });
  };

  useEffect(() => {
    if (project?.id) {
      // Anti-parálisis: Detect stale tasks logic on mount (simulating Edge function marking them as stale)
      const checkStale = async () => {
        // To simulate the scheduled edge function immediately for testing:
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const { data: staleData } = await db
          .from('tasks')
          .select('id')
          .eq('project_id', project.id)
          .eq('status', 'in_progress')
          .lt('updated_at', fortyEightHoursAgo);

        if (staleData && staleData.length > 0) {
          await db
            .from('tasks')
            .update({ stale_alert: true })
            .in(
              'id',
              staleData.map((t) => t.id)
            );
        }

        // Actual notification query
        const { data: alerts } = await db
          .from('tasks')
          .select('id, title')
          .eq('project_id', project.id)
          .eq('stale_alert', true);

        if (alerts && alerts.length > 0) {
          handleStaleTasks(alerts);
        }
      };
      checkStale();
    }
  }, [project?.id]);

  return (
    <div className="h-full bg-surface-app dot-grid flex flex-col">
      <UiHeader sticky data-testid="ui-header">
        <UiHeader.Title>{project?.name || 'E-commerce V2'}</UiHeader.Title>
        <UiHeader.Actions>
          <button
            onClick={() => sileo.success({ title: 'Nueva tarea creada por IA' })}
            className="flex items-center gap-2 bg-accent-primary hover:bg-app-accent text-[#0d1117] font-semibold px-4 py-2 rounded-lg text-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Nueva Tarea IA
          </button>
        </UiHeader.Actions>
      </UiHeader>
      <div className="px-6 py-5 space-y-5 flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card, index) => (
            <MetricCard key={card.id} {...card} index={index} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Componente de gráfico de uso de herramientas */}
            <div className="h-[300px]">
              <UsageChart data={metricsData?.chartData || []} />
            </div>
            <UltimasInteracciones />
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-[450px]">
              <AgentActivityFeed events={metricsData?.recentEvents || []} />
            </div>
            <HistorialCommits />
          </div>
        </div>
      </div>
    </div>
  );
}
