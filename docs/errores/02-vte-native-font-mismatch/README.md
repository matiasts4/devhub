# 02 — VTE nativa se veía distinta a la terminal del sistema

## Resumen

En Linux, la terminal embebida de DevHub usando **GTK/VTE nativa** se veía ligeramente más ancha o más “aireada” que una terminal normal del sistema, aun cuando visualmente parecía estar usando la misma familia tipográfica.

La solución correcta fue **anclar la VTE nativa a la fuente monospace real configurada en el equipo**, en vez de dejar la resolución de fuente implícita o forzar una fuente hardcodeada.

---

## Estado final

| Verificación | Estado |
|---|---|
| VTE nativa usa la fuente monospace del sistema | ✅ |
| No queda una fuente hardcodeada en la ruta nativa | ✅ |
| Kali resuelve `monospace-font-name` a `Fira Code Medium 10` | ✅ |
| `native_vte.rs` válido según `rustfmt --check` | ✅ |
| Diferencia visual corregida en la terminal nativa | ✅ |

---

## Síntoma original

- OpenCode dentro de DevHub se veía “un poco más ancho” o con más separación que la terminal normal del sistema.
- La diferencia era sutil, no una rotura total.
- El problema reportado estaba ocurriendo en **VTE nativa**, no en `xterm`.

---

## Qué no era

Durante la investigación se confirmó que el ajuste previo en `xterm` **no podía explicar** lo que el usuario veía en la terminal nativa.

Motivo:

- cuando DevHub entra en renderer nativo, el viewport visible de `xterm` deja de ser la superficie principal;
- la ruta nativa se construía con `Terminal::new()` y tema de colores, pero **sin fijar la fuente explícitamente**.

Conclusión: si el usuario estaba viendo la VTE nativa, el problema restante no venía del fallback `xterm`.

---

## Causa raíz

En `src-tauri/src/native_vte.rs`, la terminal nativa se creaba así:

```rust
let terminal = Terminal::new();
terminal.set_rewrap_on_resize(true);
apply_native_terminal_theme(&terminal);
```

Eso implicaba:

- colores y tema sí estaban definidos;
- la fuente **no**;
- VTE resolvía su tipografía por comportamiento implícito de GTK/VTE.

En esta máquina eso no estaba quedando idéntico a la terminal externa, aunque visualmente pareciera “la misma fuente”.

La diferencia real no era “cambiamos de JetBrains a otra fuente” dentro de VTE, sino que **faltaba fijar explícitamente la fuente monospace del sistema para que la métrica coincidiera exactamente**.

---

## Intento fallido que se descartó

Antes del fix final se probó un override manual de fuente en VTE.

Ese enfoque se descartó porque:

- metía una fuente hardcodeada;
- empeoró mucho el spacing de caracteres;
- no respetaba la configuración real del equipo.

Aprendizaje: en esta ruta nativa **no conviene forzar una fuente “parecida”**. Conviene leer la del sistema y aplicar esa exacta.

---

## Solución final

Se agregó una resolución explícita de la fuente monospace del sistema desde:

- schema: `org.gnome.desktop.interface`
- key: `monospace-font-name`

Luego esa string se transforma a `pango::FontDescription` y se aplica directamente a la VTE:

```rust
fn resolve_native_system_monospace_font() -> Option<pango::FontDescription> {
    let font_name = gio::Settings::new("org.gnome.desktop.interface")
        .string("monospace-font-name")
        .trim()
        .to_string();

    if font_name.is_empty() {
        return None;
    }

    Some(pango::FontDescription::from_string(&font_name))
}
```

Y en la creación del terminal:

```rust
if let Some(system_font) = resolve_native_system_monospace_font() {
    terminal.set_font(Some(&system_font));
}
```

Resultado:

- DevHub ya no “adivina” la fuente;
- VTE usa la misma configuración monospace del escritorio;
- en Kali quedó anclado a `Fira Code Medium 10`, que era la fuente real del sistema.

---

## Archivo modificado

- `src-tauri/src/native_vte.rs`

---

## Verificación

### 1. Confirmar la fuente monospace del sistema

```bash
gsettings get org.gnome.desktop.interface monospace-font-name
# → 'Fira Code Medium 10'
```

### 2. Confirmar que la VTE nativa usa esa fuente explícitamente

Buscar en `src-tauri/src/native_vte.rs`:

- `resolve_native_system_monospace_font()`
- `terminal.set_font(Some(&system_font))`

### 3. Validación sintáctica del archivo

```bash
rustfmt --check src-tauri/src/native_vte.rs
```

### 4. Verificación visual manual

- abrir DevHub;
- abrir una terminal en modo VTE nativa;
- comparar contra una terminal externa del sistema;
- confirmar que el ancho y densidad de glifos coinciden mucho mejor.

---

## Si vuelve a aparecer algo parecido

Si la familia tipográfica ya coincide y todavía queda una diferencia visual, el siguiente sospechoso ya no es “qué fuente usa”, sino:

- métricas de renderizado de VTE;
- antialiasing o hinting del stack GTK/Pango;
- gutters o geometría aplicada al panel nativo.

En ese caso hay que inspeccionar métricas y rasterización, no volver a hardcodear una fuente a ciegas.