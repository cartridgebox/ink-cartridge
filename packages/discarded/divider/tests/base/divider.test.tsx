import { describe, it, expect } from 'vitest';
import { Divider } from '../../src/Divider.js';
import { renderComponent } from './_helpers.js';

describe('Divider', () => {
  it('renders default divider (50 ─)', () => {
    const { lastFrameClean } = renderComponent(Divider);
    expect(lastFrameClean()).toBe('─'.repeat(50));
  });

  it('renders divider with label', () => {
    const { lastFrameClean } = renderComponent(Divider, { label: 'OR' });
    expect(lastFrameClean()).toContain(' OR ');
  });

  it('custom character', () => {
    const { lastFrameClean } = renderComponent(Divider, { char: '·', width: 10 });
    expect(lastFrameClean()).toBe('·'.repeat(10));
  });
});
