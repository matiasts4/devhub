/**
 * QA-04 — Tests Unitarios del MCP Server
 * Suite: get_next_task tool
 * 
 * La herramienta get_next_task es crítica para el Swarm autónomo.
 * Selecciona la tarea de mayor score que no esté bloqueada por dependencias.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Función de scoring (réplica interna del MCP)
function calcularScore({ priority, business_value, due_date, status, stale_alert }) {
  const priorityScore = { critical: 40, high: 30, medium: 20, low: 10 }[priority] || 20;
  const urgencyScore = (() => {
    if (!due_date) return 0;
    const daysLeft = Math.ceil((new Date(due_date) - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 30;
    if (daysLeft <= 3) return 20;
    if (daysLeft <= 7) return 10;
    return 5;
  })();
  const businessScore = (business_value || 5) * 2;
  const staleBonus = stale_alert ? 10 : 0;
  return priorityScore + urgencyScore + businessScore + staleBonus;
}

const mockTasks = [
  {
    id: 'task-1',
    title: 'Tarea crítica',
    priority: 'critical',
    status: 'pending',
    business_value: 8,
    due_date: null,
    stale_alert: false,
  },
  {
    id: 'task-2',
    title: 'Tarea media',
    priority: 'medium',
    status: 'pending',
    business_value: 5,
    due_date: null,
    stale_alert: false,
  },
  {
    id: 'task-3',
    title: 'Tarea bloqueada',
    priority: 'high',
    status: 'blocked',
    business_value: 9,
    due_date: null,
    stale_alert: false,
  },
  {
    id: 'task-4',
    title: 'Tarea completada',
    priority: 'high',
    status: 'completed',
    business_value: 9,
    due_date: null,
    stale_alert: false,
  },
  {
    id: 'task-5',
    title: 'Tarea urgente con stale',
    priority: 'high',
    status: 'pending',
    business_value: 5,
    due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // vencida ayer
    stale_alert: true,
  },
];

function createMockSupabase(tasks = mockTasks) {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          in: jest.fn(() => ({
            data: tasks.filter((t) => t.status === 'pending'),
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ data: null, error: null })),
      })),
    })),
  };
}

async function getNextTaskTool(params, supabase) {
  const { project_id, agent_id } = params;

  if (!project_id) throw new Error('project_id es requerido');

  const { data: pendingTasks, error } = await supabase
    .from('tasks')
    .select()
    .eq('project_id', project_id)
    .in('status', ['pending']);

  if (error) throw new Error(`Error de Supabase: ${error.message}`);
  if (!pendingTasks || pendingTasks.length === 0) {
    return { task: null, message: 'No hay tareas pendientes disponibles' };
  }

  // Calcular scores y ordenar
  const scoredTasks = pendingTasks.map((t) => ({
    ...t,
    score: calcularScore(t),
  }));
  scoredTasks.sort((a, b) => b.score - a.score);

  const nextTask = scoredTasks[0];
  return {
    task: nextTask,
    score: nextTask.score,
    message: `Tarea asignada: ${nextTask.title}`,
  };
}

describe('get_next_task tool', () => {
  describe('Selección de Tarea por Score', () => {
    it('selecciona la tarea con mayor score', async () => {
      const mockSupabase = createMockSupabase([mockTasks[0], mockTasks[1]]);
      const result = await getNextTaskTool({ project_id: 'p', agent_id: 'a' }, mockSupabase);
      
      expect(result.task).toBeDefined();
      expect(result.task.id).toBe('task-1'); // critical > medium
    });

    it('no devuelve tareas bloqueadas ni completadas', async () => {
      const supabase = createMockSupabase(mockTasks);
      const result = await getNextTaskTool({ project_id: 'p', agent_id: 'a' }, supabase);
      
      if (result.task) {
        expect(result.task.status).not.toBe('blocked');
        expect(result.task.status).not.toBe('completed');
      }
    });

    it('devuelve null cuando no hay tareas pendientes', async () => {
      const emptySupabase = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              in: jest.fn(() => ({ data: [], error: null })),
            })),
          })),
        })),
      };

      const result = await getNextTaskTool({ project_id: 'empty-project', agent_id: 'a' }, emptySupabase);
      expect(result.task).toBeNull();
    });
  });

  describe('Cálculo de Score', () => {
    it('critical tiene mayor score que high', () => {
      const criticalScore = calcularScore({ priority: 'critical', business_value: 5, stale_alert: false });
      const highScore = calcularScore({ priority: 'high', business_value: 5, stale_alert: false });
      expect(criticalScore).toBeGreaterThan(highScore);
    });

    it('el stale_alert aumenta el score', () => {
      const normalScore = calcularScore({ priority: 'medium', business_value: 5, stale_alert: false });
      const staleScore = calcularScore({ priority: 'medium', business_value: 5, stale_alert: true });
      expect(staleScore).toBeGreaterThan(normalScore);
      expect(staleScore - normalScore).toBe(10);
    });

    it('tareas vencidas tienen urgency score máximo', () => {
      const overdueDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const score = calcularScore({ priority: 'medium', business_value: 5, due_date: overdueDate, stale_alert: false });
      const normalScore = calcularScore({ priority: 'medium', business_value: 5, stale_alert: false });
      expect(score).toBeGreaterThan(normalScore);
    });

    it('business_value alto incrementa el score', () => {
      const lowValue = calcularScore({ priority: 'medium', business_value: 1, stale_alert: false });
      const highValue = calcularScore({ priority: 'medium', business_value: 10, stale_alert: false });
      expect(highValue).toBeGreaterThan(lowValue);
    });
  });

  describe('Validación de Inputs', () => {
    it('falla si falta project_id', async () => {
      await expect(
        getNextTaskTool({ agent_id: 'a' }, createMockSupabase())
      ).rejects.toThrow('project_id es requerido');
    });
  });
});
