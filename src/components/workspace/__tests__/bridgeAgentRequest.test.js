const { deriveSelectionLabel } = require('../bridgeAgentRequest');

describe('bridgeAgentRequest', () => {
  test('includes element id in the derived selection label when available', () => {
    expect(
      deriveSelectionLabel({
        tagName: 'button',
        className: 'cta-primary',
        attributes: { id: 'buy-now' },
      })
    ).toBe('button#buy-now.cta-primary');
  });

  test('falls back to tag and class when no id metadata exists', () => {
    expect(
      deriveSelectionLabel({
        tagName: 'section',
        className: 'pricing-card featured',
        attributes: {},
      })
    ).toBe('section.pricing-card.featured');
  });
});
