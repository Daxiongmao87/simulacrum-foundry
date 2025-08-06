import { Dialog } from "foundry";

export class SimulacrumConfirmationService {
    constructor() {
        this.confirmationCache = new Map();
    }

    async requestConfirmation(toolName, toolDescription, parameters, options = {}) {
        const cacheKey = `${toolName}-${JSON.stringify(parameters)}`;
        
        if (this.confirmationCache.has(cacheKey)) {
            return this.confirmationCache.get(cacheKey);
        }
        
        const dialogContent = await this.buildConfirmationDialog(toolName, toolDescription, parameters, options);
        
        return new Promise((resolve) => {
            new Dialog({
                title: `Confirm Tool Execution: ${toolName}`,
                content: dialogContent,
                buttons: {
                    yesOnce: {
                        label: "Yes, once",
                        callback: () => {
                            resolve({ confirmed: true, savePreference: false });
                        }
                    },
                    yesAlways: {
                        label: "Yes, always",
                        callback: () => {
                            this.confirmationCache.set(cacheKey, { confirmed: true, savePreference: true });
                            resolve({ confirmed: true, savePreference: true });
                        }
                    },
                    modify: {
                        label: "Modify",
                        callback: () => {
                            resolve({ confirmed: false, modify: true });
                        }
                    },
                    cancel: {
                        label: "Cancel",
                        callback: () => {
                            resolve({ confirmed: false });
                        }
                    }
                },
                default: "yesOnce"
            }).render(true);
        });
    }

    async buildConfirmationDialog(toolName, toolDescription, parameters, options) {
        const impact = await this.assessToolImpact(toolName, parameters);
        
        return `
            <div class="simulacrum-confirmation">
                <h3>${toolName}</h3>
                <p>${toolDescription}</p>
                <div class="parameters">
                    <h4>Parameters:</h4>
                    <pre>${JSON.stringify(parameters, null, 2)}</pre>
                </div>
                <div class="impact-assessment">
                    <h4>Expected Impact:</h4>
                    <p>${impact}</p>
                </div>
            </div>
        `;
    }

    async assessToolImpact(toolName, parameters) {
        switch (toolName) {
            case "create_document":
                return `Will create a new ${parameters.documentType} document`;
            case "update_document":
                return `Will modify existing ${parameters.documentType} document`;
            case "delete_document":
                return `Will permanently delete ${parameters.documentType} document`;
            default:
                return "Will execute the requested operation";
        }
    }

    clearCache() {
        this.confirmationCache.clear();
    }
}
