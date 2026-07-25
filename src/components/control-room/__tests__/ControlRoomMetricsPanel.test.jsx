import ControlRoomMetricsPanel from '../ControlRoomMetricsPanel.jsx';
import { renderToStaticMarkup } from 'react-dom/server';

function renderPanel(props = {}) {
  return renderToStaticMarkup(
    <ControlRoomMetricsPanel
      header={{
        active: 1,
        max: 5,
        queue_depth: 4,
        authority: 'authoritative',
        freshness: 'current',
      }}
      {...props}
    />
  );
}

describe('ControlRoomMetricsPanel', () => {
  test('renders four metric cards with labels and values', () => {
    const html = renderPanel();
    expect(html).toContain('Agentes');
    expect(html).toContain('1/5 activos');
    expect(html).toContain('Cola');
    expect(html).toContain('4 en cola');
    expect(html).toContain('Autoridad');
    expect(html).toContain('canónica');
    expect(html).toContain('Frescura');
    expect(html).toContain('actual');
  });

  test('renders with zero values gracefully', () => {
    const html = renderPanel({
      header: { active: 0, max: 0, queue_depth: 0, authority: '', freshness: '' },
    });
    expect(html).toContain('0/0 activos');
    expect(html).toContain('0 en cola');
  });

  test('renders unknown values for missing header fields', () => {
    const html = renderPanel({ header: {} });
    expect(html).toContain('desconocido');
  });
});
