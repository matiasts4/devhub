# Launchpad — Plantilla ZED Orchestrator Pod

## ID: `zed-orchestrator-pod`

Plantilla **destacada** en `buildSwarmTemplateCatalog()` — no reemplaza las plantillas swarm existentes.

### Topología default (4 workers)

```
ZED
 ├── SDD Worker 1  (gentle-orchestrator)
 ├── SDD Worker 2
 ├── SDD Worker 3
 └── SDD Worker 4
```

El operador puede elegir **1–4 workers** en el paso Configurar del wizard.

### Defaults de launch

```json
{
  "bootstrapMode": "standby",
  "launchStrategy": "director_first",
  "sddEnabled": false,
  "workerCount": 4,
  "mission": ""
}
```

### UI en `SwarmLaunchWizardModal`

- Badge **Nuevo** en plantillas `featured: true`
- Categoría **Orquestación** (`orchestration`)
- Selector **Workers SDD** (1–4) visible solo con esta plantilla
- Copy de modo standby: los agentes no empiezan hasta que hables con ZED
- Toggle SDD del wizard **oculto** para esta plantilla (evita confusión con SDD del worker)

### Cómo lanzar

1. Swarm Control → Launch wizard
2. Elegir **ZED Orchestrator Pod**
3. Ajustar workers y ruta
4. Lanzar → 5 terminales (1 ZED + N workers) en standby
5. Conversar con ZED para delegar
