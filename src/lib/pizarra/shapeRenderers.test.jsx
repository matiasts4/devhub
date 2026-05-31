import React from 'react';

import { createShape, SHAPE_TYPES } from '@/lib/pizarra/shapeModel';
import { renderShape } from '@/lib/pizarra/shapeRenderers';

function makePrimitive(displayName) {
  function Primitive(props) {
    return React.createElement(displayName, props);
  }

  Primitive.displayName = displayName;
  return Primitive;
}

const konva = {
  Rect: makePrimitive('Rect'),
  Circle: makePrimitive('Circle'),
  Line: makePrimitive('Line'),
  Arrow: makePrimitive('Arrow'),
  Text: makePrimitive('Text'),
};

function renderWithPrimitives(shape, extraProps = {}) {
  const wrapper = renderShape(shape, {
    konva,
    onSelect: jest.fn(),
    onTransformEnd: jest.fn(),
    ...extraProps,
  });

  expect(wrapper).not.toBeNull();

  return wrapper.type(wrapper.props);
}

describe('shapeRenderers', () => {
  test('renders each supported shape with an injected Konva primitive and stable id', () => {
    const shapes = [
      createShape(SHAPE_TYPES.RECT),
      createShape(SHAPE_TYPES.CIRCLE),
      createShape(SHAPE_TYPES.LINE),
      createShape(SHAPE_TYPES.ARROW),
      createShape(SHAPE_TYPES.TEXTBOX),
      createShape(SHAPE_TYPES.TERMINAL),
      createShape(SHAPE_TYPES.BROWSER),
    ];

    const expectedTypes = [
      konva.Rect,
      konva.Circle,
      konva.Line,
      konva.Arrow,
      konva.Text,
      konva.Rect,
      konva.Rect,
    ];

    shapes.forEach((shape, index) => {
      const rendered = renderWithPrimitives(shape);
      expect(rendered.type).toBe(expectedTypes[index]);
      expect(rendered.props.id).toBe(shape.id);
    });
  });

  test('returns null for unknown shapes', () => {
    const result = renderShape({ id: 'missing', type: 'unknown' }, { konva });
    expect(result).toBeNull();
  });

  test('returns null when the required Konva primitive is unavailable', () => {
    const shape = createShape(SHAPE_TYPES.RECT);
    const wrapper = renderShape(shape, {
      konva: {},
      onSelect: jest.fn(),
    });

    expect(wrapper).not.toBeNull();
    expect(wrapper.type(wrapper.props)).toBeNull();
  });
});