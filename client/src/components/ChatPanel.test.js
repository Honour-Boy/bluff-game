import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';

const baseProps = {
  messages: [],
  unread: 0,
  open: false,
  onOpen: () => {},
  onClose: () => {},
  onSend: () => {},
  myUserId: 'me',
};

const msg = (over = {}) => ({
  id: `m-${Math.random().toString(36).slice(2)}`,
  userId: 'them',
  username: 'Alice',
  text: 'hello',
  ts: Date.now(),
  ...over,
});

describe('ChatPanel — closed', () => {
  it('renders the floating button when closed', () => {
    render(<ChatPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: /Open chat/i })).toBeInTheDocument();
  });

  it('shows the unread badge with the count', () => {
    render(<ChatPanel {...baseProps} unread={4} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('clamps the unread badge to 99+', () => {
    render(<ChatPanel {...baseProps} unread={250} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('does not render the badge when unread is 0', () => {
    const { queryByText } = render(<ChatPanel {...baseProps} unread={0} />);
    expect(queryByText('0')).toBeNull();
  });

  it('calls onOpen when the floating button is clicked', () => {
    const onOpen = vi.fn();
    render(<ChatPanel {...baseProps} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Open chat/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('ChatPanel — open', () => {
  it('renders the empty state when there are no messages', () => {
    render(<ChatPanel {...baseProps} open />);
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
  });

  it('renders message text', () => {
    render(
      <ChatPanel
        {...baseProps}
        open
        messages={[msg({ text: 'hi there' })]}
      />,
    );
    expect(screen.getByText('hi there')).toBeInTheDocument();
  });

  it('disables the send button when the textarea is empty', () => {
    render(<ChatPanel {...baseProps} open />);
    const send = screen.getByRole('button', { name: /Send message/i });
    expect(send).toBeDisabled();
  });

  it('enables the send button after typing', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} open />);
    const textarea = screen.getByPlaceholderText(/Message your room/i);
    await user.type(textarea, 'hello');
    expect(screen.getByRole('button', { name: /Send message/i })).not.toBeDisabled();
  });

  it('calls onSend with trimmed text and clears the draft', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} open onSend={onSend} />);
    const textarea = screen.getByPlaceholderText(/Message your room/i);
    await user.type(textarea, '  hello world  ');
    await user.click(screen.getByRole('button', { name: /Send message/i }));
    expect(onSend).toHaveBeenCalledWith('hello world');
    expect(textarea.value).toBe('');
  });

  it('sends on Enter (without shift)', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} open onSend={onSend} />);
    const textarea = screen.getByPlaceholderText(/Message your room/i);
    await user.type(textarea, 'shortcut{Enter}');
    expect(onSend).toHaveBeenCalledWith('shortcut');
  });

  it('does not send on Shift+Enter', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} open onSend={onSend} />);
    const textarea = screen.getByPlaceholderText(/Message your room/i);
    await user.type(textarea, 'multi{Shift>}{Enter}{/Shift}line');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('groups consecutive messages from the same sender within 60s (only the first shows a header)', () => {
    const t = 1_700_000_000_000;
    const messages = [
      msg({ id: 'a', userId: 'them', username: 'Alice', ts: t, text: 'one' }),
      msg({ id: 'b', userId: 'them', username: 'Alice', ts: t + 30_000, text: 'two' }),
    ];
    render(<ChatPanel {...baseProps} open messages={messages} />);
    // Only one "Alice" header for the run of two messages.
    expect(screen.getAllByText('Alice')).toHaveLength(1);
  });

  it('shows a fresh header after a 60s+ gap from the same sender', () => {
    const t = 1_700_000_000_000;
    const messages = [
      msg({ id: 'a', userId: 'them', username: 'Alice', ts: t, text: 'one' }),
      msg({ id: 'b', userId: 'them', username: 'Alice', ts: t + 120_000, text: 'two' }),
    ];
    render(<ChatPanel {...baseProps} open messages={messages} />);
    expect(screen.getAllByText('Alice')).toHaveLength(2);
  });

  it('uses "You" as the label for the current user', () => {
    const messages = [msg({ userId: 'me', username: 'Christopher', text: 'mine' })];
    render(<ChatPanel {...baseProps} open messages={messages} myUserId="me" />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('caps text input at 500 chars', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} open />);
    const textarea = screen.getByPlaceholderText(/Message your room/i);
    const long = 'x'.repeat(600);
    await user.click(textarea);
    await user.paste(long);
    expect(textarea.value.length).toBe(500);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ChatPanel {...baseProps} open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close chat/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
