/**
 * Maximum allowed length for mouse event escape sequences to prevent ReDoS attacks.
 * These limits match the maximum sizes defined by the regex patterns.
 *
 * SGR format: ESC[<Cb;Cx;Cy(M|m) where:
 * - Cb is 1-3 digits (button code: 0-255)
 * - Cx, Cy are 1-4 digits (coordinates: 0-9999)
 * - Maximum: ESC[<255;9999;9999M = 17 chars
 *
 * ESC format: ESC[MCbCxCy where:
 * - Cb, Cx, Cy are single characters (6 chars total)
 *
 * **Security:** Deeply frozen to prevent prototype pollution attacks.
 */
import { type DeepReadonly, deepFreeze } from '../utils/freeze.js';

type MaxEventLengths = {
  sgr: 17;
  esc: 6;
};

const MAX_EVENT_LENGTHS: DeepReadonly<MaxEventLengths> = deepFreeze({
  /**
   * SGR format with bounded quantifiers
   * ESC[< + 3 digits + ; + 4 digits + ; + 4 digits + M/m = 17 chars
   */
  sgr: 17,

  /**
   * ESC format: ESC[M + 3 chars = 6 chars
   */
  esc: 6,
});

/**
 * ANSI escape codes for enabling and disabling different mouse tracking modes in terminals.
 * These codes are used to control how the terminal reports mouse events.
 *
 * **Security:** All objects are deeply frozen to prevent prototype pollution attacks
 * and tampering at runtime.
 */
type AnsiCodes = {
  mouseButton: {
    on: '\x1b[?1000h';
    off: '\x1b[?1000l';
  };
  mouseDrag: {
    on: '\x1b[?1002h';
    off: '\x1b[?1002l';
  };
  mouseMotion: {
    on: '\x1b[?1003h';
    off: '\x1b[?1003l';
  };
  mouseSGR: {
    on: '\x1b[?1006h';
    off: '\x1b[?1006l';
  };
};

const ANSI_CODES: DeepReadonly<AnsiCodes> = deepFreeze({
  // Terminal will send event on button pressed with mouse position
  // SET_VT200_MOUSE
  mouseButton: { on: '\x1b[?1000h', off: '\x1b[?1000l' },

  // Terminal will send event on button pressed and mouse motion as long as a button is down, with mouse position
  // SET_BTN_EVENT_MOUSE
  mouseDrag: { on: '\x1b[?1002h', off: '\x1b[?1002l' },

  // Terminal will send event on button pressed and motion
  // SET_ANY_EVENT_MOUSE
  mouseMotion: { on: '\x1b[?1003h', off: '\x1b[?1003l' },

  // Another mouse protocol that extend coordinate mapping (without it, it supports only 223 rows and columns)
  // SET_SGR_EXT_MODE_MOUSE
  mouseSGR: { on: '\x1b[?1006h', off: '\x1b[?1006l' },
});

/**
 * Regular expression patterns for parsing ANSI escape sequences that contain mouse event data.
 * These patterns match the different formats terminals use to report mouse positions and button states.
 *
 * ReDoS Protection:
 * - Anchored with ^ to match only at string start (prevents full-string scanning)
 * - Bounded quantifiers {min,max} instead of greedy + (prevents unbounded matching)
 * - Fixed structure with literal separators between variable parts
 * - No nested quantifiers or overlapping alternations (prevents exponential backtracking)
 */
const ANSI_RESPONSE_PATTERNS = {
  /**
   * SGR pattern: ESC[<Cb;Cx;Cy(M|m)
   * - Cb: button code, 1-3 digits (0-255, practical terminal limit)
   * - Cx, Cy: coordinates, 1-4 digits each (0-9999, exceeds typical terminal sizes)
   * - Bounded quantifiers {1,3} and {1,4} prevent unbounded backtracking
   * - ^ anchor ensures match only at start
   */
  // ANSI escape sequences require control characters
  // eslint-disable-next-line no-control-regex
  sgrPattern: /^\x1b\[<(\d{1,3});(\d{1,4});(\d{1,4})([Mm])/,

  /**
   * ESC pattern: ESC[MCbCxCy
   * - Fixed-length pattern (exactly 3 characters after ESC[M)
   * - Character classes match single characters (no quantifiers)
   * - No possibility of backtracking or ambiguous matches
   */
  // ANSI escape sequences require control characters
  // eslint-disable-next-line no-control-regex
  escPattern: /^\x1b\[M([\x20-\x7f])([\x20-\x7f])([\x20-\x7f])/,
};

export { ANSI_CODES, ANSI_RESPONSE_PATTERNS, MAX_EVENT_LENGTHS };
