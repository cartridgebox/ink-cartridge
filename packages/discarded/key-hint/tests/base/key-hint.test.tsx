import { describe, it, expect } from 'vitest';
import { KeyHint } from '../../src/KeyHint.js';
import { renderComponent } from './_helpers.js';

describe('KeyHint', () => {
  it('renders all key hints', () => {
    const { lastFrameClean } = renderComponent(KeyHint, {
      keys: [
        { key: 's', desc: 'Save' },
        { key: 'q', desc: 'Quit' },
      ],
    });
    expect(lastFrameClean()).toContain('[s]');
    expect(lastFrameClean()).toContain('Save');
    expect(lastFrameClean()).toContain('[q]');
    expect(lastFrameClean()).toContain('Quit');
  });

  it('single key renders correctly', () => {
    const { lastFrameClean } = renderComponent(KeyHint, {
      keys: [{ key: '?', desc: 'Help' }],
    });
    expect(lastFrameClean()).toContain('[?]');
    expect(lastFrameClean()).toContain('Help');
  });
});
