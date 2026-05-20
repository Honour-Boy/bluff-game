import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardShape, SHAPES } from './CardShape';

describe('CardShape', () => {
  it.each(SHAPES)('renders the %s shape with its label', (shape) => {
    render(<CardShape type={shape} />);
    // The label is the meta label (e.g. "Circle", "Triangle"), title-cased.
    const label = shape[0].toUpperCase() + shape.slice(1);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('omits the label at sm size', () => {
    const { queryByText } = render(<CardShape type="circle" size="sm" />);
    expect(queryByText('Circle')).toBeNull();
  });

  it('falls back to the square card for unknown types', () => {
    render(<CardShape type="this-is-not-a-shape" />);
    expect(screen.getByText('Square')).toBeInTheDocument();
  });

  it('exports a stable list of shapes', () => {
    expect(SHAPES).toEqual(['circle', 'triangle', 'cross', 'square', 'star']);
  });
});
