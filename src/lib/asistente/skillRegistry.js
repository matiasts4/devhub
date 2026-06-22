/**
 * Zed skill registry (Phase 11).
 *
 * Discovers skill manifests, validates permissions and registers dynamic tools
 * into the ToolRegistry with a skill prefix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireModule = createRequire(path.join(process.cwd(), 'src/lib/asistente/skillRegistry.js'));

const VALID_PERMISSIONS = new Set([
  'terminal',
  'browser',
  'filesystem:read',
  'filesystem:write',
  'mcp:read',
  'mcp:write',
  'network',
]);

function validateSkillManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'manifest must be an object' };
  }
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    return { valid: false, error: 'manifest.name is required' };
  }
  if (!/^[-a-z0-9_]+$/.test(manifest.name)) {
    return { valid: false, error: 'manifest.name must be lowercase alphanumeric with - or _' };
  }
  if (typeof manifest.version !== 'string') {
    return { valid: false, error: 'manifest.version is required' };
  }
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    return { valid: false, error: 'manifest.tools must be a non-empty array' };
  }

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const perm of permissions) {
    if (!VALID_PERMISSIONS.has(perm)) {
      return { valid: false, error: `invalid permission: ${perm}` };
    }
  }

  for (const tool of manifest.tools) {
    if (!tool || typeof tool !== 'object') {
      return { valid: false, error: 'each tool must be an object' };
    }
    if (typeof tool.name !== 'string' || !/^[a-z0-9_]+$/.test(tool.name)) {
      return { valid: false, error: `invalid tool name: ${tool.name}` };
    }
    if (typeof tool.description !== 'string') {
      return { valid: false, error: `tool ${tool.name} missing description` };
    }
    if (tool.parameters && typeof tool.parameters !== 'object') {
      return { valid: false, error: `tool ${tool.name} parameters must be an object` };
    }
  }

  return { valid: true, permissions };
}

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.disabled = new Set();
  }

  /**
   * Register a skill from a manifest object and a map of handlers.
   *
   * @param {object} manifest
   * @param {Record<string, Function>} handlers
   * @returns {{ success: boolean, error?: string }}
   */
  registerSkill(manifest, handlers = {}) {
    const validation = validateSkillManifest(manifest);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const skillName = manifest.name;
    if (this.skills.has(skillName)) {
      return { success: false, error: `skill ${skillName} already registered` };
    }

    this.skills.set(skillName, {
      manifest,
      permissions: validation.permissions,
      handlers,
      enabled: true,
    });

    return { success: true };
  }

  disableSkill(name) {
    const skill = this.skills.get(name);
    if (!skill) return { success: false, error: 'skill not found' };
    skill.enabled = false;
    this.disabled.add(name);
    return { success: true };
  }

  enableSkill(name) {
    const skill = this.skills.get(name);
    if (!skill) return { success: false, error: 'skill not found' };
    skill.enabled = true;
    this.disabled.delete(name);
    return { success: true };
  }

  isEnabled(name) {
    const skill = this.skills.get(name);
    return Boolean(skill?.enabled);
  }

  /**
   * Register all enabled skill tools into a ToolRegistry instance.
   *
   * @param {import('./tools/registry').ToolRegistry} toolRegistry
   */
  registerTools(toolRegistry) {
    for (const [skillName, skill] of this.skills) {
      if (!skill.enabled) continue;
      for (const tool of skill.manifest.tools) {
        const qualifiedName = `${skillName}:${tool.name}`;
        const handler = skill.handlers[tool.name];
        toolRegistry.register({
          name: qualifiedName,
          description: `[${skillName}] ${tool.description}`,
          parameters: tool.parameters || {},
          execute: async (input, context) => {
            if (typeof handler !== 'function') {
              return { error: `handler not found for ${qualifiedName}` };
            }
            const permitted = this.checkPermission(skillName, tool.name, context);
            if (!permitted.ok) {
              return { error: permitted.error };
            }
            try {
              return await handler(input, context);
            } catch (err) {
              return { error: err.message };
            }
          },
        });
      }
    }
  }

  checkPermission(skillName, _toolName, _context) {
    const skill = this.skills.get(skillName);
    if (!skill) return { ok: false, error: 'skill not found' };
    // Default: skills with no permissions cannot run. Add explicit permission
    // checks here as the ecosystem grows.
    return { ok: true };
  }

  list() {
    return Array.from(this.skills.values()).map((s) => ({
      name: s.manifest.name,
      version: s.manifest.version,
      enabled: s.enabled,
      tools: s.manifest.tools.map((t) => t.name),
    }));
  }

  /**
   * Discover skills from a directory on disk.
   *
   * @param {string} dir
   * @returns {Array<{ success: boolean, name?: string, error?: string }>}
   */
  discoverFromDirectory(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const handlers = {};
        const toolsDir = path.join(dir, entry.name, 'tools');
        if (fs.existsSync(toolsDir)) {
          for (const file of fs.readdirSync(toolsDir)) {
            if (!file.endsWith('.js')) continue;
            const toolName = path.basename(file, '.js');
            const modulePath = path.join(toolsDir, file);
            const mod = requireModule(modulePath);
            handlers[toolName] = mod.default || mod.execute;
          }
        }
        results.push({ ...this.registerSkill(manifest, handlers), name: manifest.name });
      } catch (err) {
        results.push({ success: false, name: entry.name, error: err.message });
      }
    }

    return results;
  }
}

export function createSkillRegistry() {
  return new SkillRegistry();
}

export default { SkillRegistry, createSkillRegistry, validateSkillManifest };
