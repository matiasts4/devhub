/**
 * QA-04 — Tests Unitarios del MCP Server
 * Suite: Operaciones Git (git_branch, git_commit, git_diff_review)
 */

import { describe, it, expect, jest } from '@jest/globals';
import { execSync } from 'child_process';

// Mock de execSync para no ejecutar git real en tests
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// --- Simulación de las git tools del MCP ---

async function gitBranchTool(params) {
  const { branch_name } = params;
  if (!branch_name) throw new Error('branch_name es requerido');
  if (!/^[a-z0-9-_/]+$/i.test(branch_name)) {
    throw new Error('branch_name contiene caracteres inválidos');
  }

  execSync(`git checkout -b ${branch_name} 2>/dev/null || git checkout ${branch_name}`);
  return { success: true, branch: branch_name };
}

async function gitCommitTool(params) {
  const { message, files } = params;
  if (!message || message.trim().length === 0) throw new Error('message es requerido');

  const filesToAdd = files || '.';
  execSync(`git add ${filesToAdd}`);
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  return { success: true, message };
}

async function gitDiffReviewTool(params) {
  const { branch, base_branch } = params;
  if (!branch) throw new Error('branch es requerido');

  const base = base_branch || 'main';
  const diff = execSync(`git diff ${base}...${branch} --stat`).toString();
  const filesChanged = diff.split('\n').filter((l) => l.includes('|')).length;

  return {
    branch,
    base_branch: base,
    files_changed: filesChanged,
    diff_summary: diff,
    has_doc_changes: diff.includes('docs/'),
    has_test_changes: diff.includes('tests/') || diff.includes('.spec.'),
  };
}

// --- Tests ---

describe('git_branch tool', () => {
  beforeEach(() => {
    execSync.mockClear();
  });

  it('crea una rama con nombre válido', async () => {
    execSync.mockReturnValue(Buffer.from('Switched to a new branch'));
    const result = await gitBranchTool({ branch_name: 'feature/qa-01-cleanup' });
    
    expect(result.success).toBe(true);
    expect(result.branch).toBe('feature/qa-01-cleanup');
    expect(execSync).toHaveBeenCalled();
  });

  it('falla si branch_name está vacío', async () => {
    await expect(gitBranchTool({ branch_name: '' })).rejects.toThrow('branch_name es requerido');
  });

  it('falla si branch_name falta', async () => {
    await expect(gitBranchTool({})).rejects.toThrow('branch_name es requerido');
  });

  it('rechaza nombres con caracteres especiales peligrosos', async () => {
    await expect(
      gitBranchTool({ branch_name: 'branch; rm -rf /' })
    ).rejects.toThrow('caracteres inválidos');
  });

  it('acepta nombres con slash (para feature branches)', async () => {
    execSync.mockReturnValue(Buffer.from(''));
    const result = await gitBranchTool({ branch_name: 'worker/task-123' });
    expect(result.success).toBe(true);
  });
});

describe('git_commit tool', () => {
  beforeEach(() => {
    execSync.mockClear();
    execSync.mockReturnValue(Buffer.from(''));
  });

  it('hace commit con mensaje válido', async () => {
    const result = await gitCommitTool({
      message: 'feat(qa): implementar tests E2E con Playwright',
      files: '.',
    });
    expect(result.success).toBe(true);
    expect(execSync).toHaveBeenCalledTimes(2); // git add + git commit
  });

  it('falla si el mensaje está vacío', async () => {
    await expect(gitCommitTool({ message: '' })).rejects.toThrow('message es requerido');
  });

  it('falla si el mensaje es solo espacios', async () => {
    await expect(gitCommitTool({ message: '   ' })).rejects.toThrow('message es requerido');
  });

  it('usa "." como archivos por defecto', async () => {
    await gitCommitTool({ message: 'fix: corrección menor' });
    const calls = execSync.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('git add .'))).toBeTruthy();
  });

  it('escapa comillas dobles en el mensaje', async () => {
    await gitCommitTool({ message: 'feat: "nueva feature" implementada' });
    const calls = execSync.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('\\"nueva feature\\"'))).toBeTruthy();
  });
});

describe('git_diff_review tool', () => {
  beforeEach(() => {
    execSync.mockClear();
  });

  it('revisa el diff de una rama contra main', async () => {
    const mockDiff = `
 src/pages/Tareas.jsx | 45 +++++++++++++-------
 docs/14_Testing.md   | 12 ++++
 tests/e2e/01.spec.ts | 30 +++++++++++++
 3 files changed, 80 insertions(+), 7 deletions(-)
    `.trim();
    execSync.mockReturnValue(Buffer.from(mockDiff));

    const result = await gitDiffReviewTool({ branch: 'feature/qa-tests', base_branch: 'main' });

    expect(result.branch).toBe('feature/qa-tests');
    expect(result.base_branch).toBe('main');
    expect(result.has_doc_changes).toBe(true);
    expect(result.has_test_changes).toBe(true);
    expect(result.files_changed).toBe(3);
  });

  it('usa "main" como base por defecto', async () => {
    execSync.mockReturnValue(Buffer.from(''));
    const result = await gitDiffReviewTool({ branch: 'feature/test' });
    expect(result.base_branch).toBe('main');
  });

  it('falla si branch está vacío', async () => {
    await expect(gitDiffReviewTool({ branch: '' })).rejects.toThrow('branch es requerido');
  });

  it('detecta cuando no hay cambios en docs', async () => {
    execSync.mockReturnValue(Buffer.from(' src/components/Button.jsx | 5 ++\n 1 file changed'));
    const result = await gitDiffReviewTool({ branch: 'hotfix/button-color' });
    expect(result.has_doc_changes).toBe(false);
  });
});
