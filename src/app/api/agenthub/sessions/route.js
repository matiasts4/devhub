import { NextResponse } from 'next/server';
import {
  getRecentSessions,
  getSessionsByProject,
  getSessionsByTelegramChat,
  getSessionChain,
  getChildSessions,
  getSiblingSessions,
  tables,
} from '@/lib/db/localDb.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const projectId = searchParams.get('project_id');
    const telegramChatId = searchParams.get('telegram_chat_id');
    const parentId = searchParams.get('parent_id');
    const sessionId = searchParams.get('session_id');
    const hierarchy = searchParams.get('hierarchy');
    const limit = parseInt(searchParams.get('limit'), 10) || 50;

    // Hierarchy endpoints
    if (hierarchy === 'chain' && sessionId) {
      const chain = getSessionChain(sessionId);
      return NextResponse.json(chain);
    }
    if (hierarchy === 'children' && parentId) {
      const children = getChildSessions(parentId);
      return NextResponse.json(children);
    }
    if (hierarchy === 'siblings' && sessionId) {
      const siblings = getSiblingSessions(sessionId);
      return NextResponse.json(siblings);
    }

    let sessions;

    if (projectId) {
      sessions = getSessionsByProject(projectId);
    } else if (telegramChatId) {
      sessions = getSessionsByTelegramChat(telegramChatId, limit);
    } else {
      sessions = getRecentSessions(limit);
    }

    return NextResponse.json(sessions);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      project_id,
      title,
      agent_model,
      parent_id,
      opencode_session_id,
      telegram_chat_id,
      directory,
    } = body;

    if (!project_id || !title) {
      return NextResponse.json({ error: 'project_id and title are required' }, { status: 400 });
    }

    // Validate parent_id exists if provided
    if (parent_id) {
      const parent = tables.agent_hub_sessions.single({
        where: [['id', '=', parent_id]],
      });
      if (!parent) {
        return NextResponse.json({ error: 'Parent session not found' }, { status: 404 });
      }
    }

    const newSession = tables.agent_hub_sessions.insert({
      id: crypto.randomUUID(),
      project_id,
      title,
      agent_model: agent_model || null,
      parent_id: parent_id || null,
      opencode_session_id: opencode_session_id || null,
      telegram_chat_id: telegram_chat_id || null,
      directory: directory || null,
      status: 'active',
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (err) {
    console.error('Error creating session:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
