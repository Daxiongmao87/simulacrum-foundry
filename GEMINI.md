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
*   `npm run launch:foundry`: Launch a Foundry VTT instance for development.
*   `npm run deploy:module`: Deploy the module to a Foundry VTT instance.
*   `npm run build:foundry-image`: Build a Docker image for Foundry VTT.
*   `npm run:foundry`: Run a Foundry VTT instance in a detached Docker container.

## Development Conventions

The project uses ESLint and Prettier to enforce a consistent coding style. There are also pre-commit hooks set up with Husky to ensure that code is linted and formatted before being committed. The project has a comprehensive test suite using Jest. All code should be well-documented and follow the existing coding style.
