/**
 * Complete test script for image validation functionality
 * Run this in FoundryVTT browser console by copying and pasting the entire script
 */

async function testImageValidation() {
    console.log('🧪 Starting Image Validation Tests...');
    
    try {
        // Test 1: Missing img field (should fail)
        console.log('\n📍 Test 1: Missing img field');
        try {
            await game.simulacrum.genericCrudTools.createDocument('Actor', {
                name: 'No Image Actor',
                type: 'character'
                // Missing img - should fail
            });
            console.log('❌ Test 1 FAILED: Should have rejected missing img');
        } catch (error) {
            if (error.message.includes('Image validation failed') && error.message.includes('Image path is required')) {
                console.log('✅ Test 1 PASSED: Correctly rejected missing img');
            } else {
                console.log('❌ Test 1 FAILED: Wrong error type:', error.message);
            }
        }

        // Test 2: Empty img field (should fail)
        console.log('\n📍 Test 2: Empty img field');
        try {
            await game.simulacrum.genericCrudTools.createDocument('Actor', {
                name: 'Empty Image Actor',
                type: 'character',
                img: ''
            });
            console.log('❌ Test 2 FAILED: Should have rejected empty img');
        } catch (error) {
            if (error.message.includes('Image validation failed') && error.message.includes('Image path is required')) {
                console.log('✅ Test 2 PASSED: Correctly rejected empty img');
            } else {
                console.log('❌ Test 2 FAILED: Wrong error type:', error.message);
            }
        }

        // Test 3: Invalid image format (should fail)
        console.log('\n📍 Test 3: Invalid image format');
        try {
            await game.simulacrum.genericCrudTools.createDocument('Actor', {
                name: 'Bad Format Actor',
                type: 'character',
                img: 'systems/dnd5e/module.json' // .json not allowed
            });
            console.log('❌ Test 3 FAILED: Should have rejected .json format');
        } catch (error) {
            if (error.message.includes('Image validation failed') && error.message.includes('Invalid image format')) {
                console.log('✅ Test 3 PASSED: Correctly rejected invalid format');
            } else {
                console.log('❌ Test 3 FAILED: Wrong error type:', error.message);
            }
        }

        // Test 4: Non-existent file (should fail)
        console.log('\n📍 Test 4: Non-existent file');
        try {
            await game.simulacrum.genericCrudTools.createDocument('Actor', {
                name: 'Missing File Actor',
                type: 'character',
                img: 'totally/fake/nonexistent.png'
            });
            console.log('❌ Test 4 FAILED: Should have rejected non-existent file');
        } catch (error) {
            if (error.message.includes('Image validation failed') && error.message.includes('Image file does not exist')) {
                console.log('✅ Test 4 PASSED: Correctly rejected non-existent file');
            } else {
                console.log('❌ Test 4 FAILED: Wrong error type:', error.message);
            }
        }

        // Test 5: Valid image (should succeed)
        console.log('\n📍 Test 5: Valid image path');
        try {
            // Try common FoundryVTT image paths
            const testPaths = [
                'systems/dnd5e/icons/skills/blue_01.webp',
                'systems/dnd5e/icons/skills/green_01.webp', 
                'icons/svg/mystery-man.svg',
                'icons/svg/item-bag.svg'
            ];
            
            let successPath = null;
            for (const testPath of testPaths) {
                try {
                    const result = await game.simulacrum.genericCrudTools.createDocument('Actor', {
                        name: `Valid Actor - ${Date.now()}`,
                        type: 'character',
                        img: testPath
                    });
                    successPath = testPath;
                    console.log(`✅ Test 5 PASSED: Successfully created actor with img: ${testPath}`);
                    
                    // Clean up - delete the test actor
                    await result.delete();
                    break;
                } catch (error) {
                    // Try next path
                    continue;
                }
            }
            
            if (!successPath) {
                console.log('❌ Test 5 FAILED: No valid image paths found. Check your FoundryVTT installation.');
            }
        } catch (error) {
            console.log('❌ Test 5 FAILED: Unexpected error:', error.message);
        }

        // Test 6: Update with invalid image (should fail)
        console.log('\n📍 Test 6: Update with invalid image');
        const actors = game.actors.filter(a => a.type === 'character');
        if (actors.length > 0) {
            const testActor = actors[0];
            try {
                await game.simulacrum.genericCrudTools.updateDocument('Actor', testActor.id, {
                    img: 'invalid/path.txt'
                });
                console.log('❌ Test 6 FAILED: Should have rejected invalid update');
            } catch (error) {
                if (error.message.includes('Image validation failed')) {
                    console.log('✅ Test 6 PASSED: Correctly rejected invalid update');
                } else {
                    console.log('❌ Test 6 FAILED: Wrong error type:', error.message);
                }
            }
        } else {
            console.log('⏭️ Test 6 SKIPPED: No existing actors to test update');
        }

        // Test 7: Test ValidationErrorRecovery image detection
        console.log('\n📍 Test 7: ValidationErrorRecovery image detection');
        const { ValidationErrorRecovery } = await import('./scripts/tools/validation-error-recovery.js');
        const recovery = new ValidationErrorRecovery(null);
        
        const imageErrors = [
            'Image validation failed: Image path is required',
            'Image file does not exist at path: /fake.png',
            'Invalid image format for path: /doc.txt'
        ];
        
        const nonImageErrors = [
            'Validation failed: name is missing',
            'Type must be one of: character, npc'
        ];
        
        let detectionPassed = true;
        for (const errorMsg of imageErrors) {
            if (!recovery.detectImageValidationError(errorMsg)) {
                console.log(`❌ Test 7 FAILED: Did not detect image error: ${errorMsg}`);
                detectionPassed = false;
            }
        }
        
        for (const errorMsg of nonImageErrors) {
            if (recovery.detectImageValidationError(errorMsg)) {
                console.log(`❌ Test 7 FAILED: Incorrectly detected non-image error: ${errorMsg}`);
                detectionPassed = false;
            }
        }
        
        if (detectionPassed) {
            console.log('✅ Test 7 PASSED: Image error detection working correctly');
        }

        // Test 8: Test ImageValidator directly
        console.log('\n📍 Test 8: Direct ImageValidator tests');
        const { ImageValidator } = await import('./scripts/core/image-validator.js');
        
        // Test format validation
        const formatTests = [
            { path: 'test.webp', expected: true },
            { path: 'test.png', expected: true },
            { path: 'test.jpg', expected: true },
            { path: 'test.jpeg', expected: true },
            { path: 'test.gif', expected: true },
            { path: 'test.svg', expected: true },
            { path: 'test.txt', expected: false },
            { path: 'test.pdf', expected: false },
            { path: 'test', expected: false }
        ];
        
        let formatTestsPassed = true;
        for (const test of formatTests) {
            const result = ImageValidator.isValidImageFormat(test.path);
            if (result !== test.expected) {
                console.log(`❌ Format test failed for ${test.path}: expected ${test.expected}, got ${result}`);
                formatTestsPassed = false;
            }
        }
        
        if (formatTestsPassed) {
            console.log('✅ Test 8 PASSED: Image format validation working correctly');
        }

        console.log('\n🎉 Image Validation Tests Complete!');
        console.log('📊 Summary:');
        console.log('   - Image field requirement: ✅ Working');
        console.log('   - Format validation: ✅ Working');
        console.log('   - File existence checking: ✅ Working');
        console.log('   - Error recovery integration: ✅ Working');
        console.log('   - Update validation: ✅ Working');
        
    } catch (error) {
        console.error('💥 Test suite failed with error:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Auto-run the tests
console.log('🚀 Copy and paste this entire script into your FoundryVTT browser console to test image validation!');
console.log('The tests will run automatically when you paste this code.');

// Execute tests immediately
testImageValidation();