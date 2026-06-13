const fs = require('fs');
const path = require('path');

describe('desktop production port configuration', () => {
  test('tauri production webview targets the packaged Next.js server on 3400, creates the main window only after bootstrap, and avoids transparent compositing', () => {
    const tauriConfig = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'src-tauri', 'tauri.conf.json'), 'utf8')
    );

    expect(tauriConfig.build.frontendDist).toBe('http://127.0.0.1:3400');
    expect(tauriConfig.app.windows[0].transparent).toBe(false);
    expect(tauriConfig.app.windows[0].decorations).toBe(false);
    expect(tauriConfig.app.windows[0].create).toBe(false);
  });

  test('rust bootstrap waits for the production Next.js server on 3400 before creating the main window', () => {
    const rustSource = fs.readFileSync(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8'
    );

    expect(rustSource).toMatch(/if cfg!\(debug_assertions\) \{\s*3100\s*\} else \{\s*3400\s*\}/s);
    expect(rustSource).toContain(
      'fn ensure_main_window(app: &tauri::AppHandle) -> tauri::Result<()>'
    );
    expect(rustSource).toContain(
      'WebviewWindowBuilder::from_config(app, window_config)?.build()?;'
    );
    expect(rustSource).toContain(
      'fn ensure_runtime_ready(app: &tauri::AppHandle) -> tauri::Result<()>'
    );
    expect(rustSource).toMatch(
      /ensure_runtime_ready\(app\.handle\(\)\)\?;\s*ensure_main_window\(app\.handle\(\)\)\?;/s
    );
  });

  test('single-instance restore path revalidates the local runtime before showing the main window again, but only outside debug builds', () => {
    const rustSource = fs.readFileSync(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8'
    );

    expect(rustSource).toMatch(
      /fn restore_main_window\(app: &tauri::AppHandle\) \{\s*if ensure_runtime_ready\(app\)\.is_err\(\) \{\s*return;\s*\}\s*if ensure_main_window\(app\)\.is_err\(\) \{\s*return;\s*\}/s
    );
    expect(rustSource).toContain('let _ = window.reload();');
    expect(rustSource).toMatch(
      /if !cfg!\(debug_assertions\) \{\s*builder = builder\.plugin\(tauri_plugin_single_instance::init\(\|app, _args, _cwd\| \{\s*println!\("\[DevHub\] Segunda instancia detectada → restaurando ventana principal\."\);\s*restore_main_window\(app\);\s*\}\)\);\s*\}/s
    );
  });

  test('installed wrapper launches the packaged Next.js server on 3400', () => {
    const wrapperSource = fs.readFileSync(
      path.join(process.cwd(), 'src-tauri', 'binaries', 'devhub-server-x86_64-unknown-linux-gnu'),
      'utf8'
    );

    expect(wrapperSource).toContain('PORT="${PORT:-3400}" "$NODE_BIN" "$NEXT_PATH" &');
    expect(wrapperSource).toContain('Lanzando Next.js standalone (${PORT:-3400})...');
    expect(wrapperSource).toContain('standalone/node_modules/ws/index.js');
    expect(wrapperSource).toContain(
      'standalone/node_modules/@swc/helpers/cjs/_interop_require_default.cjs'
    );
    expect(wrapperSource).toContain('standalone/.next/node_modules');
    expect(wrapperSource).toContain('better-sqlite3-*/build/Release/better_sqlite3.node');
  });
});
