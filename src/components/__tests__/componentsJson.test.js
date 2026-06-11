const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../../../components.json');

describe('components.json shadcn wiring (FR-D07)', () => {
  let json;

  beforeAll(() => {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    json = JSON.parse(raw);
  });

  test('components.json points tailwind.css to src/app/globals.css', () => {
    expect(json.tailwind.css).toBe('src/app/globals.css');
  });

  test('components.json remains valid JSON and keeps the shadcn schema fields', () => {
    expect(json.$schema).toBe('https://ui.shadcn.com/schema.json');
    expect(json.tailwind.config).toBe('tailwind.config.js');
    expect(json.tailwind.baseColor).toBe('neutral');
  });
});
