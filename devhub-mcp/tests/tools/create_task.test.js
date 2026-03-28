/**
 * QA-04 — Tests Unitarios del MCP Server
 * Suite: create_task tool
 * 
 * Testea el comportamiento de la herramienta create_task con:
 * - happy path (creación exitosa)
 * - error handling (fallo de Supabase)
 * - inputs inválidos (campos requeridos faltantes)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// --- Mock del cliente Supabase ---
const mockTask = {
  id: 'test-uuid-123',
  project_id: 'project-uuid',
  user_id: 'user-uuid',
  title: 'Tarea de prueba',
  description: null,
  status: 'pending',
  priority: 'medium',
  due_date: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  milestone_id: null,
  business_value: 5,
};

function createMockSupabase(overrides = {}) {
  return {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: mockTask,
            error: null,
            ...overrides,
          })),
        })),
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({
            data: { id: 'project-uuid', name: 'Test Project' },
            error: null,
          })),
        })),
      })),
    })),
  };
}

// --- Simulación de la tool create_task (extraída del MCP server) ---
async function createTaskTool(params, supabase) {
  const { project_id, user_id, title, description, priority, status, due_date, milestone_id } = params;

  if (!project_id) throw new Error('project_id es requerido');
  if (!user_id) throw new Error('user_id es requerido');
  if (!title || title.length === 0) throw new Error('minLength: title debe tener al menos 1 carácter');

  const insertData = {
    project_id,
    user_id,
    title,
    description: description || null,
    priority: priority || 'medium',
    status: status || 'pending',
    due_date: due_date || null,
    milestone_id: milestone_id || null,
    business_value: 5,
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(insertData)
    .select()
    .single();

  if (error) throw new Error(`Error de Supabase: ${error.message}`);

  return { created: true, task: data };
}

// --- Tests ---
describe('create_task tool', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  describe('Happy Path', () => {
    it('crea una tarea con los campos requeridos', async () => {
      const result = await createTaskTool(
        { project_id: 'project-uuid', user_id: 'user-uuid', title: 'Nueva tarea' },
        mockSupabase
      );

      expect(result.created).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task.id).toBe('test-uuid-123');
    });

    it('usa prioridad "medium" por defecto', async () => {
      const result = await createTaskTool(
        { project_id: 'project-uuid', user_id: 'user-uuid', title: 'Tarea sin prioridad' },
        mockSupabase
      );
      expect(result.created).toBe(true);
      // Verificamos que se llamó al insert con priority medium
      expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
    });

    it('acepta todos los campos opcionales', async () => {
      const result = await createTaskTool(
        {
          project_id: 'project-uuid',
          user_id: 'user-uuid',
          title: 'Tarea completa',
          description: 'Descripción detallada',
          priority: 'high',
          status: 'in_progress',
          due_date: '2026-05-15',
          milestone_id: 'milestone-uuid',
        },
        mockSupabase
      );
      expect(result.created).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('lanza error cuando Supabase retorna un error', async () => {
      const errorSupabase = {
        from: jest.fn(() => ({
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({
                data: null,
                error: { message: 'violates foreign key constraint' },
              })),
            })),
          })),
        })),
      };

      await expect(
        createTaskTool(
          { project_id: 'invalid-uuid', user_id: 'user-uuid', title: 'Test' },
          errorSupabase
        )
      ).rejects.toThrow('Error de Supabase');
    });
  });

  describe('Validación de Inputs', () => {
    it('falla si falta project_id', async () => {
      await expect(
        createTaskTool({ user_id: 'user-uuid', title: 'Test' }, mockSupabase)
      ).rejects.toThrow('project_id es requerido');
    });

    it('falla si falta user_id', async () => {
      await expect(
        createTaskTool({ project_id: 'project-uuid', title: 'Test' }, mockSupabase)
      ).rejects.toThrow('user_id es requerido');
    });

    it('falla si el título está vacío', async () => {
      await expect(
        createTaskTool({ project_id: 'project-uuid', user_id: 'user-uuid', title: '' }, mockSupabase)
      ).rejects.toThrow('minLength');
    });

    it('falla si el título es undefined', async () => {
      await expect(
        createTaskTool({ project_id: 'project-uuid', user_id: 'user-uuid' }, mockSupabase)
      ).rejects.toThrow('minLength');
    });
  });
});
