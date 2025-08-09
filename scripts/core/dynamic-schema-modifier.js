import { FoundrySchemaExtractor } from "./foundry-schema-extractor.js";

// Lazy load ImageValidator to avoid timing issues with FoundryVTT globals
let ImageValidator = null;
async function getImageValidator() {
    if (!ImageValidator) {
        const module = await import("./image-validator.js");
        ImageValidator = module.ImageValidator;
    }
    return ImageValidator;
}

/**
 * Dynamically modifies FoundryVTT document schemas to enforce the 'img' field as required.
 * This is applied to all document types that define an 'img' property.
 * The modification is performed lazily on the first preCreateDocument/preUpdateDocument hook invocation for each document class.
 */
export function registerDynamicSchemaModifier(documentDiscoveryEngine) {
    console.log('Simulacrum | Registering dynamic schema modifier hooks...');
    console.log('Simulacrum | Current Hooks object:', typeof Hooks, Hooks);
    
    // Get all document types dynamically
    const documentTypes = documentDiscoveryEngine.getAllDocumentTypes();
    console.log('Simulacrum | Found document types:', documentTypes);
    
    // Create validation hook function
    const createValidationHook = (documentType) => {
        return (document, data, options, userId) => {
            console.log(`Simulacrum | preCreate${documentType} hook fired!`);
            console.log(`Simulacrum | Document data:`, data);
            const collectionName = document.collection.name;
            console.log(`Simulacrum | Collection name:`, collectionName);
            // Convert plural collection name to singular for CONFIG lookup
            const singularName = collectionName.replace(/s$/, '');
            console.log(`Simulacrum | Singular name for CONFIG:`, singularName);
            const DocumentClass = CONFIG[singularName]?.documentClass;
            console.log(`Simulacrum | DocumentClass:`, DocumentClass);
        
        // Only validate documents that have img field in schema
        if (!DocumentClass) {
            console.log(`Simulacrum | No DocumentClass found, returning`);
            return;
        }
        const schema = DocumentClass.schema || (DocumentClass.defineSchema && DocumentClass.defineSchema());
        console.log(`Simulacrum | Schema:`, schema);
        console.log(`Simulacrum | Schema fields:`, schema?.fields);
        console.log(`Simulacrum | Schema img field:`, schema?.fields?.img);
        if (!schema || !schema.fields?.img) {
            console.log(`Simulacrum | No schema or img field found, returning`);
            return;
        }

        console.log(`Simulacrum | Schema has img field, proceeding with validation`);
        
        // Make img field required in schema (synchronous)
        if (schema.fields.img && !schema.fields.img.required) {
            schema.fields.img.required = true;
        }

        // Validate img field presence (synchronous checks only)
        const imgPath = data.img;
        console.log(`Simulacrum | img path from data:`, imgPath);
        if (!imgPath || imgPath.trim() === "") {
            console.log(`Simulacrum | img field is missing or empty, blocking creation`);
            ui.notifications.error(`${DocumentClass.name} validation errors:\n  img: may not be undefined`);
            return false; // Prevent creation
        }
        console.log(`Simulacrum | img field is valid, allowing creation`);
        
        // Async validation will be handled separately after this hook
        // Store validation promise for later checking
        document._imgValidationPromise = (async () => {
            try {
                const validator = await getImageValidator();
                if (!validator.isValidImageFormat(imgPath)) {
                    return { error: `${DocumentClass.name} validation errors:\n  img: invalid image format` };
                }
                const exists = await validator.fileExists(imgPath);
                if (!exists) {
                    return { error: `${DocumentClass.name} validation errors:\n  img: file does not exist` };
                }
                return { success: true };
            } catch (error) {
                return { error: `${DocumentClass.name} validation errors:\n  img: ${error.message}` };
            }
        })();
        };
    };

    // Register hooks for each document type dynamically
    const registeredHooks = [];
    for (const docType of documentTypes) {
        const hookName = `preCreate${docType}`;
        console.log(`Simulacrum | Registering ${hookName} hook...`);
        const hookResult = Hooks.on(hookName, createValidationHook(docType));
        registeredHooks.push({ hook: hookName, id: hookResult });
        console.log(`Simulacrum | ${hookName} hook registered with ID:`, hookResult);
    }

    // Hook into document update
    console.log('Simulacrum | About to register preUpdateDocument hook...');
    const updateHookResult = Hooks.on("preUpdateDocument", (document, updates, options, userId) => {
        console.log('Simulacrum | preUpdateDocument hook fired!');
        // Only validate if img field is being updated
        if (updates.img === undefined) return;
        
        const collectionName = document.collection.name;
        const DocumentClass = CONFIG[collectionName]?.documentClass;
        if (!DocumentClass) return;
        
        const schema = DocumentClass.schema || (DocumentClass.defineSchema && DocumentClass.defineSchema());
        if (!schema || !schema.img) return;

        // Make img field required in schema (synchronous)
        if (schema.img && !schema.img.required) {
            schema.img.required = true;
        }

        // Validate img field presence (synchronous checks only)
        const imgPath = updates.img;
        if (!imgPath || imgPath.trim() === "") {
            ui.notifications.error(`${DocumentClass.name} validation errors:\n  img: may not be undefined`);
            return false; // Prevent update
        }
        
        // Store async validation for later (same pattern as create)
        document._imgValidationPromise = (async () => {
            try {
                const validator = await getImageValidator();
                if (!validator.isValidImageFormat(imgPath)) {
                    return { error: `${DocumentClass.name} validation errors:\n  img: invalid image format` };
                }
                const exists = await validator.fileExists(imgPath);
                if (!exists) {
                    return { error: `${DocumentClass.name} validation errors:\n  img: file does not exist` };
                }
                return { success: true };
            } catch (error) {
                return { error: `${DocumentClass.name} validation errors:\n  img: ${error.message}` };
            }
        })();
    });
    console.log('Simulacrum | preUpdateDocument hook registration result:', updateHookResult);
    
    console.log('Simulacrum | Dynamic schema modifier hooks registered successfully');
    console.log('Simulacrum | Registered hooks:', registeredHooks);
    console.log('Simulacrum | preUpdateDocument hooks registered:', Hooks.events?.preUpdateDocument?.length || 0);
}
