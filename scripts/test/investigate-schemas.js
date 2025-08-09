/**
 * Test script to investigate FoundryVTT document schemas and identify image fields
 */

import { DocumentDiscoveryEngine } from '../core/document-discovery-engine.js';
import { FoundrySchemaExtractor } from '../core/foundry-schema-extractor.js';

// Function to run in browser console to investigate schemas
window.investigateFoundrySchemas = async function () {
  console.log('=== FoundryVTT Document Schema Investigation ===');

  try {
    const engine = new DocumentDiscoveryEngine();
    const availableTypes = await engine.getAvailableTypes();

    console.log('Available document types:', Object.keys(availableTypes));

    // Check schemas for main collections that typically have images
    const mainCollections = ['Actor', 'Item', 'Scene', 'JournalEntry'];

    for (const collectionName of mainCollections) {
      if (!availableTypes[collectionName]) continue;

      console.log(`\n--- ${collectionName} Schema ---`);

      try {
        const schema =
          await FoundrySchemaExtractor.getDocumentSchema(collectionName);
        if (schema) {
          // Look for image-related fields
          for (const [fieldName, fieldDef] of Object.entries(schema)) {
            if (isImageField(fieldName, fieldDef)) {
              console.log(`IMAGE FIELD: ${fieldName}`, {
                type: fieldDef.constructor?.name,
                required: fieldDef.required,
                nullable: fieldDef.nullable,
                initial: fieldDef.initial,
                options: fieldDef.options,
              });
            }
          }

          // Also check for nested fields (like texture.src)
          for (const [fieldName, fieldDef] of Object.entries(schema)) {
            if (fieldDef.fields) {
              console.log(`Checking nested fields in ${fieldName}:`);
              for (const [nestedName, nestedDef] of Object.entries(
                fieldDef.fields
              )) {
                if (isImageField(nestedName, nestedDef)) {
                  console.log(
                    `NESTED IMAGE FIELD: ${fieldName}.${nestedName}`,
                    {
                      type: nestedDef.constructor?.name,
                      required: nestedDef.required,
                      nullable: nestedDef.nullable,
                    }
                  );
                }
              }
            }
          }
        } else {
          console.log(`No schema found for ${collectionName}`);
        }
      } catch (error) {
        console.error(`Error examining ${collectionName} schema:`, error);
      }
    }
  } catch (error) {
    console.error('Schema investigation failed:', error);
  }
};

// Helper function to identify if a field is likely an image field
function isImageField(fieldName, fieldDef) {
  const fieldNameLower = fieldName.toLowerCase();

  // Check field name patterns
  const imageFieldNames = [
    'img',
    'image',
    'avatar',
    'icon',
    'texture',
    'src',
    'portrait',
  ];
  const isImageByName = imageFieldNames.some((pattern) =>
    fieldNameLower.includes(pattern)
  );

  // Check if it's a string field (images are typically stored as file paths)
  const isStringField = fieldDef.constructor?.name === 'StringField';

  return isImageByName && isStringField;
}

console.log(
  'Schema investigation script loaded. Run investigateFoundrySchemas() in browser console.'
);
