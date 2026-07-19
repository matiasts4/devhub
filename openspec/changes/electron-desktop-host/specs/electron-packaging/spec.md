# Capability: electron-packaging

## Purpose

Package DevHub with electron-builder (NSIS on Windows), spawn Next standalone + sidecar, and keep Tauri packaging available for rollback.

## ADDED Requirements

### Requirement: Dual packaging scripts

The repo MUST expose npm scripts for Electron dev/build without removing Tauri scripts in phase 1.

#### Scenario: Scripts coexist

- **GIVEN** a clean checkout with dependencies installed
- **WHEN** a developer inspects `package.json` scripts
- **THEN** both `electron:dev` (or equivalent) and `tauri:dev` MUST exist
- **AND** `src-tauri` MUST remain buildable

### Requirement: Resource layout

Packaged Electron builds MUST locate standalone server assets and sidecar entry consistently (env overrides allowed). Extract/update of `standalone.zip` MUST be defined by E1; E0 MAY use external `next dev` / prebuilt standalone.

#### Scenario: Packaged spawn (E1+)

- **GIVEN** an installed Electron build
- **WHEN** the app starts
- **THEN** main MUST start or attach to the Node sidecar and UI origin
- **AND** paths MUST work from the installed layout (not only repo root)

### Requirement: Installer smoke

E4/E1 smoke MUST include: install/launch, open window, sidecar health, one terminal session, one native browser open.

#### Scenario: Smoke checklist

- **GIVEN** a CI or local smoke script
- **WHEN** it runs against a built artifact (or E0 dev host)
- **THEN** it MUST report pass/fail per step without manual guesswork

### Requirement: Rollback packaging

Until Electron is declared primary and verified, Tauri NSIS/build pipeline MUST remain documented and functional.

#### Scenario: Emergency Tauri ship

- **GIVEN** Electron regression blocks release
- **WHEN** release managers run existing Tauri build
- **THEN** they MUST produce a shippable artifact without needing deleted `src-tauri` sources
