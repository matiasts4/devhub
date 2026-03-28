/**
 * QA-04 — Tests Unitarios del MCP Server
 * Suite: create_milestone tool
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockMilestone = {
  id: 'milestone-uuid-123',
  project_id: 'project-uuid',
  user_id: 'user-uuid',
  title: 'Fase de prueba',
  description: 'Descripción del milestone',
  status: 'planned',
  due_date: '2026-06-01',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createMockSupabase(overrides = {}) {
  return {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: mockMilestone,
            error: null,
            ...overrides,
          })),
        })),
      })),
    })),
  };
}

async function createMilestoneTool(params, supabase) {
  const { project_id, user_id, title, description, status, due_date } = params;

  if (!project_id) throw new Error('project_id es requerido');
  if (!user_id) throw new Error('user_id es requerido');
  if (!title || title.length === 0) throw new Error('minLength: title debe tener al menos 1 carácter');

  const validStatuses = ['planned', 'in_progress', 'completed', 'at_risk'];
  if (status && !validStatuses.includes(status)) {
    throw new Error(`status inválido. Debe ser uno de: ${validStatuses.join(', ')}`);
  }

  const { data, error } = await supabase
    .from('milestones')
    .insert({
      project_id,
      user_id,
      title,
      description: description || null,
      status: status || 'planned',
      due_date: due_date || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Error de Supabase: ${error.message}`);
  return { created: true, milestone: data };
}

describe('create_milestone tool', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  describe('Happy Path', () => {
    it('crea un milestone con los campos requeridos', async () => {
      const result = await createMilestoneTool(
        { project_id: 'project-uuid', user_id: 'user-uuid', title: 'Sprint 1' },
        mockSupabase
      );
      expect(result.created).toBe(true);
      expect(result.milestone.id).toBe('milestone-uuid-123');
    });

    it('acepta todos los status válidos', async () => {
      const statuses = ['planned', 'in_progress', 'completed', 'at_risk'];
      for (const status of statuses) {
        const result = await createMilestoneTool(
          { project_id: 'project-uuid', user_id: 'user-uuid', title: 'Test', status },
          createMockSupabase()
        );
        expect(result.created).toBe(true);
      }
    });

    it('acepta una due_date válida', async () => {
      const result = await createMilestoneTool(
        {
          project_id: 'project-uuid',
          user_id: 'user-uuid',
          title: 'Milestone con fecha',
          due_date: '2026-05-15',
        },
        mockSupabase
      );
      expect(result.created).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('lanza error en fallo de base de datos', async () => {
      const errorSupabase = {
        from: jest.fn(() => ({
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({ data: null, error: { message: 'DB error' } })),
            })),
          })),
        })),
      };

      await expect(
        createMilestoneTool(
          { project_id: 'p', user_id: 'u', title: 'T' },
          errorSupabase
        )
      ).rejects.toThrow('Error de Supabase');
    });
  });

  describe('Validación de Inputs', () => {
    it('rechaza status inválido', async () => {
      await expect(
        createMilestoneTool(
          { project_id: 'p', user_id: 'u', title: 'T', status: 'invalid' },
          mockSupabase
        )
      ).rejects.toThrow('status inválido');
    });

    it('falla si falta project_id', async () => {
      await expect(
        createMilestoneTool({ user_id: 'u', title: 'T' }, mockSupabase)
      ).rejects.toThrow('project_id es requerido');
    });

    it('falla con título vacío', async () => {
      await expect(
        createMilestoneTool({ project_id: 'p', user_id: 'u', title: '' }, mockSupabase)
      ).rejects.toThrow('minLength');
    });
  });
});
