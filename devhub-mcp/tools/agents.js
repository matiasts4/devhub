import { appendFileSync } from 'fs';

import { z } from 'zod';

const TEAM_TELL_ACTIVE_PARTICIPANT_STATUSES = new Set(['invited', 'active', 'paused']);

function getTeamTellTransportOverride() {
  if (process.env.DEVHUB_MCP_TEAM_TELL_FAKE_TRANSPORT !== '1') return null;
  const transportLogPath = process.env.DEVHUB_MCP_TEAM_TELL_TRANSPORT_LOG_PATH || null;

  return async (_sessionId, opencodeSessionId) => {
    if (transportLogPath) {
      appendFileSync(transportLogPath, `${String(opencodeSessionId)}\n`, 'utf8');
    }

    if (String(opencodeSessionId).includes('stale')) {
      throw new Error(
        `Failed to send message to OpenCode session ${opencodeSessionId}: 404 session missing`
      );
    }

    return {
      delivery_ref: `delivery-ref:${opencodeSessionId}`,
      evidence_ref: `evidence-ref:${opencodeSessionId}`,
    };
  };
}

function validateTeamTellMembership(db, localDb, { mission_id, sender_agent_id, recipients }) {
  const mission = localDb.getSwarmMissionById(db, mission_id);
  if (!mission) {
    throw new Error(`Misión ${mission_id} no encontrada.`);
  }

  const participants = localDb
    .listMissionParticipants(db, mission_id)
    .filter((participant) => TEAM_TELL_ACTIVE_PARTICIPANT_STATUSES.has(participant.status));
  const participantIds = new Set(participants.map((participant) => participant.agent_id));

  if (!participantIds.has(sender_agent_id)) {
    throw new Error(`sender_agent_id no pertenece a la misión ${mission_id}.`);
  }

  const invalidRecipient = (recipients || []).find((recipient) => !participantIds.has(recipient));
  if (invalidRecipient) {
    throw new Error(
      `recipient_agent_id no pertenece a la misión ${mission_id}: ${invalidRecipient}`
    );
  }

  return mission;
}

function toCompactTeamTellResult(result) {
  return {
    accepted: true,
    message: {
      message_id: result.message.message_id,
      mission_id: result.message.mission_id,
      message_kind: result.message.message_kind,
      created_at: result.message.created_at,
    },
    outcomes: result.outcomes.map((outcome) => ({
      recipient_agent_id: outcome.recipient_agent_id,
      status: outcome.status,
      reason: outcome.reason,
      delivery_id: outcome.delivery_id,
      delivery_ref: outcome.delivery_ref || null,
      evidence_ref: outcome.evidence_ref || null,
    })),
  };
}

export function registerAgentTools(server, deps) {
  const {
    localDb,
    ok,
    err,
    createTeamTell,
    createOpencodeTargetResolver,
    createOpencodeDeliveryAdapter,
  } = deps;

  server.tool(
    'team_tell',
    'Envía una directiva durable por misión a uno o más participantes usando persist-first y OpenCode sólo para bindings verificables.',
    {
      mission_id: z.string().min(1),
      sender_agent_id: z.string().min(1),
      body_summary: z.string().min(1),
      recipients: z.array(z.string().min(1)).max(50).optional().default([]),
      target_role: z
        .string()
        .optional()
        .describe('Target all agents with this role_in_mission (e.g. "worker", "director")'),
      message_kind: z
        .enum([
          'directive',
          'status',
          'handoff',
          'decision',
          'risk',
          'approval_request',
          'approval_result',
        ])
        .optional()
        .default('directive'),
      evidence_ref: z.string().optional(),
    },
    async ({
      mission_id,
      sender_agent_id,
      body_summary,
      recipients,
      target_role,
      message_kind,
      evidence_ref,
    }) => {
      try {
        const db = localDb.getDb();
        validateTeamTellMembership(db, localDb, { mission_id, sender_agent_id, recipients });

        const resolveTargetBinding = createOpencodeTargetResolver({ db });
        const transportSendMessage = getTeamTellTransportOverride();
        const sendToVerifiedSession = createOpencodeDeliveryAdapter(
          transportSendMessage ? { transportSendMessage } : {}
        );
        const teamTell = createTeamTell({ db, resolveTargetBinding, sendToVerifiedSession });

        const result = await teamTell({
          mission_id,
          sender_agent_id,
          body_summary,
          recipients,
          target_role,
          message_kind,
          evidence_ref: evidence_ref || null,
        });

        return ok(toCompactTeamTellResult(result));
      } catch (e) {
        return err(e.message);
      }
    }
  );
}
