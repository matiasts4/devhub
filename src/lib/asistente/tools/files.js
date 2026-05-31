import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { zedLog } from '../utils/zed-logger'

export const fileTool = {
  name: 'browse_files',
  description: 'Browse and read files in the project. Shows directory structure or file content.',
  parameters: {
    action: { type: 'string', enum: ['list', 'read'], description: 'Action to perform' },
    path: { type: 'string', description: 'File or directory path' },
    limit: { type: 'number', default: 50, description: 'Max items to return' }
  },
  async execute(params, context) {
    const { action = 'list', path: targetPath = '.', limit = 50 } = params

    zedLog.info('TOOL', 'browse_files', { action, targetPath, limit })

    if (action === 'list') {
      try {
        const items = readdirSync(targetPath, { withFileTypes: true })
        return {
          items: items.slice(0, limit).map(d => ({
            name: d.name,
            type: d.isDirectory() ? 'directory' : 'file',
            path: join(targetPath, d.name)
          })),
          path: targetPath
        }
      } catch (error) {
        return { error: `Cannot list ${targetPath}: ${error.message}` }
      }
    }

    if (action === 'read') {
      try {
        const content = readFileSync(targetPath, 'utf8')
        return { content: content.slice(0, 10000), path: targetPath }
      } catch (error) {
        return { error: `Cannot read ${targetPath}: ${error.message}` }
      }
    }

    return { error: 'Invalid action. Use "list" or "read".' }
  }
}

export const reviewLogFileTool = {
  name: 'review_log_file',
  description: 'Read and analyze a log file. Returns last lines and any errors found.',
  parameters: {
    path: { type: 'string', required: true, description: 'Path to log file' },
    lines: { type: 'number', default: 100, description: 'Number of lines to read' }
  },
  async execute(params, context) {
    const { path: logPath, lines = 100 } = params

    zedLog.info('TOOL', 'review_log_file', { logPath, lines })

    try {
      const content = readFileSync(logPath, 'utf8')
      const allLines = content.split('\n')
      const lastLines = allLines.slice(-lines)
      const errors = lastLines.filter(l => l.includes('ERROR') || l.includes('error') || l.includes('Error'))

      return {
        total_lines: allLines.length,
        lines_read: lastLines.length,
        errors_found: errors.length,
        errors: errors.slice(-10),
        preview: lastLines.join('\n').slice(-2000)
      }
    } catch (error) {
      return { error: `Cannot read log ${logPath}: ${error.message}` }
    }
  }
}