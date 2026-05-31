import fs from 'fs'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
const ZED_LOG_FILE = path.join(LOG_DIR, 'zed-assistant.log')
const ZED_JSON_FILE = path.join(LOG_DIR, `zed-chat-${new Date().toISOString().slice(0, 10)}.log`)

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function rotateLogIfNeeded() {
  try {
    const stats = fs.existsSync(ZED_JSON_FILE) ? fs.statSync(ZED_JSON_FILE) : null
    if (stats && stats.size > MAX_LOG_SIZE) {
      const archivePath = ZED_JSON_FILE.replace('.log', `-${Date.now()}.log`)
      fs.renameSync(ZED_JSON_FILE, archivePath)
    }
  } catch (err) {
    // ignore
  }
}

// Human-readable log line for Zed assistant
function writeZedLog(message) {
  try {
    ensureLogDir()
    rotateLogIfNeeded()
    const timestamp = new Date().toLocaleString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    })
    const line = `[${timestamp}] ${message}\n`
    fs.appendFileSync(ZED_LOG_FILE, line)
  } catch (err) {
    // ignore
  }
}

// JSON log for machine reading
function writeJsonLog(entry) {
  try {
    ensureLogDir()
    rotateLogIfNeeded()
    const line = JSON.stringify(entry) + '\n'
    fs.appendFileSync(ZED_JSON_FILE, line)
  } catch (err) {
    // ignore
  }
}

export const zedLog = {
  info(category, message, data) {
    const entry = { timestamp: new Date().toISOString(), level: 'INFO', category, message, ...(data ? { data } : {}) }
    writeJsonLog(entry)
    writeZedLog(`[INFO] [${category}] ${message}${data ? ' → ' + JSON.stringify(data) : ''}`)
  },

  warn(category, message, data) {
    const entry = { timestamp: new Date().toISOString(), level: 'WARN', category, message, ...(data ? { data } : {}) }
    writeJsonLog(entry)
    writeZedLog(`[WARN] [${category}] ${message}${data ? ' → ' + JSON.stringify(data) : ''}`)
  },

  error(category, message, data) {
    const entry = { timestamp: new Date().toISOString(), level: 'ERROR', category, message, ...(data ? { data } : {}) }
    writeJsonLog(entry)
    writeZedLog(`[ERROR] [${category}] ${message}${data ? ' → ' + JSON.stringify(data) : ''}`)
  },

  debug(category, message, data) {
    const entry = { timestamp: new Date().toISOString(), level: 'DEBUG', category, message, ...(data ? { data } : {}) }
    writeJsonLog(entry)
    writeZedLog(`[DEBUG] [${category}] ${message}${data ? ' → ' + JSON.stringify(data) : ''}`)
  },

  // Session start
  sessionStart(messageId, userMessage) {
    writeZedLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    writeZedLog(`NUEVA INTERACCIÓN [${messageId}]`)
    writeZedLog(`Usuario: "${userMessage.slice(0, 100)}${userMessage.length > 100 ? '...' : ''}"`)
    writeZedLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  },

  // Session end
  sessionEnd(messageId, finalText, toolCount) {
    writeZedLog(`→ Respuesta final (${finalText.length} chars): "${finalText.slice(0, 150)}${finalText.length > 150 ? '...' : ''}"`)
    writeZedLog(`→ Tools ejecutados: ${toolCount}`)
    writeZedLog(`FIN DE INTERACCIÓN [${messageId}]`)
    writeZedLog('')
  },

  // Tool call
  toolCall(toolName, params) {
    writeZedLog(`  ┌─ TOOL CALL: ${toolName}`)
    if (params && Object.keys(params).length > 0) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          const display = typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '...' : String(v)
          writeZedLog(`  │   ${k}: ${display}`)
        }
      }
    }
  },

  // Tool result
  toolResult(toolName, result, duration) {
    const success = !result?.error
    const icon = success ? '✓' : '✗'
    writeZedLog(`  ${icon}─ TOOL RESULT [${toolName}] (${duration}ms)`)
    if (result?.error) {
      writeZedLog(`    ERROR: ${result.error}`)
    } else if (result?.message) {
      writeZedLog(`    → ${result.message}`)
    } else if (result) {
      const preview = JSON.stringify(result).slice(0, 200)
      writeZedLog(`    → ${preview}${JSON.stringify(result).length > 200 ? '...' : ''}`)
    }
  },

  // API response
  apiResponse(duration, contentTypes, hasText, hasThinking, hasToolUse) {
    writeZedLog(`  └─ API Response (${duration}ms): blocks=[${contentTypes.join(', ')}] text=${hasText} thinking=${hasThinking} tool_use=${hasToolUse}`)
  },

  // Read recent lines from the readable log
  readZedLog(lines = 200) {
    try {
      ensureLogDir()
      if (!fs.existsSync(ZED_LOG_FILE)) {
        return { entries: [], total: 0 }
      }
      const content = fs.readFileSync(ZED_LOG_FILE, 'utf-8')
      const allLines = content.split('\n').filter(l => l.trim())
      return {
        entries: allLines.slice(-lines),
        total: allLines.length,
      }
    } catch (err) {
      return { error: err.message, entries: [] }
    }
  },

  // List log files
  listLogs() {
    try {
      ensureLogDir()
      return fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('zed-') || f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(LOG_DIR, f)
          const stats = fs.statSync(filePath)
          return { name: f, size: formatSize(stats.size), modified: stats.mtime.toISOString() }
        })
        .sort((a, b) => b.modified.localeCompare(a.modified))
    } catch (err) {
      return []
    }
  },

  // Read JSON log
  readJsonLog(lines = 100) {
    try {
      ensureLogDir()
      if (!fs.existsSync(ZED_JSON_FILE)) {
        return { entries: [], total: 0 }
      }
      const content = fs.readFileSync(ZED_JSON_FILE, 'utf-8')
      const allLines = content.split('\n').filter(l => l.trim())
      const recent = allLines.slice(-lines)
      return {
        file: path.basename(ZED_JSON_FILE),
        total: allLines.length,
        returned: recent.length,
        entries: recent.map(l => {
          try { return JSON.parse(l) } catch { return { raw: l } }
        }),
      }
    } catch (err) {
      return { error: err.message, entries: [] }
    }
  },
}

export default zedLog