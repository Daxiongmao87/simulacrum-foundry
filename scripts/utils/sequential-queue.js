/**
 * A utility class to manage a queue of async tasks, ensuring they execute sequentially.
 * Useful for preventing race conditions in UI updates (e.g., chat streaming).
 */
export class SequentialQueue {
    constructor() {
        this.queue = Promise.resolve();
    }

    /**
     * Add a task to the queue.
     * @param {Function} task - A function that returns a Promise (or is sync).
     * @returns {Promise<any>} - Resolves with the result of the task.
     */
    add(task) {
        // Chain the new task to the end of the existing queue
        const next = this.queue.then(() => task()).catch((err) => {
            console.error("SequentialQueue task failed:", err);
            // We catch here to ensure the queue chain isn't broken for subsequent tasks
            throw err;
        });

        // Update the queue pointer, but catch errors to keep the chain valid for the *next* add() call
        // (The checking above propagates the error to the caller of .add())
        this.queue = next.catch(() => { });

        return next;
    }
}
