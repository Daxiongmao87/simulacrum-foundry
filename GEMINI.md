# GEMINI.md

## Project Overview

This project is a Foundry VTT module called "Simulacrum: AI Campaign Assistant". It provides an AI-powered assistant that allows users to manage their campaign documents using natural language. The module is built with JavaScript and integrates with the Foundry VTT API. It has a user interface built with Handlebars templates and a backend that communicates with an AI service. The AI can use a set of tools to interact with Foundry documents, including creating, reading, updating, and deleting them.

## Building and Running

The following scripts are available in `package.json` to build, run, and test the project:

*   `npm test`: Run the test suite using Jest.
*   `npm run test:watch`: Run the test suite in watch mode.
*   `npm run test:coverage`: Generate a test coverage report.
*   `npm run lint`: Lint the codebase using ESLint.
*   `npm run format`: Format the codebase using Prettier.
*   `npm run package:module`: Package the module for distribution.
*   `mcp_projectTools_deploy_module`: Deploy the current module code to the remote Foundry VTT server via SSH.

## Deployment Workflow

The project is deployed to a remote Foundry VTT server acting as the development environment.

### 1. Deployment Check
Ensure you have SSH access to the remote server configured. The deployment script uses `scp` and `ssh` to:
1.  Generate a build hash.
2.  Package the module.
3.  Upload to `${DEPLOY_HOST}`.
4.  Unzip and restart the Foundry VTT service.

### 2. Deploying Changes
> [!IMPORTANT]
> **ALWAYS REDEPLOY AFTER CHANGES**
> You MUST run the deployment script after making ANY changes to code, styles, or templates.
>
> **Command:**
> mcp_projectTools_deploy_module

### 3. Verification
After deployment, the Foundry VTT instance will automatically restart. Refresh your browser to see changes.
