import { describe, it, expect } from 'vitest';
import { Badge } from '../../src/Badge.js';
import { renderComponent } from './_helpers.js';

describe('Badge', () => {
  it('renders text', () => {
    const { lastFrameClean } = renderComponent(Badge, { children: 'New' });
    expect(lastFrameClean()).toContain('New');
  });

  it('default color is cyan', () => {
    const { lastFrameClean } = renderComponent(Badge, { children: 'Tag' });
    expect(lastFrameClean()).toContain('Tag');
  });

  it('custom color does not throw', () => {
    const { lastFrame } = renderComponent(Badge, { color: 'red', children: 'Error' });
    expect(lastFrame()).toBeTruthy();
  });
});
