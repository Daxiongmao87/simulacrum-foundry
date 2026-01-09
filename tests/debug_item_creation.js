
// MOCK GLOBAL FOUNDRY ENVIRONMENT (Minimal for DocumentAPI)
// We need to 'find' the Stormforged Blade. 
// Since we don't have a real DB, we can't 'load' it unless we use the actual Foundry server.
// BUT, the user provided a link to a live server. I cannot access that.
// HOWEVER, if the user ran the tool *via my previous deployment*, the data might be in the logs or I can simulate what HAPPENS.

// Actually, I can't inspect the remote server's DB. 
// I have to simulate the creation process again with the input I *think* the AI gave, and see what the result object looks like.

import { DocumentCreateTool } from '../scripts/tools/document-create.js';

// Setup Mock Environment
global.game = {
    documentTypes: { 'Item': ['Item'] },
    collections: {
        get: (type) => type === 'Item' ? { size: 0 } : undefined
    }
};

// MOCK DND5E WEAPON SCHEMA (Approximation)
const mockSchema = {
    fields: {
        name: {},
        type: {},
        system: {
            fields: {
                description: {
                    // In dnd5e, description is a SchemaField containing 'value', 'chat', 'unidentified'
                    fields: { value: { type: 'String' } },
                    constructor: { name: 'SchemaField' }
                },
                damage: {
                    fields: { parts: { type: 'Array' } },
                    constructor: { name: 'SchemaField' }
                },
                // 'abilities' is NOT a standard dnd5e field. 
                // 'activities' is the new one.
                activities: { type: 'Object' }
            }
        }
    },
    has: (key) => key === 'system',
    getField: (key) => key === 'system' ? mockSchema.fields.system : undefined
};

global.CONFIG = {
    Item: { documentClass: { documentName: 'Item', schema: mockSchema } }
};

async function debugCreation() {
    console.log('--- Simulating Creation of Stormforged Blade ---');

    const tool = new DocumentCreateTool();

    // Simulated Input from AI (based on User's provided output)
    const inputParams = {
        documentType: 'Item',
        name: 'Stormforged Blade',
        data: {
            items: [], // junk
            description: "The Stormforged Blade is a weapon of immense power...", // String provided
            abilities: { // Complex object provided
                "1": { name: "Lightning Strike", effect: "2d6 Lightning" }
            },
            price: "100,000 GP"
        }
    };

    // Mock internal validation to pass
    tool.validateParameters = () => true;
    tool.validateImageUrls = () => true;

    console.log('Input Data:', JSON.stringify(inputParams.data, null, 2));

    // Run the Tool's logic (which includes the migration fix I wrote)
    // We need to spy on the data transformation.

    try {
        await tool.execute(inputParams);
    } catch (e) {
        // Expected to fail on 'import' or 'createDocument', but we check data before that
    }

    console.log('--- Data AFTER Migration ---');
    console.log(JSON.stringify(inputParams.data, null, 2));

    // ANALYZE RESULT
    const sys = inputParams.data.system || {};

    console.log('\n--- Analysis ---');
    if (sys.description) {
        console.log('Description in System:', typeof sys.description);
        if (typeof sys.description === 'string') {
            console.log('ISSUE: Description is a STRING. Foundry Schema expects OBJECT { value: string }.');
            console.log('       Result: Foundry will likely ignore/drop this value or throw validation error.');
        }
    } else {
        console.log('ISSUE: Description NOT in system.');
    }

    if (sys.abilities) {
        console.log('Abilities in System:', sys.abilities);
    } else {
        console.log('ISSUE: Abilities NOT in system (likely rejected because "abilities" is not in schema fields).');
        console.log('       Available mock system fields:', Object.keys(mockSchema.fields.system.fields));
    }
}

debugCreation();
