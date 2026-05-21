const fs = require('fs');
const path = require('path');

describe('tauri dialog capability wiring', () => {
  test('desktop capability grants dialog open permission for folder picker', () => {
    const capability = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'src-tauri', 'capabilities', 'default.json'), 'utf8')
    );

    expect(Array.isArray(capability.permissions)).toBe(true);
    expect(capability.permissions).toContain('dialog:allow-open');
  });
});
