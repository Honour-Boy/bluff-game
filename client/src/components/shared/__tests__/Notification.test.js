import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Notification } from './Notification';

describe('Notification', () => {
  it('renders nothing when notification is null', () => {
    const { container } = render(<Notification notification={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the message text', () => {
    render(<Notification notification={{ msg: 'Hello world', type: 'info', id: 1 }} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it.each([
    ['info'],
    ['warning'],
    ['error'],
    ['success'],
  ])('renders for type %s', (type) => {
    render(<Notification notification={{ msg: `msg-${type}`, type, id: 1 }} />);
    expect(screen.getByText(`msg-${type}`)).toBeInTheDocument();
  });

  it('falls back to info color for unknown type', () => {
    // Should still render the message, even if type is bogus.
    render(<Notification notification={{ msg: 'Mystery', type: 'unknown', id: 1 }} />);
    expect(screen.getByText('Mystery')).toBeInTheDocument();
  });
});
