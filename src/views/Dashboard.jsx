import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/db/localSupabase';
import MetricCard from '../components/MetricCard';
import BannerIA from '../components/BannerIA';
import HistorialCommits from '../components/HistorialCommits';
import UltimasInteracciones from '../components/UltimasInteracciones';

const metricCards = [
  {
    id: 'security',
    title: 'Seguridad y Auth',
    value: '85%',
    subtitle: 'Progreso completado',
    icon: 'Shield',
    accentColor: '#39FF14',
    progressValue: 85,
    badge: 'Activo',
    trend: '+5% esta semana',
  },
  {
    id: 'ui-ux',
    title: 'UI / UX',
    value: '12/15',
    subtitle: 'Tareas completadas',
    icon: 'Palette',
    accentColor: '#00F0FF',
    progressValue: 80,
    badge: 'En progreso',
    trend: '3 tareas pendientes',
  },
  {
    id: 'backend',
    title: 'Backend & Base de Datos',
    value: 'En rev.',
    subtitle: 'Esperando revisión',
    icon: 'Database',
    accentColor: '#FF007F',
    progressValue: 60,
    badge: 'Revisión',
    trend: '2 PRs abiertos',
  },
  {
    id: 'tech-debt',
    title: 'Deuda Técnica',
    value: '3',
    subtitle: 'Alertas de refactorización',
    icon: 'AlertTriangle',
    accentColor: '#FFE600',
    progressValue: 30,
    badge: 'Crítico',
    trend: 'Requiere atención',
  },
];

export default function Dashboard() {
  const { project } = useOutletContext() || {};
  const supabase = createClient();

  const handleStaleTasks = async (tasks) => {
    const resetTasks = async () => {
      for (const t of tasks) {
        await supabase
          .from('tasks')
          .update({ status: 'pending', stale_alert: false, priority: 'medium' })
          .eq('id', t.id);
      }
      toast.success('Tareas estancadas reseteadas a Pendiente');
    };

    const escalateTasks = async () => {
      for (const t of tasks) {
        await supabase
          .from('tasks')
          .update({ priority: 'critical', stale_alert: false })
          .eq('id', t.id);
      }
      toast.success('Prioridad escalada a crítica');
    };

    toast(
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-warning">
          <AlertCircle className="w-5 h-5" />{' '}
          <h4 className="font-semibold text-sm">Tareas Estancadas Detectadas</h4>
        </div>
        <p className="text-xs text-text-muted">
          Hay {tasks.length} tareas en progreso por más de 48h en el proyecto.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              toast.dismiss();
              resetTasks();
            }}
            className="px-2 py-1 text-xs bg-surface-elevated hover:bg-surface-active rounded border border-borders-subtle"
          >
            Resetear a Pendiente
          </button>
          <button
            onClick={() => {
              toast.dismiss();
              escalateTasks();
            }}
            className="px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded border border-red-500/30"
          >
            Escalar Prioridad
          </button>
        </div>
      </div>,
      {
        duration: 15000,
        unstyled: true,
        classNames: {
          toast: 'bg-surface-card border border-borders-strong p-4 rounded-xl shadow-xl w-full',
        },
      }
    );
  };

  useEffect(() => {
    if (project?.id) {
      // Anti-parálisis: Detect stale tasks logic on mount (simulating Edge function marking them as stale)
      const checkStale = async () => {
        // To simulate the scheduled edge function immediately for testing:
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const { data: staleData } = await supabase
          .from('tasks')
          .select('id')
          .eq('project_id', project.id)
          .eq('status', 'in_progress')
          .lt('updated_at', fortyEightHoursAgo);

        if (staleData && staleData.length > 0) {
          await supabase
            .from('tasks')
            .update({ stale_alert: true })
            .in(
              'id',
              staleData.map((t) => t.id)
            );
        }

        // Actual notification query
        const { data: alerts } = await supabase
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
    <div className="min-h-screen bg-surface-app dot-grid">
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-md border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-semibold leading-none mb-0.5">
              Proyecto Activo
            </p>
            <h1 className="font-mono text-base font-bold text-text-primary leading-none">
              {project?.name || 'E-commerce V2'}
            </h1>
          </div>
        </div>
        <button
          onClick={() => toast.success('Nueva tarea creada por IA')}
          className="flex items-center gap-2 bg-accent-primary hover:bg-[#79C0FF] text-[#0d1117] font-semibold px-4 py-2 rounded-lg text-xs transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Nueva Tarea IA
        </button>
      </div>
      <div className="px-6 py-5 space-y-5">
        <BannerIA />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card, index) => (
            <MetricCard key={card.id} {...card} index={index} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <UltimasInteracciones />
          </div>
          <div className="flex flex-col gap-4">
            <HistorialCommits />
          </div>
        </div>
      </div>
    </div>
  );
}
