const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('swarm documentation alignment', () => {
  test('swarm roadmap doc distinguishes runtime layers and supervisor ownership', () => {
    const doc = read('docs/23_Swarm_Workspace_Intencion_y_Roadmap.md');

    expect(doc).toContain('workflow phase');
    expect(doc).toContain('subagent/execution profile/package');
    expect(doc).toContain('skill/capability');
    expect(doc).toContain('canonical runtime role');
    expect(doc).toContain('runtime state');
    expect(doc).toContain(
      'Do NOT reuse the current OpenCode SDD orchestrator as the persistent Swarm supervisor/control-plane'
    );
    expect(doc).toContain('DevHub-owned and long-lived');
    expect(doc).toContain('adapters/wrappers');
  });

  test('MCP protocol doc clarifies roles, SDD reuse, and DevHub-owned supervisor boundary', () => {
    const doc = read('docs/04_Protocolo_MCP_y_Agentes.md');

    expect(doc).toContain('Roles runtime canónicos');
    expect(doc).toContain('supervisor');
    expect(doc).toContain('planner');
    expect(doc).toContain('implementer');
    expect(doc).toContain('reviewer');
    expect(doc).toContain('qa');
    expect(doc).toContain('docs');
    expect(doc).toContain('researcher');
    expect(doc).toContain('reusar los assets SDD existentes');
    expect(doc).toContain('NO es el supervisor persistente del Swarm');
    expect(doc).toContain('control plane durable');
  });

  test('master guide, roadmap, and AgentHub docs point to same layering model', () => {
    const guide = read('docs/00_Guia_Maestra.md');
    const roadmap = read('docs/05_Roadmap_Fases.md');
    const agenthub = read('docs/user/05_AgentHub.md');

    expect(guide).toContain('capas de Swarm Workspace');
    expect(roadmap).toContain('SW-1.3');
    expect(roadmap).toContain('SW-4.1');
    expect(roadmap).toContain('supervisor/control plane duradero');
    expect(agenthub).toContain('fases/workflows SDD');
    expect(agenthub).toMatch(/no equivalen al supervisor persistente del Swarm/i);
  });
});
