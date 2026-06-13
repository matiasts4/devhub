/**
 * Unit tests for pizarra shape model.
 *
 * Covers: createShape for all 5 types, serializeShape round-trip,
 * deserializeShape with invalid input handling.
 */

import {
  createShape,
  serializeShape,
  deserializeShape,
  generateId,
  SHAPE_TYPES,
} from '@/lib/pizarra/shapeModel';
import { SHAPE_DEFAULTS } from '@/lib/pizarra/theme';

describe('pizarra shapeModel', () => {
  describe('createShape', () => {
    test('creates a rect shape with defaults', () => {
      const shape = createShape('rect', { x: 10, y: 20 });
      expect(shape.type).toBe('rect');
      expect(shape.id).toBeDefined();
      expect(shape.x).toBe(10);
      expect(shape.y).toBe(20);
      expect(shape.width).toBe(100);
      expect(shape.height).toBe(80);
      expect(shape.fill).toBe(SHAPE_DEFAULTS.fill);
      expect(shape.stroke).toBe(SHAPE_DEFAULTS.stroke);
      expect(shape.strokeWidth).toBe(SHAPE_DEFAULTS.strokeWidth);
      expect(shape.cornerRadius).toBe(SHAPE_DEFAULTS.cornerRadius);
      expect(shape.opacity).toBe(1);
    });

    test('creates a rect shape with overrides', () => {
      const shape = createShape('rect', {
        x: 50,
        y: 100,
        width: 300,
        height: 150,
        fill: '#ff0000',
        stroke: '#00ff00',
        strokeWidth: 5,
        cornerRadius: 20,
      });
      expect(shape.width).toBe(300);
      expect(shape.height).toBe(150);
      expect(shape.fill).toBe('#ff0000');
      expect(shape.stroke).toBe('#00ff00');
      expect(shape.strokeWidth).toBe(5);
      expect(shape.cornerRadius).toBe(20);
    });

    test('falls back to visible rect defaults when width or height are zero', () => {
      const shape = createShape('rect', {
        x: 10,
        y: 20,
        width: 0,
        height: 0,
      });

      expect(shape.width).toBe(100);
      expect(shape.height).toBe(80);
    });

    test('creates a circle shape with defaults', () => {
      const shape = createShape('circle', { x: 50, y: 50 });
      expect(shape.type).toBe('circle');
      expect(shape.x).toBe(50);
      expect(shape.y).toBe(50);
      expect(shape.radius).toBe(40);
      expect(shape.fill).toBe(SHAPE_DEFAULTS.fill);
    });

    test('creates a circle shape with override', () => {
      const shape = createShape('circle', { x: 0, y: 0, radius: 80 });
      expect(shape.radius).toBe(80);
    });

    test('falls back to a visible circle radius when radius is zero', () => {
      const shape = createShape('circle', { x: 0, y: 0, radius: 0 });
      expect(shape.radius).toBe(40);
    });

    test('creates a line shape with defaults', () => {
      const shape = createShape('line', { x: 0, y: 0 });
      expect(shape.type).toBe('line');
      expect(shape.points).toEqual([0, 0, 100, 100]);
      expect(shape.fill).toBe('transparent');
    });

    test('creates a line shape with custom points', () => {
      const shape = createShape('line', {
        x: 10,
        y: 20,
        points: [0, 0, 200, 150],
      });
      expect(shape.points).toEqual([0, 0, 200, 150]);
      expect(shape.x).toBe(10);
      expect(shape.y).toBe(20);
    });

    test('falls back to default line points when a zero-length line is requested', () => {
      const shape = createShape('line', {
        x: 10,
        y: 20,
        points: [0, 0, 0, 0],
      });

      expect(shape.points).toEqual([0, 0, 100, 100]);
    });

    test('creates an arrow shape with defaults', () => {
      const shape = createShape('arrow', { x: 0, y: 0 });
      expect(shape.type).toBe('arrow');
      expect(shape.points).toEqual([0, 0, 100, 100]);
      expect(shape.pointerLength).toBe(10);
      expect(shape.pointerWidth).toBe(8);
      // Arrow fill should be the stroke color
      expect(shape.fill).toBe(shape.stroke);
    });

    test('falls back to default arrow points when a zero-length arrow is requested', () => {
      const shape = createShape('arrow', {
        x: 0,
        y: 0,
        points: [12, 18, 12, 18],
      });

      expect(shape.points).toEqual([0, 0, 100, 100]);
    });

    test('creates a textbox shape with defaults', () => {
      const shape = createShape('textbox', { x: 10, y: 10 });
      expect(shape.type).toBe('textbox');
      expect(shape.text).toBe('Text');
      expect(shape.fontSize).toBe(SHAPE_DEFAULTS.fontSize);
      expect(shape.fontFamily).toBe(SHAPE_DEFAULTS.fontFamily);
      expect(shape.width).toBe(200);
    });

    test('creates a textbox shape with overrides', () => {
      const shape = createShape('textbox', {
        x: 0,
        y: 0,
        text: 'Hello World',
        fontSize: 32,
        width: 400,
      });
      expect(shape.text).toBe('Hello World');
      expect(shape.fontSize).toBe(32);
      expect(shape.width).toBe(400);
    });

    test('throws for unknown shape type', () => {
      expect(() => createShape('polygon')).toThrow('Unknown shape type: polygon');
    });

    test('each call generates a unique id', () => {
      const a = createShape('rect');
      const b = createShape('rect');
      const c = createShape('circle');
      expect(a.id).not.toBe(b.id);
      expect(b.id).not.toBe(c.id);
    });
  });

  describe('serializeShape / deserializeShape', () => {
    test('serializes and deserializes a rect shape round-trip', () => {
      const original = createShape('rect', { x: 50, y: 100, width: 200, height: 150 });
      const json = serializeShape(original);
      const restored = deserializeShape(json);

      expect(restored.id).toBe(original.id);
      expect(restored.type).toBe('rect');
      expect(restored.x).toBe(50);
      expect(restored.y).toBe(100);
      expect(restored.width).toBe(200);
      expect(restored.height).toBe(150);
    });

    test('serializes and deserializes a circle shape round-trip', () => {
      const original = createShape('circle', { x: 25, y: 75, radius: 50 });
      const restored = deserializeShape(serializeShape(original));
      expect(restored.id).toBe(original.id);
      expect(restored.type).toBe('circle');
      expect(restored.radius).toBe(50);
    });

    test('serializes and deserializes a line shape round-trip', () => {
      const original = createShape('line', { points: [10, 20, 300, 400] });
      const restored = deserializeShape(serializeShape(original));
      expect(restored.points).toEqual([10, 20, 300, 400]);
    });

    test('serializes and deserializes an arrow shape round-trip', () => {
      const original = createShape('arrow', {
        x: 5,
        y: 5,
        points: [0, 0, 150, 80],
        fill: '#ffaa00',
      });
      const restored = deserializeShape(serializeShape(original));
      expect(restored.points).toEqual([0, 0, 150, 80]);
      expect(restored.fill).toBe('#ffaa00');
    });

    test('serializes and deserializes a textbox shape round-trip', () => {
      const original = createShape('textbox', {
        text: 'Hello Konva',
        fontSize: 24,
      });
      const restored = deserializeShape(serializeShape(original));
      expect(restored.text).toBe('Hello Konva');
      expect(restored.fontSize).toBe(24);
    });

    test('deserializeShape throws on invalid JSON', () => {
      expect(() => deserializeShape('not json')).toThrow();
    });

    test('deserializeShape throws on missing id', () => {
      expect(() => deserializeShape(JSON.stringify({ type: 'rect' }))).toThrow(
        'Invalid shape: missing id or type'
      );
    });

    test('deserializeShape throws on missing type', () => {
      expect(() => deserializeShape(JSON.stringify({ id: 'shape-1' }))).toThrow(
        'Invalid shape: missing id or type'
      );
    });
  });

  describe('SHAPE_TYPES constants', () => {
    test('SHAPE_TYPES contains all expected types', () => {
      expect(SHAPE_TYPES.RECT).toBe('rect');
      expect(SHAPE_TYPES.CIRCLE).toBe('circle');
      expect(SHAPE_TYPES.LINE).toBe('line');
      expect(SHAPE_TYPES.ARROW).toBe('arrow');
      expect(SHAPE_TYPES.TEXTBOX).toBe('textbox');
    });
  });
});