import { z } from 'zod';

import { PROJECT_ID_SCHEMA } from './schemas/common.js';

export function registerInboxTools(server, deps) {
  const { localDb, DB_DRIVER, ok, err } = deps;

  server.tool(
    'list_operator_inbox',
    'Lee el snapshot durable compartido para el inbox del operador. Filtra por project_id, status, category.',
    {
      project_id: PROJECT_ID_SCHEMA.optional(),
      status: z.enum(['unread', 'read', 'dismissed']).optional(),
      category: z
        .enum([
          'approval_request',
          'approval_result',
          'supervisor_action',
          'task_claimed',
          'task_released',
          'task_blocked',
          'agent_event',
          'system',
        ])
        .optional(),
      limit: z.number().int().min(1).max(100).optional().default(50),
      offset: z.number().int().min(0).optional().default(0),
    },
    async ({ project_id, status, category, limit, offset }) => {
      try {
        if (DB_DRIVER !== 'supabase') {
          const db = localDb.getDb();
          const items = localDb.queryOperatorInbox(db, {
            projectId: project_id,
            status,
            category,
            limit,
            offset,
          });
          return ok({ items, count: items.length });
        }
        return err('Supabase driver not implemented for operator_inbox');
      } catch (e) {
        return err(e.message);
      }
    }
  );

  server.tool(
    'dismiss_inbox_item',
    'Descarta un item del inbox del operador cambiando su status a dismissed.',
    {
      inbox_id: z.string().min(1),
    },
    async ({ inbox_id }) => {
      try {
        if (DB_DRIVER !== 'supabase') {
          const db = localDb.getDb();
          const dismissed = localDb.dismissInboxItem(db, inbox_id);
          if (!dismissed) return err('Inbox item not found or already dismissed');
          return ok({ dismissed: true, inbox_id });
        }
        return err('Supabase driver not implemented for operator_inbox');
      } catch (e) {
        return err(e.message);
      }
    }
  );
}
