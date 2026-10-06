import { describe, expect, test } from 'vitest';

import { parseMouseEvents } from '../../../../src/xterm-mouse/parser/ansiParser.js';

// Test data
const SGR_PRESS_LEFT = '\x1b[<0;10;20M';
const SGR_PRESS_MIDDLE = '\x1b[<1;10;20M';
const SGR_RELEASE_LEFT = '\x1b[<0;10;20m';
const SGR_DRAG_LEFT = '\x1b[<32;10;20M';
const SGR_WHEEL_UP = '\x1b[<64;10;20M';
const SGR_WHEEL_DOWN = '\x1b[<65;10;20M';
const SGR_WHEEL_LEFT = '\x1b[<66;10;20M';
const SGR_WHEEL_RIGHT = '\x1b[<67;10;20M';
const SGR_MOVE = '\x1b[<35;10;20M';

const ESC_PRESS_LEFT = '\x1b[M #4'; // button 0, x=3, y=20
const ESC_PRESS_MIDDLE = '\x1b[M!#4';
const ESC_PRESS_RIGHT = '\x1b[M"#4';
const ESC_RELEASE = '\x1b[M##4';
const ESC_DRAG_LEFT = '\x1b[M@#4';
const ESC_WHEEL_UP = '\x1b[M`#4';
const ESC_WHEEL_DOWN = '\x1b[Ma#4';
const ESC_MOVE = '\x1b[MC#4';

test('parseMouseEvents should return an empty array for invalid input', () => {
  const events = [...parseMouseEvents('invalid string')];
  expect(events).toEqual([]);
});

test('parseMouseEvents should correctly parse a single SGR press event', () => {
  const events = [...parseMouseEvents(SGR_PRESS_LEFT)];
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('SGR');
  expect(event?.action).toBe('press');
  expect(event?.button).toBe('left');
  expect(event?.x).toBe(10);
  expect(event?.y).toBe(20);
});

test('parseMouseEvents should correctly parse a single SGR release event', () => {
  const events = [...parseMouseEvents(SGR_RELEASE_LEFT)];
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('SGR');
  expect(event?.action).toBe('release');
  expect(event?.button).toBe('left'); // Button is preserved on release
});

test('parseMouseEvents should correctly parse a single SGR wheel up event', () => {
  const events = [...parseMouseEvents(SGR_WHEEL_UP)];
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('SGR');
  expect(event?.action).toBe('wheel');
  expect(event?.button).toBe('wheel-up');
});

test('parseMouseEvents should correctly parse a single ESC press event', () => {
  const events = [...parseMouseEvents(ESC_PRESS_LEFT)];
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('ESC');
  expect(event?.action).toBe('press');
  expect(event?.button).toBe('left');
  expect(event?.x).toBe(3);
  expect(event?.y).toBe(20);
});

test('parseMouseEvents should correctly parse a single ESC release event', () => {
  const events = [...parseMouseEvents(ESC_RELEASE)];
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('ESC');
  expect(event?.action).toBe('release');
  expect(event?.button).toBe('none');
});

test('parseMouseEvents should correctly parse a single ESC wheel down event', () => {
  const events = [...parseMouseEvents(ESC_WHEEL_DOWN)];
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('ESC');
  expect(event?.action).toBe('wheel');
  expect(event?.button).toBe('wheel-down');
});

test('parseMouseEvents should correctly parse a single ESC wheel left event', () => {
  const events = [...parseMouseEvents('\x1b[MbSJ')]; // 'b'.charCodeAt(0) - 32 = 66
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('ESC');
  expect(event?.action).toBe('wheel');
  expect(event?.button).toBe('wheel-left');
});

test('parseMouseEvents should correctly parse a single ESC wheel right event', () => {
  const events = [...parseMouseEvents('\x1b[McSJ')]; // 'c'.charCodeAt(0) - 32 = 67
  expect(events.length).toBe(1);
  const event = events[0];
  expect(event?.protocol).toBe('ESC');
  expect(event?.action).toBe('wheel');
  expect(event?.button).toBe('wheel-right');
});

test('parseMouseEvents should handle multiple, concatenated events', () => {
  const input = SGR_PRESS_LEFT + SGR_WHEEL_UP + ESC_PRESS_RIGHT + SGR_RELEASE_LEFT;
  const events = [...parseMouseEvents(input)];

  expect(events.length).toBe(4);

  expect(events[0]?.protocol).toBe('SGR');
  expect(events[0]?.button).toBe('left');

  expect(events[1]?.protocol).toBe('SGR');
  expect(events[1]?.button).toBe('wheel-up');

  expect(events[2]?.protocol).toBe('ESC');
  expect(events[2]?.button).toBe('right');

  expect(events[3]?.protocol).toBe('SGR');
  expect(events[3]?.action).toBe('release');
});

test('parseMouseEvents should handle data with surrounding text', () => {
  const input = `some text before ${SGR_PRESS_LEFT} and some text after`;
  const events = [...parseMouseEvents(input)];

  expect(events.length).toBe(1);
  expect(events[0]?.protocol).toBe('SGR');
  expect(events[0]?.button).toBe('left');
  expect(events[0]?.x).toBe(10);
});

test('parseMouseEvents should handle all SGR variations', () => {
  const inputs = {
    SGR_PRESS_MIDDLE,
    SGR_DRAG_LEFT,
    SGR_WHEEL_DOWN,
    SGR_WHEEL_LEFT,
    SGR_WHEEL_RIGHT,
    SGR_MOVE,
  };

  for (const key in inputs) {
    const input = inputs[key as keyof typeof inputs];
    const events = [...parseMouseEvents(input)];
    expect(events.length).toBe(1);
    expect(events[0]?.protocol).toBe('SGR');
  }
});

test('parseMouseEvents should handle all ESC variations', () => {
  const inputs = {
    ESC_PRESS_MIDDLE,
    ESC_PRESS_RIGHT,
    ESC_DRAG_LEFT,
    ESC_WHEEL_UP,
    ESC_MOVE,
  };

  for (const key in inputs) {
    const input = inputs[key as keyof typeof inputs];
    const events = [...parseMouseEvents(input)];
    expect(events.length).toBe(1);
    expect(events[0]?.protocol).toBe('ESC');
  }
});

describe('Coverage-specific tests', () => {
  test('should parse SGR right-click', () => {
    const events = [...parseMouseEvents('\x1b[<2;10;20M')];
    expect(events[0]?.button).toBe('right');
  });

  test('should parse SGR back button', () => {
    const events = [...parseMouseEvents('\x1b[<128;10;20M')];
    expect(events[0]?.button).toBe('back');
  });

  test('should parse SGR forward button', () => {
    const events = [...parseMouseEvents('\x1b[<129;10;20M')];
    expect(events[0]?.button).toBe('forward');
  });

  test('should handle unknown SGR button', () => {
    const events = [...parseMouseEvents('\x1b[<200;10;20M')];
    expect(events[0]?.button).toBe('unknown');
  });

  test('should handle unknown ESC button', () => {
    // ESC button codes are masked, so we need a value that doesn't map to left/middle/right
    // 0b01000111 -> char 'G' -> cb 39. & 3 = 3 (none), & 64 = 0. This will be 'none'.
    // To hit unknown, we need a logic branch that is not possible with current decode.
    // The default 'unknown' in decodeESCButton is unreachable because of the switch on `code & 3`.
    // We will test the 'none' case which was also uncovered.
    const events = [...parseMouseEvents('\x1b[M#  ')]; // cb = 35 -> &3 = 3 -> 'none'
    expect(events[0]?.button).toBe('none');
  });

  test('should skip unrecognized escape sequences', () => {
    const input = `\x1b[2J${SGR_PRESS_LEFT}`;
    const events = [...parseMouseEvents(input)];
    expect(events.length).toBe(1);
    expect(events[0]?.button).toBe('left');
  });

  test('should handle input with no escape sequences', () => {
    const input = 'hello world';
    const events = [...parseMouseEvents(input)];
    expect(events.length).toBe(0);
  });

  test('should handle incomplete SGR sequence', () => {
    const input = '\x1b[<0;10;';
    const events = [...parseMouseEvents(input)];
    expect(events.length).toBe(0);
  });

  test('parseMouseEvents should ignore non-mouse ANSI events and other characters', () => {
    const SGR_PRESS = '\x1b[<0;10;20M';
    const ARROW_UP = '\x1b[A';
    const CHAR_A = 'a';
    const SGR_WHEEL = '\x1b[<64;10;20M';

    const input = `${SGR_PRESS}${ARROW_UP}${CHAR_A}${SGR_WHEEL}`;
    const events = [...parseMouseEvents(input)];

    expect(events.length).toBe(2);
    expect(events[0]?.button).toBe('left');
    expect(events[1]?.button).toBe('wheel-up');
  });

  test('parseMouseEvents should perform run-length deduplication', () => {
    const SGR_EVENT_1 = '\x1b[<0;10;20M';
    const SGR_EVENT_2 = '\x1b[<1;11;21M';
    const ESC_EVENT_1 = '\x1b[M #4'; // button 0, x=3, y=20

    const input =
      SGR_EVENT_1 + // First unique event
      SGR_EVENT_1 + // Duplicate, should be ignored
      SGR_EVENT_1 + // Duplicate, should be ignored
      SGR_EVENT_2 + // New unique event
      SGR_EVENT_2 + // Duplicate, should be ignored
      ESC_EVENT_1 + // New unique event
      SGR_EVENT_1; // New unique event (different from previous ESC_EVENT_1)

    const events = [...parseMouseEvents(input)];

    expect(events.length).toBe(4); // SGR_EVENT_1, SGR_EVENT_2, ESC_EVENT_1, SGR_EVENT_1

    expect(events[0]?.data).toBe(SGR_EVENT_1);
    expect(events[1]?.data).toBe(SGR_EVENT_2);
    expect(events[2]?.data).toBe(ESC_EVENT_1);
    expect(events[3]?.data).toBe(SGR_EVENT_1);
  });

  test('should handle unknown SGR wheel codes', () => {
    // Test wheel codes that are not in the expected range (64-67)
    // This should hit line 44 in decodeSGRButton: button = 'unknown'
    const events = [...parseMouseEvents('\x1b[<200;10;20M')]; // wheel code 200 (unknown)
    expect(events[0]?.button).toBe('unknown');
    expect(events[0]?.action).toBe('press'); // unknown buttons default to press
  });

  test('keeps the ESC wheel button when modifier bits are set', () => {
    // ESC[MCbCxCy, each byte = value + 32. Shift/Alt/Ctrl are bits 4/8/16
    // above the wheel range; they must be masked off before matching, or a
    // modified wheel decodes as an `unknown` press.
    const wheel = (cb: number) =>
      '\x1b[M' +
      String.fromCharCode(cb + 32) +
      String.fromCharCode(10 + 32) +
      String.fromCharCode(20 + 32);

    const shift = [...parseMouseEvents(wheel(64 | 4))][0]; // code 68, previously `unknown`
    expect(shift?.button).toBe('wheel-up');
    expect(shift?.action).toBe('wheel');
    expect(shift?.shift).toBe(true);

    const ctrl = [...parseMouseEvents(wheel(64 | 16))][0];
    expect(ctrl?.button).toBe('wheel-up');
    expect(ctrl?.ctrl).toBe(true);

    const alt = [...parseMouseEvents(wheel(65 | 8))][0];
    expect(alt?.button).toBe('wheel-down');
    expect(alt?.alt).toBe(true);
  });

  test('should handle NaN values in SGR coordinates', () => {
    // Test malformed SGR sequences with non-numeric coordinates
    // This should hit line 134: return [null, start + 1]
    const events = [...parseMouseEvents('\x1b[<0;abc;20M')];
    expect(events.length).toBe(0); // Should return empty due to NaN parsing
  });

  test('should handle NaN values in SGR button code', () => {
    // Test malformed SGR sequences with non-numeric button code
    const events = [...parseMouseEvents('\x1b[<abc;10;20M')];
    expect(events.length).toBe(0); // Should return empty due to NaN parsing
  });

  test('should handle NaN values in SGR y coordinate', () => {
    // Test malformed SGR sequences with non-numeric y coordinate
    const events = [...parseMouseEvents('\x1b[<0;10;xyzM')];
    expect(events.length).toBe(0); // Should return empty due to NaN parsing
  });
});

describe('ReDoS protection', () => {
  test('should handle maximum allowed coordinate values', () => {
    // Test maximum allowed values: button code 3 digits, coordinates 4 digits
    const maxButton = '255'; // 3 digits
    const maxCoord = '9999'; // 4 digits
    const input = `\x1b[<${maxButton};${maxCoord};${maxCoord}M`;
    const events = [...parseMouseEvents(input)];

    // Should parse successfully with maximum values
    expect(events.length).toBe(1);
    expect(events[0]?.x).toBe(9999);
    expect(events[0]?.y).toBe(9999);
  });

  test('should reject coordinates beyond 4 digits', () => {
    // 5 digits exceeds the {1,4} limit
    const tooLong = '99999';
    const input = `\x1b[<0;${tooLong};20M`;
    const events = [...parseMouseEvents(input)];

    // Should not parse - exceeds coordinate limit
    expect(events.length).toBe(0);
  });

  test('should reject button codes beyond 3 digits', () => {
    // 4 digits exceeds the {1,3} limit
    const tooLong = '9999';
    const input = `\x1b[<${tooLong};10;20M`;
    const events = [...parseMouseEvents(input)];

    // Should not parse - exceeds button code limit
    expect(events.length).toBe(0);
  });

  test('should truncate input beyond MAX_EVENT_LENGTHS', () => {
    // Create a string with valid SGR event followed by lots of junk
    const validEvent = '\x1b[<0;10;20M';
    const junk = 'a'.repeat(10000);
    const input = validEvent + junk;

    const start = Date.now();
    const events = [...parseMouseEvents(input)];
    const elapsed = Date.now() - start;

    // Should parse the valid event and complete quickly
    expect(events.length).toBe(1);
    expect(events[0]?.button).toBe('left');
    // Should complete in less than 100ms even with 10KB of junk
    expect(elapsed).toBeLessThan(100);
  });

  test('should handle repeated incomplete escape sequences efficiently', () => {
    // Create many incomplete escape sequences that could cause catastrophic backtracking
    // if the regex were vulnerable to ReDoS
    const incomplete = '\x1b[<0;'.repeat(10000);

    const start = Date.now();
    const events = [...parseMouseEvents(incomplete)];
    const elapsed = Date.now() - start;

    // Should return empty and complete quickly
    expect(events.length).toBe(0);
    expect(elapsed).toBeLessThan(100);
  });

  test('should handle malformed SGR with very long coordinate values', () => {
    // Event with 5-digit coordinate (exceeds {1,4} limit)
    const tooLongCoord = '99999'; // 5 digits
    const input = `\x1b[<0;${tooLongCoord};20M`;

    const start = Date.now();
    const events = [...parseMouseEvents(input)];
    const elapsed = Date.now() - start;

    // Should reject due to exceeding coordinate limit
    expect(events.length).toBe(0);
    expect(elapsed).toBeLessThan(50);
  });

  test('should handle mixed valid and invalid long input', () => {
    const validEvent = '\x1b[<0;10;20M';
    // Garbage with numbers that exceed the digit limits
    const garbage = '\x1b[<99999;'.repeat(100); // 5 digits exceeds {1,3} button limit

    const start = Date.now();
    const events = [...parseMouseEvents(garbage + validEvent)];
    const elapsed = Date.now() - start;

    // Should find the valid event despite the garbage
    expect(events.length).toBe(1);
    expect(events[0]?.button).toBe('left');
    expect(elapsed).toBeLessThan(100);
  });

  test('should limit ESC event input length', () => {
    // Valid ESC event followed by lots of text
    const validEvent = '\x1b[M #4';
    const junk = 'x'.repeat(10000);
    const input = validEvent + junk;

    const start = Date.now();
    const events = [...parseMouseEvents(input)];
    const elapsed = Date.now() - start;

    // Should parse efficiently
    expect(events.length).toBe(1);
    expect(events[0]?.protocol).toBe('ESC');
    expect(elapsed).toBeLessThan(50);
  });

  test('should handle many concatenated events efficiently', () => {
    // Create 1000 valid mouse events
    const events = '\x1b[<0;1;1M'.repeat(1000);

    const start = Date.now();
    const parsed = [...parseMouseEvents(events)];
    const elapsed = Date.now() - start;

    // Should parse all events quickly
    // Only first unique event should be returned due to deduplication
    expect(parsed.length).toBe(1);
    expect(elapsed).toBeLessThan(100);
  });
});
