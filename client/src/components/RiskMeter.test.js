import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskMeter } from './RiskMeter';

describe('RiskMeter', () => {
  it('renders six chamber slots regardless of risk level', () => {
    const { container } = render(<RiskMeter riskLevel={1} />);
    // 6 chamber dots + the risk-level label span (md size only)
    const dots = container.querySelectorAll('div[title^="Chamber"]');
    expect(dots).toHaveLength(6);
  });

  it('displays the risk text label at md size', () => {
    render(<RiskMeter riskLevel={3} />);
    expect(screen.getByText('3/6')).toBeInTheDocument();
  });

  it('omits the risk text label at sm size', () => {
    const { queryByText } = render(<RiskMeter riskLevel={3} size="sm" />);
    expect(queryByText('3/6')).toBeNull();
  });

  it.each([1, 2, 3, 4, 5, 6])('renders without crashing at risk level %i', (level) => {
    const { container } = render(<RiskMeter riskLevel={level} />);
    expect(container.querySelectorAll('div[title^="Chamber"]')).toHaveLength(6);
  });
});
