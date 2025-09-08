import { ConfirmationDialog } from '../../scripts/ui/confirmation.js';

// Mock FoundryVTT globals
global.game = {
  user: { isGM: true }
};

global.Dialog = {
  confirm: jest.fn((options) => {
    // Mock basic confirmation behavior
    if (options.title.includes('Cancel')) {
      return Promise.resolve(false);
    }
    
    // For most operations, return true
    if (['delete', 'update', 'create'].includes(options.title.toLowerCase()) || 
        options.title.includes('Delete') ||
        options.title.includes('Update') ||
        options.title.includes('Create')) {
      return Promise.resolve(true);
    }
    
    return Promise.resolve(true);
  })
};

function createTestDetails(type, title, details) {
  return { type, title, details };
}

describe('ConfirmationDialog - basic confirm operations', () => {
  describe('confirm method for destructive operations', () => {
    it('should show confirmation for destructive operations', async () => {
      const details = createTestDetails('delete', 'Delete Document', 'Are you sure you want to delete this document?');
      const result = await ConfirmationDialog.confirm(details);
      expect(result).toBe(true);
    });

    it('should return false when user cancels', async () => {
      const details = createTestDetails('delete', 'Test Cancel Action', 'This should be cancelled');
      const result = await ConfirmationDialog.confirm(details);
      expect(result).toBe(false);
    });
  });
});

describe('ConfirmationDialog - update operations', () => {
  describe('confirm method for update operations', () => {
    it('should handle update operations', async () => {
      const details = createTestDetails('update', 'Update Document', 'Update document with new data');
      const result = await ConfirmationDialog.confirm(details);
      expect(result).toBe(true);
    });

    it('should return true for non-destructive operations without dialog', async () => {
      const details = createTestDetails('read', 'Read Document', 'Read document data');
      const result = await ConfirmationDialog.confirm(details);
      expect(result).toBe(true);
    });
  });
});

describe('ConfirmationDialog - create operations', () => {
  describe('confirm method for create operations', () => {
    it('should handle create operations', async () => {
      const details = createTestDetails('create', 'Create Document', 'Create new document');
      const result = await ConfirmationDialog.confirm(details);
      expect(result).toBe(true);
    });

    it('should handle complex confirmation details', async () => {
      const complexDetails = {
        type: 'create',
        title: 'Create Actor',
        details: `Creating Actor with data:
{
  "name": "Test Hero",
  "type": "character",
  "system.health": 100
}`
      };

      const result = await ConfirmationDialog.confirm(complexDetails);
      expect(result).toBe(true);
    });
  });
});

describe('ConfirmationDialog - utility methods', () => {
  describe('utility functions', () => {
    it('should handle various detail types', async () => {
      const shortDetails = createTestDetails('delete', 'Quick Delete', 'Delete?');
      const result1 = await ConfirmationDialog.confirm(shortDetails);
      expect(result1).toBe(true);

      const longDetails = createTestDetails('update', 'Complex Update', 'Update with very long details that span multiple lines and contain lots of information');
      const result2 = await ConfirmationDialog.confirm(longDetails);
      expect(result2).toBe(true);
    });

    it('should handle edge cases in confirmation', async () => {
      const emptyDetails = createTestDetails('', '', '');
      const result = await ConfirmationDialog.confirm(emptyDetails);
      expect(result).toBe(true);
    });
  });
});