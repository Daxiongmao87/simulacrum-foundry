# Image Validation Architecture Design

## Overview
Dynamic image validation system that makes the `img` property required for all FoundryVTT documents without hardcoding document types.

## Architecture Approach

### 1. **Hook-Based Validation** (Recommended Approach)
- **Principle**: Use FoundryVTT's document lifecycle hooks to intercept and validate before native processing
- **Implementation**: Hook into `preCreateDocument` and `preUpdateDocument` events
- **Benefits**: Non-intrusive, works with all document types, maintains FoundryVTT compatibility

### 2. **Components**

#### A. ImageValidator Class (`scripts/core/image-validator.js`)
```javascript
export class ImageValidator {
  static async validateImagePath(imagePath, options = {})
  static async validateDocumentImages(documentData, documentType)
  static isImageField(fieldName)
  static async fileExists(path)
  static isValidImageFormat(path)
}
```

#### B. Enhanced GenericCRUDTools Integration
- Pre-validate image fields in `createDocument()` and `updateDocument()`
- Call `ImageValidator.validateDocumentImages()` before native FoundryVTT calls
- Integrate with existing `ValidationErrorRecovery` system

#### C. Dynamic Field Detection
- **Primary Target**: Fields named exactly "img"  
- **Secondary**: Fields matching patterns: img, image, avatar, icon, src, texture
- **Detection Method**: Runtime schema inspection using `FoundrySchemaExtractor`

### 3. **Validation Rules**

#### Required Image Field ("img")
- **Rule**: All documents MUST have a non-empty `img` field
- **Implementation**: Check if `img` field exists and is not null/empty/undefined
- **Override**: Force `img` to be required even if FoundryVTT schema says it's optional

#### File Path Validation
- **File Existence**: Verify the file exists in FoundryVTT's data directory
- **Format Validation**: Ensure file extension is supported image format (.png, .jpg, .jpeg, .gif, .svg, .webp)
- **Path Safety**: Validate path doesn't attempt directory traversal

#### Accessibility Validation
- **Permission Check**: Verify the file is readable by the current user
- **Size Reasonable**: Optional check for file size (prevent massive files)

### 4. **Integration Points**

#### A. GenericCRUDTools Enhancement
```javascript
async createDocument(documentType, data) {
  // PRE-VALIDATION: Make img required + validate images
  await ImageValidator.validateDocumentImages(data, documentType);
  
  // Continue with normal flow...
  const { collection, subtype } = await this.discoveryEngine.normalizeDocumentType(documentType);
  
  if (subtype) {
    data.type = subtype;
  }

  const DocumentClass = CONFIG[collection]?.documentClass;
  // ... rest of normal flow
}
```

#### B. Hook-Based Validation (Alternative/Supplementary)
```javascript
// In main.js during init
Hooks.on('preCreateActor', validateImagesHook);
Hooks.on('preCreateItem', validateImagesHook);
Hooks.on('preCreateScene', validateImagesHook);
// ... for all USER_CREATABLE_COLLECTIONS

function validateImagesHook(document, data, options, userId) {
  return ImageValidator.validateDocumentImages(data, document.documentName);
}
```

### 5. **Error Handling & Recovery**

#### Enhanced ValidationErrorRecovery
- **Image-Specific Patterns**: Detect image validation errors specifically
- **Contextual Guidance**: Provide suggestions for valid image paths
- **Integration with list_images**: Suggest using existing tools to find valid images

#### Error Messages
- **Clear Feedback**: "Image field 'img' is required and must be a valid file path"
- **Specific Guidance**: "File 'invalid/path.png' not found. Use list_images tool to find available images"
- **Correction Prompts**: Include valid image examples in AI retry prompts

### 6. **Performance Considerations**

#### Validation Caching
- **Cache Results**: Cache validation results for 12 hours per file
- **Cache Key**: File path + modification time
- **Cache Management**: Automatic cleanup of stale entries

#### Async Operations
- **Non-Blocking**: All file system checks are async
- **Timeout Protection**: 30-second timeout for file access checks
- **Batch Processing**: Validate multiple images concurrently

### 7. **Implementation Strategy**

#### Phase 1: Core Validation
1. Create `ImageValidator` class with basic file existence check
2. Integrate with `GenericCRUDTools` for `img` field requirement
3. Basic error reporting

#### Phase 2: Enhanced Validation  
1. Add format validation and accessibility checks
2. Implement caching system
3. Enhanced error messages with suggestions

#### Phase 3: AI Integration
1. Integrate with `ValidationErrorRecovery`
2. Context-aware error prompts
3. Integration with list_images tool

## Technical Advantages

### Non-Hacky Approach
- **Standards Compliant**: Uses FoundryVTT's intended extension mechanisms
- **Maintainable**: Clear separation of concerns
- **Testable**: Each component can be unit tested independently

### Dynamic & Flexible
- **No Hardcoding**: Works with any document type that has image fields
- **System Agnostic**: Works across all FoundryVTT game systems
- **Extensible**: Easy to add new image field patterns or validation rules

### Performance Conscious
- **Lazy Loading**: Only validate when documents are created/updated
- **Efficient Caching**: Avoid redundant file system calls
- **Graceful Degradation**: Continues working even if validation has issues

## Configuration Options

### Settings Integration
- `imageValidation.enabled` (default: true)
- `imageValidation.requireImgField` (default: true) 
- `imageValidation.validateFileExists` (default: true)
- `imageValidation.cacheValidationResults` (default: true)
- `imageValidation.validationTimeout` (default: 30 seconds)

This architecture provides a robust, maintainable, and efficient solution for dynamic image validation without hardcoding document types.