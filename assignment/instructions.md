# AI Agent Commerce Assignment

## Goal

Build a minimal AI shopping copilot that helps a user discover relevant products through a conversational interface.

The system should understand user intent, retrieve relevant products from the provided API, and present those results clearly inside the chat.

## How We Evaluate

You may — and probably will — use AI assistants. That is fine and expected. But you own every decision in this submission. In the interview we will go deep on your choices: why this framework over alternatives, why this retrieval strategy, what failure modes you anticipated, what you tried and abandoned.

If you cannot articulate why you made a choice — or you only know that “the agent picked it” — that is the signal we are looking for. The assignment is about your judgment, not the artifact. A submission that runs perfectly but where you cannot defend the design is a weaker outcome than a simpler submission you fully understand.

## API

Use the DummyJSON Products API as the product catalog.

Base URL: https://dummyjson.com/products

The provided [DummyJSON Products OpenAPI specification](dummyjson_products_openapi.json) is included here in JSON format.

Use it to understand the available endpoints, filters, and query parameters. You do not need to use every endpoint. Choose the ones that make sense for your solution.

## What to Build

Build a locally runnable application with the following:

### Conversational experience

The user should be able to interact with the system through chat.

### Streaming responses

Assistant responses should stream into the chat as they are generated, not appear all at once after the full reply is ready.

### Product discovery

The system should identify what the user is looking for and retrieve relevant products from the API.

### In-chat product rendering

Product results should be rendered as a UI widget inside the chat, not just as plain text. Each result should display useful product information such as title, short description, price, and image.

### Conversation persistence

Conversations should persist across page refreshes. The user should not lose their chat history when reloading the browser.

### Conversation management

The user should be able to start a new conversation, view a list of past conversations, and continue any previous conversation from where it left off.

### Tests & evaluation

Include tests or an evaluation suite that validates the core flow works as expected — from user input through product retrieval to response rendering. This can be unit tests, integration tests, end-to-end tests, or LLM-based evaluations. Choose the approach that best fits your architecture.

## Model Access

You will receive an API key for OpenAI. Choose the model or models you want to use.

Optional: the same key also works with OpenAI's Decisions API (beta, gpt-6-luna), which returns typed answers such as classifications and choices. Use it if it fits your design.

### Your API Key

Use the OpenAI API key supplied in the assignment email.

These keys are provisioned specifically for this assignment and have usage limits. Please do not share them or commit them to your repository. Use environment variables (e.g. a .env file in your .gitignore).

### Allowed Models

gpt-6-luna

## Technical Freedom

You may use any language, framework, or architecture you prefer.

If useful, you may explore frameworks such as Mastra, LangChain, Vercel AI SDK, assistant-ui, CopilotKit, or LibreChat. You may also build everything from scratch.

We are intentionally not prescribing the implementation approach. Use your judgment.

## Deliverables

Submit:

- Source code for the application
- A README that answers the following, in your own words:
  - Setup and run instructions.
  - Architecture & framework choice. What approach did you pick (from-scratch, Vercel AI SDK, LangChain, Mastra, assistant-ui, etc.)? Name at least two alternatives you considered and explain concretely why you rejected each for this assignment — not generic pros and cons.
  - Retrieval strategy. How does your system decide what to query against the DummyJSON API? Which endpoints and query parameters do you use, and why those? How does it behave on ambiguous queries (“something cheap and cool”), off-catalog queries (“a flight to Tokyo”), and multi-intent queries?
  - Conversation & state. Where does persistence live and why that choice? What happens if storage is full, corrupted, or the user clears it mid-conversation?
  - Evaluation. What does your test or eval suite actually verify end-to-end? What kinds of regressions would it catch, and what would slip through?
  - Known limitations. Where does your system underperform today, and what would you change with another week?

## Deadline

Please submit your solution by Monday, 30 Nov 2026, 23:59. The API keys will be deactivated after this date.

## Notes

- The application only needs to run locally.
- The main objective is to build a coherent product discovery experience inside chat.
- We are interested in how you think about the problem and the choices you make, not only in the final UI.
- The interview will be a deep dive on your decisions, not a code walkthrough. Expect questions of the form “why this and not X?”, “where does this break?”, and “what does the agent do when …?”. Be ready to defend any line in the codebase as if you wrote it yourself.

## Submission

To submit, reply to this email with a link to your Git repository. Prefer to keep it private? Add shlomo666 and ronfogel as collaborators on GitHub and send us the link.
