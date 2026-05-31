import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { zedLog } from '../utils/zed-logger'

export const browserTool = {
  name: 'open_url',
  description: 'Open a URL in the browser. Writes the URL and opens the browser.',
  parameters: {
    url: { type: 'string', required: true, description: 'URL to open' },
    label: { type: 'string', description: 'Label for this URL' }
  },
  async execute(params, context) {
    const { url, label } = params
    if (!url) return { error: 'url is required' }

    zedLog.info('TOOL', 'open_url', { url, label })

    const urlFile = join(tmpdir(), 'devhub-pending-url.txt')
    writeFileSync(urlFile, JSON.stringify({ url, label: label || url, timestamp: new Date().toISOString() }))

    try {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' })
    } catch {
      // ignore
    }

    return { url, opened: true, message: `Browser opened for ${url}` }
  }
}