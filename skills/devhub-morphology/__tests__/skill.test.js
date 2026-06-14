/* eslint-env node, jest */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SKILL_DIR = path.join(PROJECT_ROOT, 'skills/devhub-morphology');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const GLOBAL_SKILL_PATH = path.join(
  process.env.HOME,
  '.config/opencode/skills/devhub-morphology/SKILL.md'
);
const AGENTS_PATH = path.join(PROJECT_ROOT, 'AGENTS.md');
const REGISTRY_PATH = path.join(PROJECT_ROOT, '.atl/skill-registry.md');

function readSkillFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('No frontmatter found');
  return { frontmatter: yaml.load(match[1]), body: content.slice(match[0].length) };
}

describe('devhub-morphology skill', () => {
  describe('4.1 project-local skill', () => {
    test('SKILL.md exists with valid frontmatter', () => {
      const { frontmatter } = readSkillFrontmatter(SKILL_PATH);
      expect(frontmatter.name).toBe('devhub-morphology');
      expect(frontmatter.description).toMatch(/morphology/i);
      expect(frontmatter.license).toBeDefined();
      expect(frontmatter.metadata.author).toBeDefined();
      expect(frontmatter.metadata.version).toBeDefined();
    });

    test('skill body includes morphology extension checklist and key files', () => {
      const { body } = readSkillFrontmatter(SKILL_PATH);
      expect(body).toMatch(/src\/lib\/theme\/themes\.js/);
      expect(body).toMatch(/src\/app\/globals\.css/);
      expect(body).toMatch(/src\/app\/settings\/appearance\/page\.jsx/);
      expect(body).toMatch(/src\/views\/Ajustes\.jsx/);
      expect(body).toMatch(/src\/chrome\/morphology\.js/);
      expect(body).toMatch(/checklist/i);
    });

    test('skill body documents tests and surface-specific pitfalls', () => {
      const { body } = readSkillFrontmatter(SKILL_PATH);
      expect(body).toMatch(/themes\.test\.js/);
      expect(body).toMatch(/terminal/i);
      expect(body).toMatch(/kanban/i);
      expect(body).toMatch(/pizarra/i);
      expect(body).toMatch(/hardcoded/i);
    });
  });

  describe('4.2 global installation', () => {
    test('global skill exists and matches project skill', () => {
      expect(fs.existsSync(GLOBAL_SKILL_PATH)).toBe(true);
      const projectSkill = fs.readFileSync(SKILL_PATH, 'utf8');
      const globalSkill = fs.readFileSync(GLOBAL_SKILL_PATH, 'utf8');
      expect(globalSkill).toBe(projectSkill);
    });
  });

  describe('4.3 discoverability', () => {
    test('AGENTS.md registers devhub-morphology as a project skill', () => {
      const agents = fs.readFileSync(AGENTS_PATH, 'utf8');
      expect(agents).toMatch(/devhub-morphology/);
      expect(agents).toMatch(/skills\/devhub-morphology\/SKILL\.md/);
    });

    test('local skill registry lists devhub-morphology after refresh', () => {
      expect(fs.existsSync(REGISTRY_PATH)).toBe(true);
      const registry = fs.readFileSync(REGISTRY_PATH, 'utf8');
      expect(registry).toMatch(/devhub-morphology/);
    });
  });
});
