// Test script to debug hook registration and create a document to trigger validation

console.log('=== Hook Debug Test Starting ===');

// Check hook registration
console.log('preCreateDocument hooks:', Hooks._hooks?.preCreateDocument?.length || 0);
console.log('preUpdateDocument hooks:', Hooks._hooks?.preUpdateDocument?.length || 0);

// Try creating an actor without img to trigger validation
setTimeout(async () => {
    try {
        console.log('=== Testing document creation without img ===');
        const testData = {
            name: "Test Actor For Image Validation",
            type: "character"
            // Intentionally omitting img field to trigger validation
        };
        
        console.log('Creating actor with data:', testData);
        const actor = await Actor.create(testData);
        console.log('Actor created successfully:', actor);
    } catch (error) {
        console.log('Expected validation error caught:', error.message);
    }
}, 2000);

console.log('=== Hook Debug Test Setup Complete ===');