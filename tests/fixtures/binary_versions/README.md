# FoundryVTT Binary Versions

This directory contains FoundryVTT binary files organized by version for Docker-based integration testing.

## Directory Structure

```
binary_versions/
├── v12/
│   └── FoundryVTT-12.343.zip
├── v13/ 
│   └── FoundryVTT-Node-13.347.zip
└── README.md (this file)
```

## Version Organization

Each version folder contains exactly one ZIP file:
- **Folder name**: Version identifier (e.g., `v12`, `v13`)
- **ZIP file**: Official FoundryVTT download for that version

## Usage by DockerTestRunner

The DockerTestRunner discovers available versions by:
1. Scanning subdirectories in `binary_versions/`
2. Finding the single ZIP file in each version directory
3. Using folder name as version identifier
4. Building Docker images with the discovered binaries

## Adding New Versions

To add a new FoundryVTT version:

1. Create a new subdirectory with the version name:
   ```bash
   mkdir tests/fixtures/binary_versions/v14
   ```

2. Place the official FoundryVTT ZIP file in the directory:
   ```bash
   cp ~/Downloads/FoundryVTT-14.xyz.zip tests/fixtures/binary_versions/v14/
   ```

3. Update `tests/config/test.config.template.json` to include the new version:
   ```json
   {
     "versions": [
       {
         "version": "v14",
         "zipFile": "FoundryVTT-14.xyz.zip",
         "enabled": true
       }
     ]
   }
   ```

## Security Considerations

- **License compliance**: Only use legally obtained FoundryVTT binaries
- **Version verification**: Verify ZIP file integrity before adding
- **Access control**: These binaries are for testing purposes only

## Integration with Testing Framework

The DockerTestRunner uses this structure to:
- Build version-specific Docker images
- Run cross-version compatibility tests  
- Validate Simulacrum module against multiple FoundryVTT versions
- Ensure system-agnostic functionality

## File Naming Convention

- Folder names: `v{major}` (e.g., `v12`, `v13`, `v14`)
- ZIP files: Official FoundryVTT naming (preserve original names)
- No spaces or special characters in folder names

## Testing Matrix

Each version × system combination creates a test environment:
- **v12 + dnd5e**: Classic D&D 5e testing
- **v13 + pf2e**: Modern Pathfinder testing  
- **v12 + generic**: Core functionality testing
- **v13 + generic**: Latest version compatibility

This ensures Simulacrum works across all supported FoundryVTT versions and game systems.

**Note:** These files are ignored by Git and should not be committed to the repository.
