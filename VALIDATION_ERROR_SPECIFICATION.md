# VALIDATION ERROR SPECIFICATION - ISSUE #17

## CRITICAL FINDINGS - WHAT OUR MODULE SHOULD PRODUCE

### Native FoundryVTT Error Format (BASELINE):
```
Actor5e validation errors:
  name: may not be undefined
  type: "invalidtype" is not a valid type for the Actor Document class
  prototypeToken: 
    name: may not be undefined
```

### Our Module's Normal Validation Error (WHAT WE ACTUALLY DO):
```
Error: Cannot read properties of undefined (reading 'name')

Original data: {
  "type": "invalidtype"
}

Document schema: {
  "_id": {
    "type": "DocumentIdField",
    "required": true,
    "nullable": true
  },
  "name": {
    "type": "StringField", 
    "required": true,
    "nullable": false
  },
  "img": {
    "type": "FilePathField",
    "required": false,
    "nullable": true  ← SCHEMA SHOWS IMG AS NOT REQUIRED
  },
  "type": {
    "type": "DocumentTypeField",
    "required": true,
    "nullable": false
  },
  [... full schema ...]
}

Review the schema and data for any discrepancies.
Please provide corrected data that satisfies the schema and explain the changes you made.
```

### Current Image Validation Error (INCONSISTENT):
```
Image validation failed for Actor: Document Actor | Field 'img': Image path is required and cannot be empty.

Original data: {
  "type": "invalidtype"
}

To resolve this, please ensure:
- The image path is correct and the file exists...
[... custom image guidance ...]
```

## SPECIFICATION REQUIREMENTS

### 1. CONSISTENCY REQUIREMENT
**Image validation errors MUST use the same format as normal validation errors**
- Same error message structure
- Same schema display
- Same correction prompt format
- NO special case handling

### 2. SCHEMA MODIFICATION REQUIREMENT  
**The schema shows `img` as `"required": false` but we need it required**
- Must dynamically modify schema to show `img` as `"required": true`
- Must ensure FoundryVTT validation actually enforces this requirement
- Must validate file path existence as additional check

### 3. ERROR FORMAT REQUIREMENT
**All validation errors should follow this pattern:**
```
Error: [Native FoundryVTT error message]

Original data: [JSON]

Document schema: [Modified schema with img required]

Review the schema and data for any discrepancies.
Please provide corrected data that satisfies the schema and explain the changes you made.
```

## KEY INSIGHTS

1. **Our module DOES show full schema for normal validation** ✅
2. **Image validation has completely different error handling** ❌  
3. **Schema correctly shows `img` as optional but we want it required** ❌
4. **We need to modify the schema representation, not bypass validation** ✅

## IMPLEMENTATION STRATEGY

**WRONG APPROACH** (current): Pre-validation with custom error messages
**RIGHT APPROACH**: Modify schema to make `img` required + validate file paths

The goal is to make `img` validation look identical to `name` validation - just another required field that happens to also check file existence.