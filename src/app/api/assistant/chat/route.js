import { NextResponse } from 'next/server'
import { ToolRegistry } from '@/lib/asistente/tools/registry'
import { terminalTool } from '@/lib/asistente/tools/terminal'
import { browserTool } from '@/lib/asistente/tools/browser'
import { delegationTool } from '@/lib/asistente/tools/delegation'
import { fileTool } from '@/lib/asistente/tools/files'
import { swarmTool } from '@/lib/asistente/tools/swarm'
import { zedLog } from '@/lib/asistente/utils/zed-logger'

const MODEL = 'minimax-coding-plan/MiniMax-M2.7'
const BASE_URL = 'https://api.minimax.io/anthropic/v1/messages'
const MAX_TURNS = 3

async function buildZedSystemPrompt() {
  return `You are Zed, a senior architect with 15+ years experience, GDE and MVP. You are helpful, direct, and focused on concepts over code.

IMPORTANT: When the user asks you to do something that requires action (like opening a terminal, opening a URL, etc.), you MUST respond with a tool call in this exact format on a NEW LINE:

TOOL: open_terminal
PARAM: command=npm run dev
PARAM: cwd=/home/matias/ArxonLabs/devhub

Available tools:
- open_terminal: Opens a terminal session and runs a command
  Usage: TOOL: open_terminal\nPARAM: command=ls\nPARAM: cwd=/path
- open_url: Opens a URL in the browser
  Usage: TOOL: open_url\nPARAM: url=https://...
- delegate_to_opencode: Delegates a task to an OpenCode agent
- browse_files: Lists or reads files

Always match the user's language. If the user writes in Spanish, respond in Spanish.

Never include tool calls in your spoken response — only write them on separate lines when you need to take action.`
}

async function callMinimax({ model, maxTokens, system, messages, apiKey }) {
  const body = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  }

  const start = Date.now()
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  const duration = Date.now() - start

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`MiniMax API error ${response.status}: ${errText}`)
  }

  const data = await response.json()
  zedLog.info('API', `MiniMax response (${duration}ms)`, { contentTypes: data.content?.map(b => b.type) || [] })
  return data
}

function parseToolCalls(text) {
  // Parse tool calls from text response:
  // TOOL: open_terminal
  // PARAM: command=ls
  // PARAM: cwd=/path
  const calls = []
  const lines = text.split('\n')
  let currentTool = null
  let params = {}

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('TOOL:') || trimmed.startsWith('TOOL ')) {
      // Save previous tool if exists
      if (currentTool && Object.keys(params).length > 0) {
        calls.push({ name: currentTool, input: params })
      }
      // Start new tool
      const toolName = trimmed.split(/[:\s]+/).filter(Boolean)[1] || trimmed.split(/[:\s]+/)[0]
      if (['open_terminal', 'open_url', 'delegate_to_opencode', 'browse_files', 'get_swarm_status', 'execute_in_terminal', 'list_terminals', 'review_terminal_output'].includes(toolName)) {
        currentTool = toolName
        params = {}
      } else {
        currentTool = null
      }
    } else if (trimmed.startsWith('PARAM:') || trimmed.startsWith('PARAM ')) {
      if (currentTool) {
        const parts = trimmed.split(/[:\s]+/).slice(1).join('=').split('=')
        if (parts.length >= 2) {
          const key = parts[0].trim()
          const value = parts.slice(1).join('=').trim()
          if (key) params[key] = value
        }
      }
    }
  }

  // Don't forget the last tool
  if (currentTool && Object.keys(params).length > 0) {
    calls.push({ name: currentTool, input: params })
  }

  return calls
}

export async function POST(request) {
  const msgId = Date.now().toString(36)

  try {
    const { message, context = {} } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    zedLog.sessionStart(msgId, message)

    const registry = new ToolRegistry()
    registry.register(terminalTool)
    registry.register(browserTool)
    registry.register(delegationTool)
    registry.register(fileTool)
    registry.register(swarmTool)

    const systemPrompt = await buildZedSystemPrompt()
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.MINIMAX_API_KEY

    if (!apiKey) {
      zedLog.error('CONFIG', 'No API key configured')
      return NextResponse.json({ error: 'No API key configured' }, { status: 500 })
    }

    const conversation = [{ role: 'user', content: message }]
    let turn = 0
    let finalText = ''
    let allToolResults = []

    while (turn < MAX_TURNS) {
      turn++
      zedLog.info('TURN', `Starting turn ${turn}`, { conversationLength: conversation.length })

      const data = await callMinimax({
        model: MODEL,
        maxTokens: 2048,
        system: systemPrompt,
        messages: conversation,
        apiKey,
      })

      if (!data.content || !Array.isArray(data.content)) {
        zedLog.error('API', 'No content in response', { data: JSON.stringify(data).slice(0, 300) })
        finalText = 'No pude procesar tu mensaje. Error interno.'
        break
      }

      const textBlocks = data.content.filter(b => b.type === 'text')
      const thinkingBlocks = data.content.filter(b => b.type === 'thinking')
      const rawText = textBlocks.map(b => b.text).join('\n')

      zedLog.info('MODEL', `Raw response text (${rawText.length} chars)`, { preview: rawText.slice(0, 300) })

      // Try to parse tool calls from text
      const toolCalls = parseToolCalls(rawText)

      if (toolCalls.length > 0) {
        zedLog.info('MODEL', `Found ${toolCalls.length} tool call(s) in text`, { toolCalls })

        for (const { name, input } of toolCalls) {
          const toolStart = Date.now()
          zedLog.toolCall(name, input)

          let result
          try {
            result = await registry.execute(name, input, context)
          } catch (err) {
            result = { error: err.message }
          }

          const duration = Date.now() - toolStart
          zedLog.toolResult(name, result, duration)
          allToolResults.push({ tool: name, input, result })
        }

        // Add model's response to conversation
        conversation.push({ role: 'assistant', content: rawText })

        // Add tool results as a user message
        conversation.push({
          role: 'user',
          content: allToolResults.map(r => `Tool ${r.tool} result: ${JSON.stringify(r.result)}`).join('\n'),
        })

        // Continue for another turn to let model respond to tool results
      } else {
        // No tool calls — this is the final response
        finalText = rawText
        if (!finalText.trim() && thinkingBlocks.length > 0) {
          finalText = '(El modelo está razonando, aún no tiene respuesta final...)'
        }
        break
      }
    }

    zedLog.sessionEnd(msgId, finalText, allToolResults.length)

    return NextResponse.json({
      text: finalText,
      tool_results: allToolResults,
      model: MODEL,
      msgId,
    })
  } catch (error) {
    zedLog.error('FATAL', 'Unhandled exception', { error: error.message, stack: error.stack })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'