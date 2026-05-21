const fs = require('fs');
const path = require('path');

describe('tauri notification plugin wiring', () => {
  test('package.json declares the Tauri notification package', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    );

    expect(packageJson.dependencies['@tauri-apps/plugin-notification']).toBeDefined();
  });

  test('src-tauri builder registers the notification plugin', () => {
    const rustSource = fs.readFileSync(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8'
    );

    expect(rustSource).toContain('.plugin(tauri_plugin_notification::init())');
  });
});
