/**
 * Context Manager for Simulacrum
 * 
 * Manages conversation context by storing document references
 * and integrating with the AI service for enhanced responses.
 */
export class ContextManager {
    constructor() {
        this.contextItems = [];
        this.maxContextSize = 50;
        this.loadFromSettings();
    }

    /**
     * Add a document to the conversation context
     * @param {string} documentType 
     * @param {string} documentId 
     */
    addDocument(documentType, documentId) {
        // Prevent duplicates
        const exists = this.contextItems.some(item => 
            item.documentType === documentType && item.documentId === documentId
        );
        
        if (exists) {
            return false;
        }

        // Enforce size limits
        if (this.contextItems.length >= this.maxContextSize) {
            this.contextItems.shift(); // Remove oldest item
        }

        const contextItem = {
            id: foundry.utils.randomID(),
            documentType,
            documentId,
            addedAt: new Date().toISOString(),
            documentName: this.getDocumentName(documentType, documentId)
        };

        this.contextItems.push(contextItem);
        this.saveToSettings();
        return true;
    }

    /**
     * Get all context items
     * @returns {Array} Array of context items
     */
    getContextItems() {
        // Filter out any items where the document no longer exists
        this.contextItems = this.contextItems.filter(item => {
            return this.documentExists(item.documentType, item.documentId);
        });
        
        return [...this.contextItems];
    }

    /**
     * Clear all context items
     */
    clearContext() {
        this.contextItems = [];
        this.saveToSettings();
    }

    /**
     * Remove a specific context item
     * @param {string} itemId 
     */
    removeContextItem(itemId) {
        this.contextItems = this.contextItems.filter(item => item.id !== itemId);
        this.saveToSettings();
    }

    /**
     * Get context summary for AI integration
     * @returns {string} Formatted context summary
     */
    getContextSummary() {
        if (this.contextItems.length === 0) {
            return "No documents in context.";
        }

        const summary = this.contextItems.map(item => 
            `- ${item.documentName} (${item.documentType})`
        ).join('\n');

        return `Current context (${this.contextItems.length} items):\n${summary}`;
    }

    /**
     * Get document name helper
     * @private
     * @param {string} documentType 
     * @param {string} documentId 
     * @returns {string}
     */
    getDocumentName(documentType, documentId) {
        try {
            const collection = game.collections.get(documentType);
            const document = collection?.get(documentId);
            return document?.name || `${documentType} ${documentId}`;
        } catch (error) {
            return `${documentType} ${documentId}`;
        }
    }

    /**
     * Check if document still exists
     * @private
     * @param {string} documentType 
     * @param {string} documentId 
     * @returns {boolean}
     */
    documentExists(documentType, documentId) {
        try {
            const collection = game.collections.get(documentType);
            return !!collection?.get(documentId);
        } catch (error) {
            return false;
        }
    }

    /**
     * Load context from settings
     * @private
     */
    loadFromSettings() {
        try {
            const saved = game.settings.get('simulacrum', 'contextItems') || [];
            this.contextItems = saved;
        } catch (error) {
            console.warn('Simulacrum | Failed to load context from settings:', error);
            this.contextItems = [];
        }
    }

    /**
     * Save context to settings
     * @private
     */
    saveToSettings() {
        try {
            game.settings.set('simulacrum', 'contextItems', this.contextItems);
        } catch (error) {
            console.error('Simulacrum | Failed to save context to settings:', error);
        }
    }
}