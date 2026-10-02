import { describe, it, expect } from 'vitest';
import { ProgressBar } from '../../src/ProgressBar.js';
import { renderComponent } from './_helpers.js';

describe('ProgressBar', () => {
  it('renders 0%', () => {
    const { lastFrameClean } = renderComponent(ProgressBar, { percent: 0 });
    expect(lastFrameClean()).toContain('0%');
    expect(lastFrameClean()).toContain('░');
  });

  it('renders 100%', () => {
    const { lastFrameClean } = renderComponent(ProgressBar, { percent: 100 });
    expect(lastFrameClean()).toContain('100%');
    expect(lastFrameClean()).toContain('█');
    expect(lastFrameClean()).not.toContain('░');
  });

  it('renders 50%', () => {
    const { lastFrameClean } = renderComponent(ProgressBar, { percent: 50 });
    expect(lastFrameClean()).toContain('50%');
    expect(lastFrameClean()).toMatch(/^\[.{20}\]/);
  });

  it('percent is clamped to 0-100', () => {
    const { lastFrameClean: l1 } = renderComponent(ProgressBar, { percent: -10 });
    expect(l1()).toContain('0%');

    const { lastFrameClean: l2 } = renderComponent(ProgressBar, { percent: 150 });
    expect(l2()).toContain('100%');
  });

  it('showPercent=false hides percentage', () => {
    const { lastFrameClean } = renderComponent(ProgressBar, { percent: 50, showPercent: false });
    expect(lastFrameClean()).not.toContain('50%');
  });

  it('custom width', () => {
    const { lastFrameClean } = renderComponent(ProgressBar, { percent: 50, width: 10 });
    expect(lastFrameClean()).toMatch(/^\[.{10}\]/);
  });

  it('custom color does not throw', () => {
    const { lastFrame } = renderComponent(ProgressBar, { percent: 50, color: 'green' });
    expect(lastFrame()).toBeTruthy();
  });
});
