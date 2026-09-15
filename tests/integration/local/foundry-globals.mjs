/**
 * Minimal FoundryVTT globals for loading UI modules under node:test.
 * Import this before any module under test that touches Foundry APIs at
 * module scope.
 */
globalThis.Hooks = {
  on: () => {},
  once: () => {},
  call: () => {},
  off: () => {},
};
globalThis.FormApplication = class FormApplication {};
globalThis.Application = class Application {};
globalThis.foundry = {
  applications: {},
  utils: { randomID: () => crypto.randomUUID() },
};
globalThis.game = {
  user: { id: 'gm', isGM: true },
  i18n: { localize: key => key, translations: {} },
};
globalThis.ui = {
  notifications: {
    error: () => {},
    info: () => {},
    warn: () => {},
  },
};
