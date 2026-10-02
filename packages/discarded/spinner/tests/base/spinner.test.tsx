import { describe, it, expect, afterEach, vi } from 'vitest';
import { Spinner } from '../../src/Spinner.js';
import { renderComponent } from './_helpers.js';
import { flush } from './_helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Spinner', () => {
  it('renders default frame (first character)', () => {
    const { lastFrameClean } = renderComponent(Spinner);
    expect(lastFrameClean()).toBe('⠋');
  });

  it('renders label', () => {
    const { lastFrameClean } = renderComponent(Spinner, { label: 'Working...' });
    expect(lastFrameClean()).toContain('Working...');
  });

  it('active=false stays on first frame', () => {
    const { lastFrameClean } = renderComponent(Spinner, { active: false });
    expect(lastFrameClean()).toBe('⠋');
  });

  it('renders specified type', () => {
    const { lastFrameClean } = renderComponent(Spinner, { type: 'simple' });
    expect(lastFrameClean()).toBe('|');
  });

  it('custom color does not throw', () => {
    const { lastFrame } = renderComponent(Spinner, { color: 'red' });
    expect(lastFrame()).toBeTruthy();
  });

  it('does not animate when active=false (early return in effect)', () => {
    vi.useFakeTimers();
    const { lastFrameClean, unmount } = renderComponent(Spinner, { active: false, speed: 80 });

    const firstFrame = lastFrameClean();
    vi.advanceTimersByTime(500);
    expect(lastFrameClean()).toBe(firstFrame);

    vi.useRealTimers();
    unmount();
  });

  it('type fallback to dots when invalid type provided', () => {
    const { lastFrameClean } = renderComponent(Spinner, { type: 'invalid' as any });
    expect(lastFrameClean()).toBe('⠋');
  });
});
