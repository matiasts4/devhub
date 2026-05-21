# SwarmControl — Panel de Control del Enjambre

El SwarmControl centraliza la operacion de los agentes Worker.
Aquí puedes ver la trazabilidad de tareas, diffs de deudas técnicas, entre otros procesos asíncronos.

## Qué muestra como verdad canónica

SwarmControl NO decide estado mirando logs, terminales o paths locales. La verdad canónica para supervisión sale de un `supervisor snapshot` normalizado.

Payload esperado:

```json
{
  "supervisor_state": "recovering_orphan",
  "outcome": "recover_orphan",
  "reason_class": "stale_lease",
  "task_retry_count": 0,
  "attempt_count": 4,
  "unchanged_failure_count": 1,
  "approval_request_count": 0,
  "orphan_recovery_count": 2,
  "workspace_id": "ws-456",
  "run_id": "run-456",
  "evidence_ref": "evidence://supervisor/task-456",
  "updated_at": "2026-05-19T06:46:00.000Z"
}
```

## Cómo leerlo

- `supervisor_state`: estado visible para UI (`idle`, `dispatch_pending`, `lease_active`, `awaiting_evidence`, `retry_pending`, `blocked`, `awaiting_approval`, `recovering_orphan`, `closed`).
- `reason_class`: por qué quedó así (`approval_required`, `stale_lease`, `orphaned_run`, `dirty_excluded_observed`, etc.).
- contadores: muestran intentos, retries, aprobaciones pedidas y recuperaciones de huérfanos.
- `evidence_ref`: referencia auditable para enlazar evidencia o notificaciones.

## Qué NO debe usar la UI

- logs de terminal;
- `panelId` o session IDs locales;
- paths/worktrees/branches del ejecutor;
- mirrors observer-only como `devhub_agent_runs` para inferir truth.

Esos datos pueden existir para UX local, pero el estado que ves en SwarmControl debe salir del snapshot supervisor y nada más.
