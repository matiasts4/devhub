import fs from 'fs/promises';
import path from 'path';

/**
 * Minimal root-.gitignore matcher (no new deps).
 * Supports: blank/# comments, !negation, trailing / = dirs only, * and ** basics.
 */
export async function loadRootGitignore(rootAbs) {
  try {
    const text = await fs.readFile(path.join(rootAbs, '.gitignore'), 'utf8');
    return compileGitignore(text);
  } catch {
    return () => false;
  }
}

export function compileGitignore(text) {
  const rules = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let negated = false;
    let pattern = line;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    const dirOnly = pattern.endsWith('/');
    if (dirOnly) pattern = pattern.slice(0, -1);
    rules.push({ negated, dirOnly, re: globToRegExp(pattern) });
  }

  return (relPath, isDir) => {
    const posix = String(relPath || '').replace(/\\/g, '/');
    if (!posix) return false;
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.re.test(posix) || rule.re.test(posix.split('/').pop() || '')) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  };
}

function globToRegExp(pattern) {
  const p = pattern.replace(/\\/g, '/');
  // Escape regex specials except * and ?
  let out = '';
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  // Unanchored name patterns match any path segment / end
  if (!pattern.includes('/')) {
    return new RegExp(`(^|/)${out}(/|$)`);
  }
  return new RegExp(`^${out}(/|$)`);
}
