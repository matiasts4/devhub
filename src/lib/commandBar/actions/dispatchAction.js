/**
 * Action dispatcher with async generator lifecycle.
 * 
 * Validates intent slots, calls the appropriate action function,
 * and yields status updates (queued → running → done/failed).
 * 
 * @module commandBar/actions/dispatchAction
 */

import { terminalRun } from './terminalRun.js';
import { browserNavigate } from './browserNavigate.js';
import { browserSearch } from './browserSearch.js';
import { terminalRead } from './terminalRead.js';

/**
 * Dispatch an action and yield status updates.
 * 
 * @param {import('../types').ResolvedIntent} intent - Resolved intent
 * @param {import('../types').SurfaceController} controller - Surface controller
 * @yields {import('../types').ActionStatus} Status updates during execution
 * @returns {AsyncGenerator<import('../types').ActionStatus>}
 */
export async function* dispatchAction(intent, controller) {
  // Handle unknown intent
  if (intent.intent === 'unknown') {
    yield {
      phase: 'failed',
      error: intent.slots.reason === 'multi-step'
        ? 'CommandBar executes one action at a time. Try one command.'
        : "I don't understand that command. Try: 'run [command]', 'open [url]', or 'read terminal [name]'.",
    };
    return;
  }

  // Validate slots based on intent type
  const { slots } = intent;

  if (intent.intent === 'terminal-run') {
    if (!slots.command || slots.command.trim() === '') {
      yield { phase: 'failed', error: 'Command cannot be empty' };
      return;
    }
  }

  if (intent.intent === 'browser-navigate') {
    if (!slots.url || slots.url.trim() === '') {
      yield { phase: 'failed', error: 'URL cannot be empty' };
      return;
    }
  }

  if (intent.intent === 'browser-search') {
    if (!slots.query || slots.query.trim() === '') {
      yield { phase: 'failed', error: 'Search query cannot be empty' };
      return;
    }
  }

  // Terminal-read validation (terminal name is optional — falls back to focused)
  // No validation needed here

  // Yield queued status
  yield { phase: 'queued' };

  try {
    // Call appropriate action function
    let result;

    if (intent.intent === 'terminal-run') {
      result = await terminalRun(intent, controller);
      yield { phase: 'running', surfaceId: result.id };
    } else if (intent.intent === 'browser-navigate') {
      result = await browserNavigate(intent, controller);
      yield { phase: 'running', surfaceId: result.id };
    } else if (intent.intent === 'browser-search') {
      result = await browserSearch(intent, controller);
      yield { phase: 'running', surfaceId: result.id };
    } else if (intent.intent === 'terminal-read') {
      yield { phase: 'running' };
      result = await terminalRead(intent, controller);
      
      // Check for errors in the read result
      if (result.error) {
        yield { phase: 'failed', error: result.error };
        return;
      }
      
      // Yield done with the read result
      yield { phase: 'done', result };
      return;
    }

    // Yield done (for non-read actions)
    yield { phase: 'done' };
  } catch (error) {
    // Yield failed
    yield {
      phase: 'failed',
      error: error.message || 'Action failed',
    };
  }
}
