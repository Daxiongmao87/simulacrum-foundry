/**
 * Sidebar Registration Logic
 */
import { createLogger } from '../utils/logger.js';
import { SimulacrumSidebarTab } from './simulacrum-sidebar-tab.js';

export function registerSimulacrumSidebarTab() {
  const logger = createLogger('SidebarTab');

  try {
    _registerTab(logger);
    _registerAppConfig(logger);
    logger.info('Sidebar tab registration completed');
  } catch (error) {
    logger.error('Failed to register sidebar tab:', error);
  }
}

function _registerTab(logger) {
  const Sidebar = globalThis.foundry?.applications?.sidebar?.Sidebar ?? globalThis.Sidebar;
  if (Sidebar && Sidebar.TABS) {
    const desc = { tooltip: 'SIMULACRUM.SidebarTab.Title', icon: 'fa-solid fa-hand-sparkles' };
    const entries = Object.entries(Sidebar.TABS).filter(([k]) => k !== 'simulacrum');
    const reordered = {};
    let inserted = false;

    const insertSimulacrum = () => {
      reordered.simulacrum = desc;
      inserted = true;
    };

    for (const [key, value] of entries) {
      if (!inserted && key === 'settings') insertSimulacrum();
      reordered[key] = value;
    }
    if (!inserted) insertSimulacrum();

    Sidebar.TABS = reordered;
    logger.info('Sidebar TABS registration successful');
  } else {
    logger.error('Sidebar class or TABS property not found');
  }
}

function _registerAppConfig(logger) {
  if (CONFIG && CONFIG.ui) {
    CONFIG.ui.simulacrum = SimulacrumSidebarTab;
    logger.info('CONFIG.ui registration successful');
  } else {
    logger.error('CONFIG.ui not found');
  }
}
