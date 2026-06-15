# Spec: devhub-morphology-skill

> **Source of truth**: promoted from `openspec/changes/cursor-morphology/specs/cursor-morphology/spec.md` (R10–R11) on 2026-06-14 (archive of `cursor-morphology`).
> **Status**: active. Owned by DevHub platform skills team.
> **Origin**: `cursor-morphology` Slice D.

## Purpose

Capture the workflow of adding a morphology to DevHub in a reusable agent skill (`devhub-morphology`), installed at both project (`skills/devhub-morphology/SKILL.md`) and global (`~/.config/opencode/skills/devhub-morphology/SKILL.md`) locations and registered in `AGENTS.md` and `.atl/skill-registry.md`. The skill MUST provide a registry-file map, the list of token variables, factory usage pointers, a morphology-extension checklist, and a description of common pitfalls so future agents can extend the system without relearning it.

## Requirements

### Requirement: Project-local skill file

The system MUST ship a `skills/devhub-morphology/SKILL.md` file with valid YAML frontmatter and a complete body that documents the morphology registry files, the `--chrome-*` token variables, the chrome factory entry points in `src/chrome/morphology.js`, and a morphology-extension checklist.

**Files**: `skills/devhub-morphology/SKILL.md`

#### Scenario: Skill is complete and readable

- GIVEN the skill file exists
- WHEN an agent reads it
- THEN the file has valid YAML frontmatter
- AND the body includes a checklist for adding a morphology
- AND the body documents the registry files, token variables, factory usage, and surface-specific pitfalls

---

### Requirement: Global installation and valid frontmatter

The system MUST install the `devhub-morphology` skill at `~/.config/opencode/skills/devhub-morphology/SKILL.md` with valid YAML frontmatter, and MUST register the skill in `AGENTS.md` and the local `.atl/skill-registry.md` so OpenCode loads it and downstream agents can find it.

**Files**: `~/.config/opencode/skills/devhub-morphology/SKILL.md`, `AGENTS.md`, `.atl/skill-registry.md`

#### Scenario: Skill is discoverable globally

- GIVEN OpenCode loads skills on startup
- WHEN it scans `~/.config/opencode/skills/`
- THEN `devhub-morphology` appears with valid frontmatter

#### Scenario: Skill is registered in project metadata

- GIVEN an agent searches `.atl/skill-registry.md` or reads `AGENTS.md`
- THEN `devhub-morphology` is listed with a project-local path and a clear trigger description
