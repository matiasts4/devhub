const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function run(command) {
  return childProcess.execSync(command, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function spawn(command, args, options = {}) {
  return childProcess.spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

describe('git versioning policy documentation', () => {
  test('policy makes executor ownership and MCP boundary explicit', () => {
    const doc = read('docs/24_Politica_Git_y_Versionado_Agentes.md');

    expect(doc).toContain('DevHub MCP es control plane');
    expect(doc).toContain(
      'Git, archivos, tests y push viven en la capability/skill del agente ejecutor'
    );
    expect(doc).toContain('Git vive en el ejecutor; DevHub MCP vive en el control plane');
    expect(doc).toContain('no volver a introducir tools Git en el DevHub MCP general');
    expect(doc).toContain('git_branch');
    expect(doc).toContain('git_commit');
    expect(doc).toContain('git_diff_review');
  });

  test('policy defines checkpoint gate, non-automatic push, and validation levels by task type', () => {
    const doc = read('docs/24_Politica_Git_y_Versionado_Agentes.md');

    expect(doc).toMatch(/al menos un commit final local/i);
    expect(doc).toMatch(/No por cada guardado/i);
    expect(doc).toMatch(/git status --short/i);
    expect(doc).toMatch(/working tree limpio/i);
    expect(doc).toMatch(/commit=none/i);
    expect(doc).toMatch(/No hacer push automático/i);
    expect(doc).toContain('Matriz de validación mínima');
    expect(doc).toContain('docs-only');
    expect(doc).toContain('código normal');
    expect(doc).toContain('terminal/desktop/UI funcional');
    expect(doc).toContain('smoke manual');
    expect(doc).toMatch(/solo cuando haga falta publicar la rama/i);
  });

  test('policy documents workspace baseline, dirty-excluded observation, and cleanup intent boundaries', () => {
    const doc = read('docs/24_Politica_Git_y_Versionado_Agentes.md');

    expect(doc).toContain('f814998dd05cb491caf8637bf570dbd74b539090');
    expect(doc).toContain('02d82361449a09e93e5880a08e35e3043617002d');
    expect(doc).toContain('4b1e344dcd202c911498af17236fcb86a2a2cb1e');
    expect(doc).toContain("observed_dirty='dirty-excluded'");
    expect(doc).toContain('cleanup_pending');
    expect(doc).toContain('evidence_ref');
    expect(doc).toMatch(/auditable|auditablez|audit trail/i);
    expect(doc).toMatch(/control plane only|control plane/i);
    expect(doc).toMatch(/nunca normalizar|no normaliza/i);
  });

  test('checkpoint gate is documented across prompts, repo guide, and MCP flow', () => {
    const promptsDoc = read('docs/09_Prompts_Maestros_Agentes.md');
    const repoGuide = read('AGENTS.md');
    const agentFlow = read('devhub-mcp/AGENT-FLOW.md');

    expect(promptsDoc).toContain('corré `git status --short`');
    expect(promptsDoc).toContain(
      '[git:checkpoint] commit=<sha|none> worktree=<clean|dirty-excluded>'
    );
    expect(promptsDoc).toContain('`commit=none` sólo es válido');
    expect(promptsDoc).toContain('No hagas push automático');

    expect(repoGuide).toContain('Git gate before `completed`/`qa-ready`');
    expect(repoGuide).toContain('git status --short');
    expect(repoGuide).toContain('`commit=none` is valid only');
    expect(repoGuide).toContain('Do not push automatically');

    expect(agentFlow).toContain('Git gate before `completed` or `qa-ready`');
    expect(agentFlow).toContain('git status --short');
    expect(agentFlow).toContain('commit=<sha|none>');
    expect(agentFlow).toContain('Do not push automatically');
    expect(agentFlow).toMatch(/server rejects|durably enforced/i);

    expect(promptsDoc).toMatch(/rechaza|enforced|durable/i);
    expect(repoGuide).toMatch(/completed unless it was verified|Git gate/i);
  });

  test('policy documents canonical hooks path and active Husky hooks', () => {
    const doc = read('docs/24_Politica_Git_y_Versionado_Agentes.md');

    expect(doc).toContain('core.hooksPath');
    expect(doc).toContain('.husky/_');
    expect(doc).toContain('.husky/pre-commit');
    expect(doc).toContain('.husky/pre-push');
    expect(doc).toMatch(/legacy|inactiv[oa]|no activo/i);
    expect(doc).toContain('.githooks/pre-commit');
    expect(doc).toContain('.githooks/pre-push');
  });

  test('repo keeps protected-branch enforcement in active Husky hooks', () => {
    const hooksPath = run('git config --local --get core.hooksPath');
    const preCommit = read('.husky/pre-commit');

    expect(hooksPath).toBe('.husky/_');
    expect(preCommit).toMatch(/main/);
    expect(preCommit).toMatch(/master/);
    expect(fs.existsSync(path.join(repoRoot, '.husky/pre-push'))).toBe(true);

    const prePush = read('.husky/pre-push');

    expect(prePush).toMatch(/refs\/heads\/main/);
    expect(prePush).toMatch(/refs\/heads\/master/);
  });

  test('active Husky hooks block commit and push to protected branches operationally', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-git-hook-'));

    try {
      childProcess.execSync('git init', { cwd: tempDir, stdio: 'ignore' });
      childProcess.execSync('git config user.email test@example.com', {
        cwd: tempDir,
        stdio: 'ignore',
      });
      childProcess.execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
      childProcess.execSync('git commit --allow-empty -m init', { cwd: tempDir, stdio: 'ignore' });
      childProcess.execSync('git branch -M main', { cwd: tempDir, stdio: 'ignore' });

      const commitResult = spawn('sh', [path.join(repoRoot, '.husky/pre-commit')], {
        cwd: tempDir,
      });

      expect(commitResult.status).toBe(1);
      expect(`${commitResult.stdout}${commitResult.stderr}`).toMatch(/commit directo/i);

      const pushResult = spawn('sh', [path.join(repoRoot, '.husky/pre-push')], {
        cwd: tempDir,
        input: 'refs/heads/task/test abc refs/heads/main def\n',
      });

      expect(pushResult.status).toBe(1);
      expect(`${pushResult.stdout}${pushResult.stderr}`).toMatch(/push directo/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('historical docs warn that legacy MCP Git tools are deprecated', () => {
    const legacyDocs = [
      'docs/13_Swarm_Autonomo_v2.md',
      'docs/14_Testing_y_Deuda_Tecnica.md',
      'docs/12_Priorizacion_Inteligente_de_Tareas.md',
    ];

    for (const relPath of legacyDocs) {
      const doc = read(relPath);

      expect(doc).toMatch(/histórico|legacy|no vigente|reemplazad[oa]|deprecated/i);
      expect(doc).toContain('24_Politica_Git_y_Versionado_Agentes.md');
    }
  });
});
