const fs = require('fs');
const path = require('path');

describe('ProjectHub folder picker failure feedback', () => {
  test('shows a user-facing toast when the folder picker fails', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'views', 'ProjectHub.jsx'), 'utf8');

    expect(source).toContain("toast.error('No se pudo abrir el selector de carpetas'");
  });
});
