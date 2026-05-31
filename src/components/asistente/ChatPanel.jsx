'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Loader2, Square, TerminalSquare, Globe, FileText, Users } from 'lucide-react'

function ChatMessage({ role, content, timestamp }) {
  const isZed = role === 'zed' || role === 'assistant'
  return (
    <div className={`flex ${isZed ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] ${
          isZed
            ? 'bg-[var(--surface-muted)] border border-[var(--border-subtle)]'
            : 'bg-[var(--accent-primary)] text-white'
        }`}
        style={isZed ? { color: 'var(--text-primary)' } : {}}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        <p className={`text-[10px] mt-1 ${isZed ? 'text-[var(--text-muted)]' : 'text-white/60'}`}>
          {timestamp ? new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
      </div>
    </div>
  )
}

function ToolBadge({ toolName, result }) {
  const colors = {
    open_terminal: 'text-blue-400 border-blue-400/30',
    open_url: 'text-green-400 border-green-400/30',
    delegate_to_opencode: 'text-purple-400 border-purple-400/30',
    browse_files: 'text-yellow-400 border-yellow-400/30',
    get_swarm_status: 'text-orange-400 border-orange-400/30',
  }
  const icons = {
    open_terminal: TerminalSquare,
    open_url: Globe,
    delegate_to_opencode: Users,
    browse_files: FileText,
    get_swarm_status: Users,
  }
  const Icon = icons[toolName] || TerminalSquare
  const colorClass = colors[toolName] || 'text-[var(--text-muted)] border-[var(--border-subtle)]'

  // Dispatch event to open terminal in workspace when open_terminal tool succeeds
  if (toolName === 'open_terminal' && result && !result.error) {
    try {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result
      if (parsed.command) {
        window.dispatchEvent(new CustomEvent('devhub:zed-open-terminal', {
          detail: { command: parsed.command, cwd: parsed.cwd || null }
        }))
      }
    } catch {}
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-hover)] border ${colorClass}`}>
      <Icon className="w-3 h-3" />
      {toolName}
    </span>
  )
}

export default function ChatPanel({ className = '' }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola, soy Zed. ¿En qué te puedo ayudar?', timestamp: new Date().toISOString() }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [abortController, setAbortController] = useState(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date().toISOString() }])

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, context: {} }),
      })

      const data = await response.json()

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || 'No pude procesar tu mensaje.',
        timestamp: new Date().toISOString(),
        tool_results: data.tool_results
      }])
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString()
      }])
    } finally {
      setIsLoading(false)
      setTimeout(scrollToBottom, 100)
    }
  }, [input, isLoading, scrollToBottom])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleStop = useCallback(() => {
    abortController?.abort()
    setIsLoading(false)
  }, [abortController])

  // Auto-resize textarea
  const updateTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-sm">Z</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Zed</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Asistente</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i}>
            <ChatMessage role={msg.role} content={msg.content} timestamp={msg.timestamp} />
            {msg.tool_results?.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {msg.tool_results.map((r, j) => (
                  <ToolBadge key={j} toolName={r.tool} result={r.result} />
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Zed está escribiendo...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setTimeout(updateTextareaHeight, 0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribile a Zed..."
            rows={1}
            className="flex-1 bg-[var(--surface-muted)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[var(--accent-primary)] resize-none"
            style={{ color: 'var(--text-primary)', maxHeight: '120px' }}
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--danger,#ef4444)] text-white"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--accent-primary)] text-white disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}