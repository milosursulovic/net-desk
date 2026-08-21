// Mapira browser-ov KeyboardEvent.code (fizički taster, layout-nezavisan) na
// PS/2 Set 1 hardverski scan code - ono što Windows SendInput sa
// KEYEVENTF_SCANCODE stvarno očekuje (vidi InputInjector.cs na agent strani).
// NE koristi se KeyboardEvent.key/keyCode - oni su layout/lokalizacija-
// zavisni, .code nije (isto fizičko dugme daje isti .code bez obzira na
// tastaturni raspored korisnika).
//
// Namerno DELIMIČNA tabela - pokriva slova, brojeve (gornji red), osnovnu
// interpunkciju, kontrolne tastere, strelice i F1-F12. Ne pokriva numpad,
// medijske tastere, IntlBackslash i sličan retko korišćen skup - isti
// "scoped milestone" duh kao font.c hand-authored glyph tabela (deo
// zajednice grafify grafa iz drugog projekta u ovoj sesiji, ista praksa:
// dokumentovano namerno izostavljeno, ne slučajno zaboravljeno).
//
// Vrednosti su standardni PS/2 Set 1 scan kodovi - stabilni, nepromenjeni
// decenijama (za razliku od npr. libvpx ABI verzija), visoka pouzdanost bez
// posebne uživo provere protiv izvora.
export const CODE_TO_SCANCODE = {
  Escape: 0x01,
  Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06,
  Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b,
  Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e,
  Tab: 0x0f,
  KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15,
  KeyU: 0x16, KeyI: 0x17, KeyO: 0x18, KeyP: 0x19,
  BracketLeft: 0x1a, BracketRight: 0x1b,
  Enter: 0x1c,
  ControlLeft: 0x1d,
  KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23,
  KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26,
  Semicolon: 0x27, Quote: 0x28, Backquote: 0x29,
  ShiftLeft: 0x2a,
  Backslash: 0x2b,
  KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32,
  Comma: 0x33, Period: 0x34, Slash: 0x35,
  ShiftRight: 0x36,
  AltLeft: 0x38,
  Space: 0x39,
  CapsLock: 0x3a,
  F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40,
  F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44, F11: 0x57, F12: 0x58,
  // Sledeći zahtevaju extended=true (KEYEVENTF_EXTENDEDKEY) - vidi
  // InputInjector.KeyEvent-ov komentar o zašto (numpad ambiguity).
  Insert: 0x52, Delete: 0x53, Home: 0x47, End: 0x4f,
  PageUp: 0x49, PageDown: 0x51,
  ArrowUp: 0x48, ArrowDown: 0x50, ArrowLeft: 0x4b, ArrowRight: 0x4d,
  ControlRight: 0x1d, AltRight: 0x38,
}

// Isti set kao komentar iznad - koji kodovi TRAŽE extended flag na true.
const EXTENDED_CODES = new Set([
  'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ControlRight', 'AltRight',
])

/**
 * Vraća { scan, ext } za dati KeyboardEvent.code, ili null ako taster nije u
 * tabeli (namerno se tad ne šalje ništa ka agentu - bolje tiho ignorisati
 * nepokriven taster nego poslati pogrešan scan code).
 */
export function scanCodeFor(code) {
  const scan = CODE_TO_SCANCODE[code]
  if (scan === undefined) return null
  return { scan, ext: EXTENDED_CODES.has(code) }
}
