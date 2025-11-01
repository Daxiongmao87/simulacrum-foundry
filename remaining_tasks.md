1. Simulacrum Chat's tab, when right-clicked, should detach from the sidebar into a sidebar-popout class, just like the Chat Message tab does.  This will require heavy research in the foundryvtt source code on how that functionality works.
2. When the chat message tab is detached, then reattached, the simulacrum chat input disappears, I believe this is due to shared selectors, and foundryvtt function probably deletes all instances of that selector when reverting from sidebar-popout back to sidebar
3. We need to include a Macro Compendium with Simulacrum that should be accessible and executable by the ai, with an example macro with optional parameters that demonstrates how to create macros and how the AI would use them.
4. We should also reject documents that are using non-existent image urls.
5. We should include tools to list/search artifacts (filepicker), using the filepicker class to access artifacts.  This should be paginated, and should have a filter that supports regex.  So theoretically the AI could use this to search for all sorts of file types, including images.  It should search both the userdata (public I believe?) and core data.
6. Github action to manually trigger a module publication, using semver, and automatically incrementing based on the changes since the last release.  This means we will need to also have a commit hook that restricts the commit message so that it is parsable and compatible with the semver derivation logic.
7. Integrate document linking functionality that the chat messages sidebar has.  You can drag and drop documents.  Dragging and dropping into the Enter Message field generates this string '@UUID[Actor.7F88BtaHfjItc4FT]{Gloomhoof}' (example), and when submitted, it appears like this:
```
<a class="content-link" draggable="true" data-link="" data-uuid="Actor.7F88BtaHfjItc4FT" data-id="7F88BtaHfjItc4FT" data-type="Actor" data-tooltip="Actor" data-tooltip-text="Non-Player Character Actor"><i class="fa-solid fa-user" inert=""></i>Gloomhoof</a>
```
8. when relodaing the foundryvtt instance, and the simulacrum chat history is reloaded, the original greeting is lost.  I believe this is because we are not treating the original greeting as part of the history, which it absolutely should, even though it wasn't AI generated.  I believe we made some incorrect design decisions to work around this when ew should have just added the greeting as part of the chat history.
9. The "Thinking" DOM should ALWAYS be present at the BOTTOM of the chat log from when the user sends a message, to when the AI is done responding.  Currently it's not consistent
10. "Thinking" string within the DOM should rotate between several words, populated in an array lang/en.json.  We should use more fantastical words, considering the theme.
11. The "Thinking" dom should have a transparent background, where only the Word is visible, in a violet text with a soft black dropshadow for visibility.
12. The "Ask me about your campaign documents..." should instead say "Enter message" just like the chat messages sidebar
13. When simulacrum is responding, the chat input is disabled.  The intent is so that the user should NOT be able to send messages while the AI is working.  However, I want the user to be able to write their next message, but just disable the actual submission function (unable to hit enter to submit)
14. shift+enter should enter a new line in the chat input for simulacrum
15. when the AI is working, if the user's focus is in the simulacrum chat box, hitting 'escape' key should function just like cancelling/stopping the AI.
16. The sidebar button for simulacrum (ui-control plain icon fa-solid fa-hand-sparkles-active) should have a subtle magical glow (violet) around the fa-hand-sparkles-active to give it a 'magical' feel
16. The background-color of the simulacrum chat-message should be: rgb(18, 21, 21), a dark gray color.  The font should be a pale gold, (message-header and message-content).  This means we need a new selector added to chat-message so that it can be specifically targetted without affecting the foundry-vtt chat-message. The chat-message::before should use texture-dgray1.webp, provided by this module (assets/texture-dgray1.webp). 
17. Change the default Simulacrum font to: dumbledor.ttf, provided in assets/fonts.  Also add a dropdown option in the simulacrum config to select different fonts (all available in the assets/fonts folder)
18. Currently, the custom system prompt config is a single-line input field, and should be a textarea.  Look at the divination-foundry reference to see how it was done there.
19. We should combine the AI's response into ONE message, with a custom DOM for informing the user of tool calls (i.e. "<i class="simulacrum-tool-document-read-icon fa-solid fa-book-sparkles"></i> Read '<a class="simulacrum-tool-document-text-color">Actor</a>' document '@UUID[Actor.7F88BtaHfjItc4FT]{Gloomhoof}'" (simulacrum-document-read-icon should be green colored to indicate success), or "<i class="simulacrum-tool-fail fa-solid fa-triangle-exclamation"></i> Failed to Read '<simulacrum-tool-document-text-color'>Actor</a>' document.") Of course, using the @UUID should automatically trigger foundryvtt document display logic if item 7 is implemented correctly
20. We need to handle this error from gemini-type api endpoints:
```
{
  "candidates": [
    {
      "finishReason": "MALFORMED_FUNCTION_CALL",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 11026,
    "totalTokenCount": 11026,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 11026
      }
    ]
  },
  "modelVersion": "gemini-2.5-flash",
  "responseId": "Y7zQaIUwnfaOsQ-o3JzhCA"
}
```
I think the solution is to treat this as a failure retry path, I assume this is because of a malformed tool call? I'm not sure.  Worth looking into.
21.  We need to ensure ALL outputs have an absolute maximum output before truncated, I would say something like 10,000 characters.  Each tool call that we expect could possibly return large amounts of data (documents in genreal) should have the options to determine start and end lines so that the AI can choose how much of the document to view and where.  Of course, this should also handle/catch inputted ranges outside of the document's size gracefully
22. We need to refactor the system prompt layout in en.json so that it is more human-readable.  We currently have arbitrary fields like "Intro", "Instructions", etc.  They are broken up to keep from having one massive new-line-riddled system prompt field, but really we should be using an array if localization i18n supports it.
23. We should really tighten up the system prompt so that the AI understands when either answering campaign-specific questions, creating, updating, or deleting documents, that it needs to strategize, properly research existing documents for context, properly inspect document schemas for accuracy, and THEN perform the task.
24. we need to add an api request delay timer config option (default 0 seconds) to combat/prevent throttling.
