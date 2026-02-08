# Agent Studio - AI Coding Assistant

## Overview
Agent Studio is an AI coding assistant powered by a self-hosted LM Studio. It offers a chat interface where users can describe development tasks, and the AI agent will analyze, plan, and implement code changes. It can access and modify user's Replit projects via a GraphQL API, providing a comprehensive environment for AI-assisted development. The project aims to streamline the coding workflow, enhance productivity, and enable autonomous project development through an intelligent agent.

## User Preferences
I prefer iterative development with clear communication on the agent's plans. I want to approve major changes or plans before execution. I appreciate detailed explanations of the agent's thought process and decisions. Ensure that the agent operates within designated project directories and does not modify its own codebase. I expect the agent to handle errors gracefully and suggest alternative approaches. I prefer a clear distinction between planning and building phases.

## System Architecture
The application features a React Single Page Application (SPA) frontend utilizing Tailwind CSS, Shadcn UI, and wouter for routing. The backend is an Express.js server interacting with PostgreSQL via Drizzle ORM. AI integration is achieved by connecting to LM Studio through an OpenAI-compatible API. The core of the system is a tool-based agent capable of performing file operations (read, write, edit, list, search, create, delete), executing commands, managing packages, running diagnostics, web searching, testing, managing tasks, handling checkpoints, interacting with databases, managing environment variables, and integrating with Git. The agent operates in sandboxed project directories (`/projects/<name>/`), ensuring it never modifies its own code.

Key architectural features include:
- **UI/UX**: Split-pane layout with resizable panels, featuring a chat interface on the left and tabs for Preview, Code, and Shell on the right. Live project preview is available via an iframe and reverse proxy. The UI supports dark/light themes.
- **Agent System**: Autonomous multi-turn agent loop with automatic error detection, recovery, and proactive context gathering. A dual-model architecture separates planning (`Planner`) from execution (`Coder`) for optimized performance and context management. The Planner produces detailed tasks with quality validation (re-prompts if tasks are vague/empty), provides status messages during Coder execution, and performs a review phase after all tasks complete to verify results and report to the user. Safety ceilings: 30 iterations per task, 100 overall.
- **Project Management**: Local project picker for creating/selecting projects, live agent activity feed, file browser, code viewer, and a project runner with start/stop/restart capabilities.
- **Safety**: A blocked command safety layer prevents execution of sensitive commands, and path escape prevention is enforced for all file operations. The static file server (static-serve.cjs) includes path traversal protection and dotfile access blocking.
- **Agent Robustness**: Plan approval detection forces Planner into build mode with explicit coder_task generation. Build mode retry re-prompts if Planner responds without task blocks. Coder loop detection tracks tool call signatures and breaks infinite loops after 3 repetitions.
- **Observability**: Real-time project output and agent activity are streamed via WebSockets, with color-coded logs and progress bars. File diffs are tracked and displayed in the chat UI.
- **Advanced Agent Capabilities**: Web search for external knowledge, self-testing with `run_test`, auto-generated task lists from approved plans, robust error parsing and recovery, an "Architect Review" for post-completion checks, smart context gathering (project type detection, config file scanning), package management, diagnostics, project checkpoints, and Git integration.

## External Dependencies
- **LM Studio**: Provides the underlying large language model capabilities via an OpenAI-compatible API.
- **PostgreSQL**: Used as the primary database for storing application data (conversations, messages, settings, change logs) managed by Drizzle ORM.
- **Replit API**: GraphQL API for interacting with user's remote Replit projects (listing, reading, writing files).
- **DuckDuckGo**: Utilized for web search capabilities (`web_search` tool).
- **Ngrok**: For exposing the local LM Studio endpoint.