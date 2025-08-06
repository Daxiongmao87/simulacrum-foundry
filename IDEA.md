# Simulacrum - The Foundry Campaign Assistant
Simulacrum is a FoundryVTT version 12 module that leverages AI using an openai api compatible endpoint to provide the Game Master and/or Assistant Game Master with an AI agent equipped with tools specifically catered to create, read, write, and (optionally) delete (CRUD) Documents within a Foundry World.  Document is the class Foundry lets systems use to create objects specific to that system.  For example: Dungeons & Dragons 5e has document types suc has characters, weapons, rolltables, journalentries, etc.

This module would provide a chat window for the user to be able to communicate with the AI for all sorts of campaign-related things, from simple questions the AI could retrieve the answer for by searching the documents, or for complex tasks like generating roll tables, journal entries for worldbuilding, etc.

All the necessary functionality of this module can be inferred by several open-source projects that already are available.  You need to use to research the implementation plan.

## Flow
As a user, I would open Simulacrum's chat window.  From there I can ask it questions, or give it a task.  It will be given the option to select any or multiple tool calls as well as whether or not it needs to continue working on the task after its response.  This is the basic agentic loop.  The button I used to send the message should turn into a 'cancel' while it is working/performing the task.  The button to cancel the agent at any time.

## Resources:
Below are the essential resources you MUST use during development:
- FoundryVTT v12 API Documentation: https://foundryvtt.com/api/v12/index.html
    The official FoundryVTT v12 API documentation for all things needed in order to undrestand FoundryVTT module development
- Foundry-Object-Manager: https://github.com/daxiongmao87/foundry-object-manager
    A node-based foundry document manipulation system with CRUD capabilities that uses puppeteer to interact with Foundry.  This is, functionally speaking, very close to what the tool-use portion of this module would be like.  This contains many of the endpoint information you will need to implement the tool-use section
- Gemini-CLI: https://github.com/google-gemini/gemini-cli
    Google's shell-driven AI agent application, fully open-sourced.  You need to research this implementation and how you would translate it to a foundry module.  You would replace the built-in tools with foundry-specific tools needed for our AI to interact and manipulate with the Foundry world.  We need a near-identifcal feature-set, including compaction, "yolo" mode, tool calls, etc.
- Divination-Foundry: https://github.com/Daxiongmao87/divination-foundry 
    An existing FoundryVTT module that uses Fimlib-Foundry to provide a simple AI chatbot to the GM.  This will be a good resource for you to deterimne how to use Fimlib-Foundry.
- Fimlib-Foundry: https://github.com/Daxiongmao87/fimlib-foundry
    A frontend foundry chat library you need to use to implement as a submodule.  You are free to update Fimlib as long as you push the changes you make to Fimlib back to the Fimlib repository.

## Configuration Options:
These are the options you must include for the Game Master/World Owner:
- OpenAI API endpoint (include v1)
- Model Name
- Context Length
- Allow Deletion
- Allow Assistant GM usage
- System Prompt (to be appended with core prompt)
- A list of all tools available to the AI, with the option to allow, autoconfirm, or deny.
- "Yolo" mode, which automatically accepts all confirmations (pretty much all tools are set to autoconfirm

