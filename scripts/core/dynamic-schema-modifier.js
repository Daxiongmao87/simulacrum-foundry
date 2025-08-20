// import { FoundrySchemaExtractor } from './foundry-schema-extractor.js'; // Available for future use

// Lazy load ImageValidator to avoid timing issues with FoundryVTT globals
let ImageValidator = null;
async function getImageValidator() {
  if (!ImageValidator) {
    const module = await import('./image-validator.js');
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
  // Get all document types dynamically
  const documentTypes = documentDiscoveryEngine.getAllDocumentTypes();

  // Create validation hook function
  const createValidationHook = (_documentType) => {
    return (document, data, _options, _userId) => {
      const collectionName = document.collection.name;
      // Convert plural collection name to singular for CONFIG lookup
      const singularName = collectionName.replace(/s$/, '');
      const DocumentClass = CONFIG[singularName]?.documentClass;

      // Only validate documents that have img field in schema
      if (!DocumentClass) {
        return;
      }
      const schema =
        DocumentClass.schema ||
        (DocumentClass.defineSchema && DocumentClass.defineSchema());
      if (!schema || !schema.fields?.img) {
        return;
      }

      // Make img field required in schema (synchronous)
      if (schema.fields.img && !schema.fields.img.required) {
        schema.fields.img.required = true;
      }

      // Validate img field presence (synchronous checks only)
      const imgPath = data.img;
      if (!imgPath || imgPath.trim() === '') {
        ui.notifications.error(
          `${DocumentClass.name} validation errors:\n  img: may not be undefined`
        );
        return false; // Prevent creation
      }

      // Async validation will be handled separately after this hook
      // Store validation promise for later checking
      document._imgValidationPromise = (async () => {
        try {
          const validator = await getImageValidator();
          if (!validator.isValidImageFormat(imgPath)) {
            return {
              error: `${DocumentClass.name} validation errors:\n  img: invalid image format`,
            };
          }
          const exists = await validator.fileExists(imgPath);
          if (!exists) {
            return {
              error: `${DocumentClass.name} validation errors:\n  img: file does not exist`,
            };
          }
          return { success: true };
        } catch (error) {
          return {
            error: `${DocumentClass.name} validation errors:\n  img: ${error.message}`,
          };
        }
      })();
    };
  };

  // Register hooks for each document type dynamically
  const registeredHooks = [];
  for (const docType of documentTypes) {
    const hookName = `preCreate${docType}`;
    const hookResult = Hooks.on(hookName, createValidationHook(docType));
    registeredHooks.push({ hook: hookName, id: hookResult });
  }

  // Hook into document update
  Hooks.on('preUpdateDocument', (document, updates, _options, _userId) => {
    // Only validate if img field is being updated
    if (updates.img === undefined) {
      return;
    }

    const collectionName = document.collection.name;
    const DocumentClass = CONFIG[collectionName]?.documentClass;
    if (!DocumentClass) {
      return;
    }

    const schema =
      DocumentClass.schema ||
      (DocumentClass.defineSchema && DocumentClass.defineSchema());
    if (!schema || !schema.img) {
      return;
    }

    // Make img field required in schema (synchronous)
    if (schema.img && !schema.img.required) {
      schema.img.required = true;
    }

    // Validate img field presence (synchronous checks only)
    const imgPath = updates.img;
    if (!imgPath || imgPath.trim() === '') {
      ui.notifications.error(
        `${DocumentClass.name} validation errors:\n  img: may not be undefined`
      );
      return false; // Prevent update
    }

    // Store async validation for later (same pattern as create)
    document._imgValidationPromise = (async () => {
      try {
        const validator = await getImageValidator();
        if (!validator.isValidImageFormat(imgPath)) {
          return {
            error: `${DocumentClass.name} validation errors:\n  img: invalid image format`,
          };
        }
        const exists = await validator.fileExists(imgPath);
        if (!exists) {
          return {
            error: `${DocumentClass.name} validation errors:\n  img: file does not exist`,
          };
        }
        return { success: true };
      } catch (error) {
        return {
          error: `${DocumentClass.name} validation errors:\n  img: ${error.message}`,
        };
      }
    })();
  });
}
