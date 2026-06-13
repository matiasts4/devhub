# Causa 4 — Base de datos corrupta por crash durante escritura WAL

## Problema

`~/.devhub/data/devhub.db` estaba en modo WAL (`journal_mode = WAL`). Cuando el runtime fue interrumpido (process killed, sistema colgado, etc.) durante una escritura activa, el WAL quedó con frames parciales. Esto dejó la DB principal con:

```
Tree 11 page 11 cell 0: invalid page number 393
Tree 11 page 390 cell 0: Rowid 49 out of order
Tree 52 page 52 cell 0: 2nd reference to page 391
```

La lógica de recovery en `src/lib/db/shared.js` hacía:

```javascript
const rowCount = db.prepare('SELECT count(*) FROM projects').get();
if (rowCount.count === 0) {
    // Copy from backup...
}
```

Esta validaba con `SELECT count(*)`, que **puede retornar 0 en una DB corrupta si la tabla projects no está en las páginas dañadas**. Una DB funcional puede tener 0 proyectos legítimamente.

La validación débil permitió que la DB corrupta (con página 393 inválida) pasara el gate y se usara como si estuviera sana.

## Síntomas

```
Error: database disk image is malformed
```

Algunos queries funcionaban (los que usaban páginas no dañadas), otros fallaban. La app mostraba 0 proyectos no por estar sana, sino porque la DB corrupta tenía sus datos en páginas inválidas que nunca se llegaban a tocar.

## Cómo se detectó

```bash
sqlite3 ~/.devhub/data/devhub.db "PRAGMA integrity_check;"
# → *** in database main ***
#    Tree 11 page 11 cell 0: invalid page number 393
#    ...
```

## Corrección

Tres capas de defensa en `src/lib/db/shared.js`:

**1. Pre-open gate (reemplaza SELECT count(*))**

```javascript
const integrity = tempDb.prepare('PRAGMA integrity_check').get();
if (integrity.integrity_check !== 'ok') {
    // → needsRecovery = true
}
```

**2. Filtro de candidatos a backup**

```javascript
for (const backup of candidates) {
    const probe = new Database(backup.path, { readonly: true });
    const ic = probe.prepare('PRAGMA integrity_check').get();
    probe.close();
    if (ic.integrity_check !== 'ok') continue; // Skip corrupt backups
    // Only non-corrupt backups are considered
}
```

**3. Post-schema safety net (antes de exponer el handle)**

```javascript
const postSchemaIntegrity = _db.prepare('PRAGMA integrity_check').get();
if (postSchemaIntegrity.integrity_check !== 'ok') {
    _db.close();
    fs.unlinkSync(DB_PATH);
    fs.unlinkSync(DB_PATH + '-wal');
    fs.unlinkSync(DB_PATH + '-shm');
    // Recreate fresh DB + reapply schema + PRAGMAs
}
```

## Estado de la DB después de la corrección

La DB restaurada `devhub.db.pre-restore` tenía `integrity_check = ok` pero **0 proyectos** — la copia de respaldo limpia no los contenía. Los 3 proyectos originales solo existían en `devhub.db.corrupt.1780012401`, que estaba corrupta y no era recuperable.

## Verificación

```bash
node ./node_modules/jest/bin/jest.js src/lib/db/shared-integrity.test.js --no-coverage
# PASS — 10/10 tests
```

涵盖场景:
- DB sana → pre-open gate pasa, no recovery
- DB corrupta → pre-open gate rechaza, trigger recovery
- Backup corrupto → rechazado en el scan, no copiado
- DB corrupta post-schema → safety net la detecta y resetea
- DB pre-restore corrupta → rechazada en recovery

## Archivo

- `src/lib/db/shared.js`
- `src/lib/db/shared-integrity.test.js` (nuevo, 10 tests)