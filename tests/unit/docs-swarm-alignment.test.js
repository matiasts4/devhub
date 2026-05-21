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

  test('swarm docs freeze workspace instrumentation and dirty-excluded semantics', () => {
    const roadmap = read('docs/23_Swarm_Workspace_Intencion_y_Roadmap.md');
    const orchestration = read('docs/08_Enjambre_Agentes_y_Orquestacion.md');
    const agenthub = read('docs/user/05_AgentHub.md');

    expect(roadmap).toContain('f814998dd05cb491caf8637bf570dbd74b539090');
    expect(roadmap).toContain("observed_dirty='dirty-excluded'");
    expect(roadmap).toContain('cleanup_pending');
    expect(roadmap).toContain('SW-2.2 sigue bloqueado');
    expect(roadmap).toContain('SW-3.1 puede consumir `evidence_ref`');

    expect(orchestration).toContain('`agent_workspaces`');
    expect(orchestration).toContain('observer-only');
    expect(orchestration).toContain('cleanup_pending');

    expect(agenthub).toContain('agent_workspaces');
    expect(agenthub).toContain('observer-only');
    expect(agenthub).toContain('cleanup intent');
  });

  test('workspace docs align executor ownership, frozen checkpoints, and auditable evidence refs', () => {
    const database = read('docs/03_Esquema_BaseDatos.md');
    const protocol = read('docs/04_Protocolo_MCP_y_Agentes.md');
    const roadmap = read('docs/23_Swarm_Workspace_Intencion_y_Roadmap.md');
    const agenthub = read('docs/user/05_AgentHub.md');

    expect(database).toContain('El ejecutor sigue siendo dueño de Git/worktree real');
    expect(database).toContain('workspace_id + correlation_id');
    expect(database).toContain('auditables');

    expect(protocol).toContain('prepare_agent_workspace');
    expect(protocol).toContain('report_agent_workspace');
    expect(protocol).toContain('02d82361449a09e93e5880a08e35e3043617002d');
    expect(protocol).toContain('4b1e344dcd202c911498af17236fcb86a2a2cb1e');

    expect(roadmap).toContain('Telegram, Control Room y Supervisor Loop');
    expect(roadmap).toContain('workspace_status');
    expect(roadmap).toContain('sin mostrar verbos Git');

    expect(agenthub).toContain('workspace_status');
    expect(agenthub).toContain('evidence_ref');
    expect(agenthub).toContain('oculta verbos Git');
  });
});
