export class SimulacrumToolScheduler {
    constructor(toolRegistry) {
        this.toolRegistry = toolRegistry;
        this.executeQueue = [];
        this.isExecuting = false;
        this.abortController = null;
    }

    async scheduleToolExecution(toolName, parameters, user) {
        return new Promise((resolve, reject) => {
            this.executeQueue.push({
                toolName,
                parameters,
                user,
                resolve,
                reject
            });
            
            if (!this.isExecuting) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        if (this.executeQueue.length === 0 || this.isExecuting) return;
        
        this.isExecuting = true;
        this.abortController = new AbortController();
        
        while (this.executeQueue.length > 0) {
            const task = this.executeQueue.shift();
            
            try {
                const result = await this.executeTask(task);
                task.resolve(result);
            } catch (error) {
                task.reject(error);
            }
            
            if (this.abortController.signal.aborted) break;
        }
        
        this.isExecuting = false;
        this.abortController = null;
    }

    async executeTask(task) {
        const { toolName, parameters, user } = task;
        
        const tool = this.toolRegistry.getTool(toolName);
        
        const confirmed = await this.toolRegistry.confirmExecution(user, toolName, parameters);
        if (!confirmed) {
            return { success: false, error: "Tool execution cancelled by user" };
        }
        
        return await tool.execute(parameters);
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.executeQueue = [];
    }
}
