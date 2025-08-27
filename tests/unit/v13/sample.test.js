/**
 * @file tests/unit/v13/sample.test.js
 * @description Sample unit test for FoundryVTT v13 functionality
 */

describe('Sample v13 Unit Test', () => {
  beforeEach(() => {
    // Mock basic v13 globals if needed
    global.game = {
      version: '13.0.0',
      settings: {
        get: () => 'mocked-value',
        set: () => true
      }
    };
  });

  afterEach(() => {
    delete global.game;
  });

  it('should demonstrate v13 unit testing', () => {
    expect(global.game.version).toBe('13.0.0');
    expect(typeof global.game.settings.get).toBe('function');
  });

  it('should perform basic JavaScript functionality tests', () => {
    const testArray = [1, 2, 3];
    const doubled = testArray.map(x => x * 2);
    expect(doubled).toEqual([2, 4, 6]);
  });
});