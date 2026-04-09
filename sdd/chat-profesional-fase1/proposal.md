# Proposal: Chat Profesional Fase 1

## Intent

Elevar la interfaz de chat AgentHub de un estado funcional pero visualmente desconectado del sistema de temas a una experiencia profesional comparable a Claude Code / ChatGPT. Resolver inconsistencias visuales (~40 colores hardcodeados), funcionalidades ausentes (edición de mensajes, command palette, output de terminal) y bugs conocidos (modal ToolRow, botón "+" muerto, polling duplicado).

## Scope

### In Scope

- **Theme Unification**: Migrar todos los colores hardcodeados a CSS vars en AgentHub.jsx, OpenCodeSubagentCard.jsx, AgentTracePanel.jsx, MCPAccordion.jsx, CodeBlock.jsx
- **Message Editing & Regeneration**: Editar mensajes de usuario, regenerar respuestas de asistente, copiar mensajes individuales
- **Command Palette**: Implementar Cmd+K con cmdk (ya instalado pero sin usar)
- **Terminal Output en Traces**: Renderizar output bash con colores ANSI dentro de AgentTracePanel
- **Code Block Enhancements**: Números de línea, toggle word wrap, display de filename
- **Bug Fixes**: Modal ToolRow que nunca abre, botón "+" dead, doble polling
- **Stop Generating**: Botón para detener streaming de respuestas LLM normales
- **Refactor incremental**: Extraer ChatMessageList, ChatInput, SessionHeader del monolito de 1512 líneas

### Out of Scope

- File attachment / @-mentions
- File diff preview
- Conversation branching
- Soporte multimodal
- Mejoras en SwarmControl
- Diseño responsive mobile

## Approach

Refactorización incremental sin rewrites completos:

1. **Theme**: Usar sistema CSS vars existente en `globals.css` (8 temas completos ya definidos), reemplazar valores hardcodeados como `#5b8cff`, `#111825` por `var(--primary)`, `var(--bg-primary)` etc.
2. **Componentes**: Extraer sub-componentes de AgentHub.jsx manteniendo funcionalidad SSE existente intacta
3. **Command Palette**: Usar `cmdk` ya instalado, integrar CommandDialog con atajos existentes
4. **Terminal**: Usar `xterm` ya instalado o fallback ANSI-to-HTML para rendering más simple
5. **Code Blocks**: Mejorar CodeBlock.jsx con line numbers, word wrap, filename display

## Affected Areas

| Area                                      | Impact   | Description                                               |
| ----------------------------------------- | -------- | --------------------------------------------------------- |
| `src/components/AgentHub.jsx`             | Modified | Refactor monolito, extraer componentes, theme unification |
| `src/components/OpenCodeSubagentCard.jsx` | Modified | Migrar colores hardcodeados a CSS vars                    |
| `src/components/AgentTracePanel.jsx`      | Modified | Añadir terminal output rendering con ANSI                 |
| `src/components/MCPAccordion.jsx`         | Modified | Theme unification                                         |
| `src/components/CodeBlock.jsx`            | Modified | Line numbers, word wrap, filename                         |
| `src/components/StreamingMessage.jsx`     | Modified | Stop generating button                                    |
| `src/components/ChatMessageList.jsx`      | New      | Componente extraído de AgentHub                           |
| `src/components/ChatInput.jsx`            | New      | Componente extraído de AgentHub                           |
| `src/components/SessionHeader.jsx`        | New      | Componente extraído de AgentHub                           |
| `src/components/CommandPalette.jsx`       | New      | Cmd+K con cmdk                                            |
| `src/styles/globals.css`                  | Modified | Verificar CSS vars cubren todos los casos de uso          |

## Risks

| Risk                                           | Likelihood | Mitigation                                                                   |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Breaking SSE streaming durante refactor        | Medium     | Extraer componentes sin modificar lógica de streaming, tests manuales de SSE |
| Regresiones en light mode tras theme migration | Medium     | Verificar visualmente ambos modos, usar CSS vars existentes que ya funcionan |
| Bug en extracción de componentes grandes       | Medium     | Refactor incremental, commit por componente extraído                         |
| xterm integration complexity                   | Low        | Fallback a ANSI-to-HTML si xterm es demasiado complejo para Fase 1           |

## Rollback Plan

- Revertir commits de extracción de componentes si SSE se rompe
- Mantener copia de AgentHub.jsx original hasta verificar funcionalidad completa
- Theme migration es reversible: los CSS vars ya existen, solo se cambian referencias

## Dependencies

- cmdk ya instalado en package.json
- xterm ya instalado en package.json
- Sistema de CSS vars existente en globals.css (8 temas completos)

## Success Criteria

- [ ] Cero colores hardcodeados en componentes de chat (todos usan CSS vars)
- [ ] Usuario puede editar mensajes enviados y regenerar respuestas
- [ ] Cmd+K abre command palette funcional
- [ ] Output de terminal se renderiza con colores ANSI en AgentTracePanel
- [ ] Code blocks muestran números de línea y filename
- [ ] ToolRow "Ver completo" abre modal correctamente
- [ ] Botón "+" en chat input tiene funcionalidad (o se desactiva visualmente)
- [ ] Stop generating button funciona para streaming LLM
- [ ] AgentHub.jsx reducido a <800 líneas tras extracción de componentes
- [ ] Sin regresiones en modo light/dark
