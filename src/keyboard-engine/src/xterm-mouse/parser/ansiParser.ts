import type { ButtonType, ESCMouseEvent, MouseEventAction, SGRMouseEvent } from '../types/index.js';

import { ANSI_RESPONSE_PATTERNS, MAX_EVENT_LENGTHS } from './constants.js';

/**
 * Decodes the SGR (SGR-Style) mouse button code into button type and action.
 * @param code The raw button code from the SGR mouse event.
 * @returns An object containing the button type and the action performed.
 */
function decodeSGRButton(code: number): { button: ButtonType; action: MouseEventAction } {
  const motion = !!(code & 32);
  // Modifier bits for shift, alt, ctrl, and motion
  const modifierBits = 4 | 8 | 16 | 32;
  const buttonCode = code & ~modifierBits; // Isolate the actual button code

  let button: ButtonType;
  switch (buttonCode) {
    case 0:
      button = 'left';
      break;
    case 1:
      button = 'middle';
      break;
    case 2:
      button = 'right';
      break;
    case 3:
      button = 'none';
      break;
    case 64:
      button = 'wheel-up';
      break;
    case 65:
      button = 'wheel-down';
      break;
    case 66:
      button = 'wheel-left';
      break;
    case 67:
      button = 'wheel-right';
      break;
    case 128:
      button = 'back';
      break;
    case 129:
      button = 'forward';
      break;
    default:
      button = 'unknown';
      break;
  }

  let action: MouseEventAction;
  if (motion) {
    action = button === 'none' ? 'move' : 'drag';
  } else if (button.startsWith('wheel-')) {
    action = 'wheel';
  } else {
    // For SGR, release is indicated by the 'm' terminator, not the button code
    action = 'press';
  }

  return { button, action };
}

/**
 * Decodes the ESC (legacy escape sequence) mouse button code into button type and action.
 * @param code The raw button code from the ESC mouse event.
 * @returns An object containing the button type and the action performed.
 */
function decodeESCButton(code: number): { button: ButtonType; action: MouseEventAction } {
  const motion = !!(code & 32);
  // Shift/Alt/Ctrl (and motion) bits sit above the wheel range, so mask them
  // off before matching — otherwise a modified wheel falls through to
  // `unknown`. Mirrors decodeSGRButton.
  const buttonCode = code & ~(4 | 8 | 16 | 32);

  let button: ButtonType = 'unknown'; // Initialize with fallback value
  if (code & 64) {
    // Wheel event
    switch (buttonCode) {
      case 64:
        button = 'wheel-up';
        break;
      case 65:
        button = 'wheel-down';
        break;
      case 66:
        button = 'wheel-left';
        break;
      case 67:
        button = 'wheel-right';
        break;
      default:
        button = 'unknown'; // Fallback for unknown wheel codes
        break;
    }
  } else {
    // Button event — `& 3` keeps only the two button bits, so the modifier and
    // motion bits above them are already masked off here.
    switch (code & 3) {
      case 0:
        button = 'left';
        break;
      case 1:
        button = 'middle';
        break;
      case 2:
        button = 'right';
        break;
      case 3:
        button = 'none';
        break;
    }
  }

  let action: MouseEventAction;
  if (motion) {
    action = button === 'none' ? 'move' : 'drag';
  } else if (button.startsWith('wheel-')) {
    action = 'wheel';
  } else if ((code & 3) === 3) {
    action = 'release';
  } else {
    action = 'press';
  }

  return { button, action };
}

/**
 * Parses a single SGR (SGR-Style) mouse event from a string starting at the given position.
 * @param data The string containing the raw mouse event data.
 * @param start The position in the string to start parsing from.
 * @returns A tuple containing the parsed mouse event (or null if parsing fails) and the position to continue parsing from.
 */
function parseSGRMouseEvent(data: string, start: number): [SGRMouseEvent | null, number] {
  const slice = data.slice(start, start + MAX_EVENT_LENGTHS.sgr);

  const match = slice.match(ANSI_RESPONSE_PATTERNS.sgrPattern);

  if (!match) {
    return [null, start + 1];
  }

  const [fullMatch, bStr, xStr, yStr, terminator] = match as [string, string, string, string, string];
  const isRelease = terminator === 'm';

  const b = parseInt(bStr, 10);
  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  if (Number.isNaN(b) || Number.isNaN(x) || Number.isNaN(y)) {
    return [null, start + 1];
  }

  const { button, action } = decodeSGRButton(b);

  const event: SGRMouseEvent = {
    protocol: 'SGR',
    x,
    y,
    button,
    action: isRelease ? 'release' : action,
    shift: !!(b & 4),
    alt: !!(b & 8),
    ctrl: !!(b & 16),
    raw: b,
    data: fullMatch,
  };

  return [event, start + fullMatch.length];
}

/**
 * Parses a single ESC (legacy escape sequence) mouse event from a string starting at the given position.
 * @param data The string containing the raw mouse event data.
 * @param start The position in the string to start parsing from.
 * @returns A tuple containing the parsed mouse event (or null if parsing fails) and the position to continue parsing from.
 */
function parseESCMouseEvent(data: string, start: number): [ESCMouseEvent | null, number] {
  const slice = data.slice(start, start + MAX_EVENT_LENGTHS.esc);

  const match = slice.match(ANSI_RESPONSE_PATTERNS.escPattern);

  if (!match) {
    return [null, start + 1];
  }

  const [fullMatch, bChar, xChar, yChar] = match as [string, string, string, string];

  const cb = bChar.charCodeAt(0) - 32;
  const cx = xChar.charCodeAt(0) - 32;
  const cy = yChar.charCodeAt(0) - 32;

  const { button, action } = decodeESCButton(cb);

  const event: ESCMouseEvent = {
    protocol: 'ESC',
    x: cx,
    y: cy,
    button,
    action,
    shift: !!(cb & 4),
    alt: !!(cb & 8),
    ctrl: !!(cb & 16),
    raw: cb,
    data: fullMatch,
  };

  return [event, start + fullMatch.length];
}

/**
 * Parses mouse events from raw ANSI escape sequence data.
 * @param data The raw string data containing ANSI mouse event escape sequences.
 * @yields {SGRMouseEvent | ESCMouseEvent} A parsed mouse event object.
 */
function* parseMouseEvents(data: string): Generator<SGRMouseEvent | ESCMouseEvent> {
  let i = 0;
  let lastEventData: string | null = null;

  while (i < data.length) {
    const escIndex = data.indexOf('\x1b[', i);
    if (escIndex === -1) {
      break;
    }

    i = escIndex;
    let event: SGRMouseEvent | ESCMouseEvent | null = null;
    let nextIndex: number;

    if (data[i + 2] === '<') {
      // Potential SGR event
      [event, nextIndex] = parseSGRMouseEvent(data, i);
    } else if (data[i + 2] === 'M') {
      // Potential ESC event
      [event, nextIndex] = parseESCMouseEvent(data, i);
    } else {
      // Unrecognized escape sequence, skip it
      nextIndex = i + 2;
    }

    if (event) {
      // Collapse a run of byte-identical reports. The controller enables the
      // 1000/1002/1003 tracking modes together, and some terminals then report
      // one physical event two or three times back-to-back. The cost, accepted
      // here: two genuine identical reports in one chunk — a fast wheel, a
      // same-cell double press — collapse into one as well.
      if (event.data !== lastEventData) {
        yield event;
        lastEventData = event.data;
      }
    }
    i = nextIndex;
  }
}

export { parseMouseEvents };
