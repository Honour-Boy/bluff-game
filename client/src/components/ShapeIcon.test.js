import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ShapeIcon, SHAPE_COLORS, SHAPE_META } from './ShapeIcon';

describe('ShapeIcon', () => {
  it.each(['circle', 'triangle', 'cross', 'square', 'star', 'whot'])(
    'renders the %s shape',
    (shape) => {
      const { container } = render(<ShapeIcon shape={shape} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.getAttribute('aria-label')).toBe(shape);
    },
  );

  it('honors the size prop', () => {
    const { container } = render(<ShapeIcon shape="square" size={64} />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
  });

  it('falls back to the square path for an unknown shape', () => {
    const { container } = render(<ShapeIcon shape="unknown-shape" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('exposes consistent colour metadata', () => {
    expect(SHAPE_COLORS.circle).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Object.keys(SHAPE_META)).toEqual(
      expect.arrayContaining(['circle', 'triangle', 'cross', 'square', 'star', 'whot']),
    );
  });
});
