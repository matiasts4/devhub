import ControlRoomContextPanel from '../ControlRoomContextPanel.jsx';
import { renderToStaticMarkup } from 'react-dom/server';

function renderPanel(props = {}) {
  return renderToStaticMarkup(
    <ControlRoomContextPanel
      header={{
        evidence_refs: ['ref-1', 'ref-2'],
        missing_source: null,
      }}
      missionSummary={null}
      {...props}
    />
  );
}

describe('ControlRoomContextPanel', () => {
  test('renders evidence section when header has evidence', () => {
    const html = renderPanel();
    expect(html).toContain('Evidencia');
    expect(html).toContain('ref-1');
    expect(html).toContain('ref-2');
  });

  test('renders missing source warning when present', () => {
    const html = renderPanel({
      header: {
        evidence_refs: [],
        missing_source: 'approval evidence',
      },
    });
    expect(html).toContain('Fuente faltante');
    expect(html).toContain('evidencia de aprobación');
  });

  test('renders mission summary when provided', () => {
    const html = renderPanel({
      missionSummary: {
        title: 'Misión Director',
        status: 'active',
        participantCount: 2,
        pendingDeliveryCount: 1,
        activePresenceCount: 2,
        stalePresenceCount: 0,
        offlinePresenceCount: 0,
        latestMessageSummary: 'Resumen del mensaje',
      },
    });
    expect(html).toContain('Contexto de misión');
    expect(html).toContain('Misión Director');
    expect(html).toContain('2 participantes');
    expect(html).toContain('1 entrega pendiente');
    expect(html).toContain('Resumen del mensaje');
  });

  test('renders empty mission state cleanly', () => {
    const html = renderPanel({ missionSummary: null });
    expect(html).not.toContain('Contexto de misión');
  });
});
