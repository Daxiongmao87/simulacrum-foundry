/**
 * Tests for sidebar-registration.js
 */
import { registerSimulacrumSidebarTab } from '../../scripts/ui/sidebar-registration.js';

// Mock logger
jest.mock('../../scripts/utils/logger.js', () => ({
    createLogger: () => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }),
    isDebugEnabled: () => false
}));

// Mock simulacrum-sidebar-tab
jest.mock('../../scripts/ui/simulacrum-sidebar-tab.js', () => ({
    SimulacrumSidebarTab: class MockSidebarTab { }
}));

describe('registerSimulacrumSidebarTab', () => {
    beforeEach(() => {
        global.Sidebar = {
            TABS: {
                chat: { tooltip: 'Chat' },
                combat: { tooltip: 'Combat' },
                settings: { tooltip: 'Settings' }
            }
        };
        global.CONFIG = {
            ui: {}
        };
        global.foundry = null;
    });

    afterEach(() => {
        delete global.Sidebar;
        delete global.CONFIG;
        delete global.foundry;
    });

    it('should register sidebar tab before settings', () => {
        registerSimulacrumSidebarTab();

        const tabKeys = Object.keys(global.Sidebar.TABS);
        const simulacrumIndex = tabKeys.indexOf('simulacrum');
        const settingsIndex = tabKeys.indexOf('settings');

        expect(simulacrumIndex).toBeLessThan(settingsIndex);
    });

    it('should add simulacrum to CONFIG.ui', () => {
        registerSimulacrumSidebarTab();
        expect(global.CONFIG.ui.simulacrum).toBeDefined();
    });

    it('should handle missing Sidebar gracefully', () => {
        delete global.Sidebar;
        // Should not throw
        expect(() => registerSimulacrumSidebarTab()).not.toThrow();
    });

    it('should handle missing CONFIG gracefully', () => {
        delete global.CONFIG;
        // Should not throw
        expect(() => registerSimulacrumSidebarTab()).not.toThrow();
    });

    it('should handle edge case when settings tab is not present', () => {
        global.Sidebar.TABS = {
            chat: { tooltip: 'Chat' },
            combat: { tooltip: 'Combat' }
        };

        registerSimulacrumSidebarTab();

        expect(global.Sidebar.TABS.simulacrum).toBeDefined();
    });

    it('should use foundry global when available', () => {
        global.foundry = {
            applications: {
                sidebar: {
                    Sidebar: {
                        TABS: {
                            chat: {}
                        }
                    }
                }
            }
        };
        delete global.Sidebar;

        registerSimulacrumSidebarTab();

        expect(global.foundry.applications.sidebar.Sidebar.TABS.simulacrum).toBeDefined();
    });
});
