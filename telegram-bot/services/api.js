const NEXT_JS_URL = process.env.NEXT_JS_URL || 'http://127.0.0.1:3400';

async function api(path, options = {}, retries = 2) {
  const url = `${NEXT_JS_URL}${path}`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${body ? ' — ' + body : ''}`);
      }

      return await response.json();
    } catch (err) {
      if (attempt === retries) throw err;
      // Wait before retrying (exponential backoff: 1s, 2s)
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}

module.exports = {
  // Verify Next.js is running
  async health() {
    await api('/api/db/query?table=projects&limit=1');
    return true;
  },

  // List available Gemini CLI profiles
  async getProfiles() {
    return api('/api/agents/profiles');
  },

  // List active OpenCode sessions
  async getSessions() {
    return api('/api/opencode/sessions');
  },

  // Prepare agent execution (assign task, create git branch)
  async executeAgent({ taskId, agentId, llmProvider = 'gemini', llmModel = 'default' }) {
    return api('/api/agent/execute', {
      method: 'POST',
      body: JSON.stringify({
        task_id: taskId,
        agent_id: agentId,
        llm_provider: llmProvider,
        llm_model: llmModel,
      }),
    });
  },

  // Build complete prompt for a task
  async buildPrompt({ taskId, agentId }) {
    return api('/api/agent/prompt-builder', {
      method: 'POST',
      body: JSON.stringify({
        task_id: taskId,
        agent_id: agentId,
      }),
    });
  },

  // Launch OpenCode agent (spawn detached process)
  async launchAgent({ task, profileName, projectId }) {
    return api('/api/agents/launch', {
      method: 'POST',
      body: JSON.stringify({
        task,
        profileName,
        projectId,
      }),
    });
  },

  // Process QA result
  async qaResult({ taskId, result, reasons, branchName }) {
    return api('/api/agent/qa-result', {
      method: 'POST',
      body: JSON.stringify({
        task_id: taskId,
        result,
        reasons,
        branch_name: branchName,
      }),
    });
  },
};
