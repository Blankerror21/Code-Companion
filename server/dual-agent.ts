import * as fs from "fs";
import * as path from "path";
import { storage } from "./storage";
import {
  AGENT_TOOLS,
  gatherProjectContext,
  executeTool,
  parseErrorsFromOutput,
  generateUnifiedDiff,
  processAgentMessage,
} from "./agent";
import type { StreamChunk } from "./agent";

interface CoderTask {
  id: string;
  description: string;
  relevantFiles: string[];
  relevantContext: string;
}

function getPlannerSystemPrompt(projectContext: string, mode: string): string {
  return `You are the PLANNER in a dual-AI coding system. You COORDINATE the Coder AI to implement what the user wants.

ROLE: Analyze requests, create detailed implementation tasks, and review results. You do NOT write code yourself.

YOUR WORKFLOW:
1. ANALYZE the user's request and the project structure
2. CREATE detailed, specific <coder_task> blocks for the Coder to execute
3. REVIEW results after the Coder finishes and report to the user

RESPONSE FORMAT FOR BUILD MODE:
First, write a BRIEF 1-2 sentence summary of what you're going to do.
Then, output one or more <coder_task> blocks. Each block MUST be detailed and specific.

<coder_task>
TASK: [DETAILED description - what to create/modify, expected behavior, specific requirements. Minimum 2-3 sentences.]
FILES_TO_READ: [comma-separated list of existing files the Coder should read first for context]
FILES_TO_CREATE_OR_EDIT: [comma-separated list of files to create or modify]
CONTEXT: [Implementation details: patterns to follow, libraries to use, function signatures, UI layout specifics, data structures, edge cases to handle, etc.]
</coder_task>

CRITICAL TASK QUALITY RULES:
1. NEVER create empty or vague tasks. Every task MUST have a detailed TASK description of at least 2-3 sentences.
2. Every task MUST include specific FILES_TO_READ (existing files for context) and FILES_TO_CREATE_OR_EDIT.
3. The CONTEXT field must include actionable implementation details, not generic instructions.
4. BAD task: "TASK: Set up the project" - too vague, no details
5. GOOD task: "TASK: Create the main Express server entry point in server/index.ts. Set up Express with middleware for JSON parsing, CORS, and static file serving. Add a health check endpoint at GET /api/health that returns {status: 'ok'}."
6. BAD task: "TASK: Build the frontend" - too broad, no specifics
7. GOOD task: "TASK: Create the React app component in src/App.tsx with a two-column layout. Left column should have a navigation sidebar with links to Dashboard, Settings, and Profile pages. Right column renders the active page content using React Router."
8. Each task should be FOCUSED on one feature/component but include enough detail for the Coder to implement it without guessing.
9. If the user's request needs multiple steps, create multiple <coder_task> blocks in dependency order.
10. NEVER ask questions. NEVER say "would you like..." or "should I...". Just create the tasks.
11. NEVER write code or code blocks in your response. The Coder handles all code.
12. NEVER stop without issuing at least one <coder_task> in BUILD MODE.

RESPONSE FORMAT FOR PLAN MODE:
Create a numbered plan with detailed steps. Each step should be 2-3 sentences describing WHAT to do and WHY.

CURRENT PROJECT CONTEXT:
${projectContext || "(No project files yet)"}

${mode === "plan" ? `You are in PLAN MODE. Create a detailed plan but do NOT issue <coder_task> blocks. The user will approve the plan first.` : `You are in BUILD MODE. Immediately create detailed <coder_task> blocks. Start with a 1-2 sentence summary, then output ALL tasks.`}`;
}

function getCoderSystemPrompt(workingDir: string): string {
  return `You are a coding assistant. You receive focused tasks and implement them using tools.

ROLE: Execute coding tasks precisely. Read files, write code, run commands, and verify your work.

TOOLS AVAILABLE:
- File operations: read_file, write_file, edit_file, list_files, search_files, create_directory, delete_file, read_multiple_files
- Development: execute_command, install_package, run_diagnostics
- Utilities: web_search, run_test, manage_database, manage_env

PROJECT STRUCTURE RULES (CRITICAL):
- Your working directory is: ${workingDir}
- ALL files must be created in the project root or logical subdirectories (src/, public/, etc.)
- NEVER create nested project directories like ./server/ or ./my-project/ inside the project - you are ALREADY in the project directory
- package.json goes in the project ROOT, not in subdirectories
- If a package.json already exists, do NOT overwrite it with a new one - use install_package to add dependencies

SERVER MANAGEMENT (CRITICAL):
- The development server is ALREADY RUNNING and auto-reloads when files change
- NEVER run: npm start, npm run dev, npm run start, npm run serve, node server.js, or ANY server-start command
- These commands are BLOCKED and will fail every time. Do NOT retry them.
- After writing/editing files, the server picks up changes AUTOMATICALLY
- To verify your work: use run_test with curl commands (e.g., "curl -s http://localhost:3000/api/health") or read the files you wrote

AUTONOMY RULES:
1. NEVER write code in your messages. ALWAYS use write_file or edit_file tools.
2. ALWAYS read files before editing them with edit_file.
3. Use RELATIVE paths (e.g., "src/app.js" not "/absolute/path/src/app.js").
4. Use install_package for dependencies, NOT execute_command with npm install.
5. Keep text responses BRIEF: "Creating App.tsx...", "Installing dependencies..."
6. Complete the task FULLY - keep using tools until 100% done.
7. NEVER tell the user to do anything manually. YOU do everything.
8. NEVER ask questions. Just DO the work.
9. NEVER output a response that is only text. Every response must include tool calls.

ERROR RECOVERY:
1. If a tool fails, read the error carefully and try a DIFFERENT approach
2. NEVER repeat the exact same failing action - that will fail again
3. If something fails twice, try a completely different approach
4. Use web_search to look up unfamiliar errors
5. If a command is BLOCKED, do NOT retry it - the block is permanent

ANTI-LOOP RULES (CRITICAL):
- If you already installed a package successfully, do NOT install it again
- If you already wrote a file, do NOT write the exact same content again
- If a command was BLOCKED, do NOT try it again with different syntax - it is BLOCKED permanently
- If you've done the same action 2+ times, STOP and move on to the next step
- When the task is done, simply provide a brief summary. Do NOT keep running commands.

CODING BEST PRACTICES:
- Check existing code patterns before writing new code
- Use proper error handling and imports
- Never hardcode secrets - use environment variables
- For React: functional components with hooks, import React if needed
- For Express: use app.use() for middleware, proper error handling
- Always import libraries you use (e.g., if using cors, add: import cors from 'cors')

You will receive a specific task with relevant file context. Focus ONLY on that task. Complete it fully.`;
}

const KNOWN_TOOL_NAMES_SET = new Set(AGENT_TOOLS.map((t: any) => t.name));

function tryParseJsonObjects(text: string): any[] {
  const results: any[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 0;
      let start = i;
      let inString = false;
      let escape = false;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              results.push(JSON.parse(text.slice(start, j + 1)));
            } catch {}
            i = j + 1;
            break;
          }
        }
        if (j === text.length - 1) i = j + 1;
      }
      if (depth !== 0) i++;
    } else {
      i++;
    }
  }
  return results;
}

function extractToolCallsFromText(text: string): Array<{ name: string; arguments: Record<string, any> }> {
  const extracted: Array<{ name: string; arguments: Record<string, any> }> = [];

  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const blockContent = match[1].trim();
    const objects = tryParseJsonObjects(blockContent);
    for (const obj of objects) {
      if (obj.name && KNOWN_TOOL_NAMES_SET.has(obj.name)) {
        extracted.push({ name: obj.name, arguments: obj.arguments || {} });
      }
    }
  }

  if (extracted.length === 0) {
    const objects = tryParseJsonObjects(text);
    for (const obj of objects) {
      if (obj.name && KNOWN_TOOL_NAMES_SET.has(obj.name)) {
        extracted.push({ name: obj.name, arguments: obj.arguments || {} });
      }
    }
  }

  return extracted;
}

function parseCoderTasks(plannerResponse: string): CoderTask[] {
  const tasks: CoderTask[] = [];
  const taskRegex = /<coder_task>([\s\S]*?)<\/coder_task>/gi;
  let match;
  let taskIndex = 0;

  while ((match = taskRegex.exec(plannerResponse)) !== null) {
    const block = match[1];
    const taskMatch = block.match(/TASK:\s*(.+?)(?:\n|$)/i);
    const readMatch = block.match(/FILES_TO_READ:\s*(.+?)(?:\n|$)/i);
    const writeMatch = block.match(/FILES_TO_CREATE_OR_EDIT:\s*(.+?)(?:\n|$)/i);
    const contextMatch = block.match(/CONTEXT:\s*([\s\S]*?)$/i);

    if (taskMatch) {
      const filesToRead = readMatch
        ? readMatch[1].split(",").map(f => f.trim()).filter(Boolean)
        : [];
      const filesToWrite = writeMatch
        ? writeMatch[1].split(",").map(f => f.trim()).filter(Boolean)
        : [];

      tasks.push({
        id: `coder-task-${++taskIndex}`,
        description: taskMatch[1].trim(),
        relevantFiles: Array.from(new Set([...filesToRead, ...filesToWrite])),
        relevantContext: contextMatch ? contextMatch[1].trim() : "",
      });
    }
  }

  return tasks;
}

function buildCoderPrompt(
  task: CoderTask,
  fileContents: Map<string, string>,
  previousResults?: Array<{ taskId: string; description: string; toolCalls: string[]; errors: string[]; filesModified: string[] }>,
): string {
  let prompt = `TASK: ${task.description}\n\n`;

  if (task.relevantContext) {
    prompt += `ADDITIONAL CONTEXT:\n${task.relevantContext}\n\n`;
  }

  if (previousResults && previousResults.length > 0) {
    prompt += `PREVIOUS TASK RESULTS (for context):\n`;
    for (const pr of previousResults) {
      prompt += `- "${pr.description}": `;
      if (pr.errors.length > 0) {
        prompt += `Had errors: ${pr.errors.slice(0, 3).join("; ")}. `;
      }
      if (pr.filesModified.length > 0) {
        prompt += `Modified: ${pr.filesModified.join(", ")}`;
      } else {
        prompt += `No files modified`;
      }
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  if (fileContents.size > 0) {
    prompt += `RELEVANT FILES:\n`;
    for (const [filePath, content] of Array.from(fileContents.entries())) {
      const lines = content.split("\n");
      const truncated = lines.length > 300
        ? lines.slice(0, 300).join("\n") + `\n... (${lines.length - 300} more lines)`
        : content;
      prompt += `\n--- ${filePath} ---\n${truncated}\n`;
    }
  }

  prompt += `\nImplement this task now. Use your tools to read, write, and verify files. Keep responses brief.`;
  return prompt;
}

async function gatherFileContents(
  files: string[],
  workingDir: string
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const file of files) {
    const fullPath = path.isAbsolute(file) ? file : path.join(workingDir, file);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        contents.set(file, content);
      }
    } catch {}
  }
  return contents;
}

async function callLLMStreaming(
  endpoint: string,
  messages: any[],
  tools: any[] | null,
  modelName: string | undefined,
  maxTokens: number,
  temperature: number,
  onContent: (text: string) => void,
  onToolCall: (tc: { id: string; name: string; arguments: string }) => void,
): Promise<{ finishReason: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const apiEndpoint = endpoint.replace(/\/$/, "");
  const body: any = {
    model: modelName || undefined,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${apiEndpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`LM Studio returned ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let finishReason = "";
  const toolCallDeltas: Map<number, { id: string; name: string; arguments: string }> = new Map();
  let insideThinkBlock = false;
  let thinkBuffer = "";

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) return;
    const payload = trimmed.slice(6);
    if (payload === "[DONE]") return;

    let chunk: any;
    try { chunk = JSON.parse(payload); } catch { return; }

    const delta = chunk.choices?.[0]?.delta;
    const fr = chunk.choices?.[0]?.finish_reason;
    if (fr) finishReason = fr;
    if (!delta) return;

    if (delta.content) {
      thinkBuffer += delta.content;
      let visible = "";
      let safety = 100;
      while (thinkBuffer.length > 0 && --safety > 0) {
        if (insideThinkBlock) {
          const closeMatch = thinkBuffer.match(/<\/(?:think|thinking|reasoning)>|<\|think\|>/i);
          if (closeMatch && closeMatch.index !== undefined) {
            insideThinkBlock = false;
            thinkBuffer = thinkBuffer.slice(closeMatch.index + closeMatch[0].length);
          } else {
            thinkBuffer = "";
            break;
          }
        } else {
          const openMatch = thinkBuffer.match(/<(?:think|thinking|reasoning)>|<\|think\|>/i);
          if (openMatch && openMatch.index !== undefined) {
            visible += thinkBuffer.slice(0, openMatch.index);
            insideThinkBlock = true;
            thinkBuffer = thinkBuffer.slice(openMatch.index + openMatch[0].length);
          } else if (thinkBuffer.length >= 12) {
            visible += thinkBuffer.slice(0, thinkBuffer.length - 11);
            thinkBuffer = thinkBuffer.slice(thinkBuffer.length - 11);
            break;
          } else {
            break;
          }
        }
      }
      if (visible) onContent(visible);
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallDeltas.has(idx)) {
          toolCallDeltas.set(idx, {
            id: tc.id || `tc-${idx}`,
            name: tc.function?.name || "",
            arguments: tc.function?.arguments || "",
          });
        } else {
          const existing = toolCallDeltas.get(idx)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() || "";
    for (const line of lines) processLine(line);
  }
  if (sseBuffer.trim()) processLine(sseBuffer);
  if (thinkBuffer && !insideThinkBlock) onContent(thinkBuffer);

  const assembledToolCalls = Array.from(toolCallDeltas.values()).filter(tc => tc.name);
  for (const tc of assembledToolCalls) onToolCall(tc);

  return { finishReason, toolCalls: assembledToolCalls };
}

export async function* processAgentMessageDualModel(
  conversationId: string,
  userMessage: string,
  endpoint: string,
  modelName: string | undefined,
  mode: string,
  maxTokens: number,
  temperature: number,
  projectPath: string | undefined,
  plannerModelName: string | undefined,
  coderModelName: string | undefined,
): AsyncGenerator<StreamChunk> {
  const prevMessages = await storage.getMessages(conversationId);
  const settingsData = await storage.getSettings();

  await storage.createMessage({
    conversationId,
    role: "user",
    content: userMessage,
    status: "complete",
  });

  await storage.updateConversation(conversationId, {
    title:
      prevMessages.length === 0
        ? userMessage.slice(0, 60) + (userMessage.length > 60 ? "..." : "")
        : undefined,
  });

  const workingDir = projectPath
    ? path.resolve(process.cwd(), "projects", projectPath)
    : process.cwd();

  if (projectPath && !fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, { recursive: true });
  }

  let projectContext = "";
  try {
    projectContext = gatherProjectContext(workingDir);
  } catch {}

  let plannerContext = projectContext;
  try {
    const keyFiles = ["postcss.config.cjs", "postcss.config.js", "postcss.config.mjs", "tailwind.config.ts", "tailwind.config.js", "vite.config.ts", "vite.config.js", "tsconfig.json"];
    const configContents: string[] = [];
    for (const cf of keyFiles) {
      const cfPath = path.join(workingDir, cf);
      if (fs.existsSync(cfPath)) {
        const content = fs.readFileSync(cfPath, "utf-8");
        if (content.length < 2000) {
          configContents.push(`--- ${cf} ---\n${content}`);
        }
      }
    }
    if (configContents.length > 0) {
      plannerContext += `\n\nKEY CONFIG FILE CONTENTS:\n${configContents.join("\n\n")}`;
    }
  } catch {}

  yield {
    type: "iteration_status",
    iteration: 0,
    maxIterations: 0,
    phase: "Analyzing request...",
  };

  const recentWindow = 15;
  const contextMessages: Array<{ role: string; content: string }> = [];

  if (prevMessages.length > recentWindow) {
    const older = prevMessages.slice(0, prevMessages.length - recentWindow);
    const recent = prevMessages.slice(-recentWindow);
    const summary = older.map(m => {
      const role = m.role === "plan" ? "assistant" : m.role;
      const trunc = m.content.slice(0, 150);
      return role === "user" ? `User: ${trunc}` : `Assistant: ${trunc}`;
    }).join("\n");

    contextMessages.push({ role: "system", content: `[Earlier conversation summary]\n${summary}\n[End summary]` });
    for (const m of recent) {
      contextMessages.push({ role: m.role === "plan" ? "assistant" : m.role, content: m.content });
    }
  } else {
    for (const m of prevMessages) {
      contextMessages.push({ role: m.role === "plan" ? "assistant" : m.role, content: m.content });
    }
  }

  // Detect plan approval messages and force build mode
  const isApproval = /^(?:approved|approve|yes.*implement|go ahead|let'?s do it|sounds good|looks good|lgtm|implement)/i.test(userMessage.trim());
  const effectiveMode = isApproval ? "build" : mode;

  let plannerUserMessage = userMessage;
  if (isApproval && effectiveMode === "build") {
    plannerUserMessage = userMessage + `\n\nIMPORTANT: The user has APPROVED this plan. You MUST now create <coder_task> blocks to implement it. Do NOT just describe the steps — output actual <coder_task> blocks with detailed TASK descriptions, FILES_TO_READ, FILES_TO_CREATE_OR_EDIT, and CONTEXT fields. Start working NOW.`;
  }

  const plannerMessages: any[] = [
    { role: "system", content: getPlannerSystemPrompt(plannerContext, effectiveMode) },
    ...contextMessages,
    { role: "user", content: plannerUserMessage },
  ];

  const effectivePlannerModel = plannerModelName || modelName;
  const effectiveCoderModel = coderModelName || modelName;

  let plannerResponse = "";
  let plannerError = false;

  try {
    yield {
      type: "iteration_status",
      iteration: 1,
      maxIterations: 0,
      phase: "Planning approach...",
    };

    const result = await callLLMStreaming(
      endpoint,
      plannerMessages,
      null,
      effectivePlannerModel,
      Math.min(maxTokens, 2048),
      temperature,
      (text) => {
        plannerResponse += text;
      },
      () => {},
    );
  } catch (err: any) {
    plannerError = true;
    yield { type: "error", content: `Planner error: ${err.message}` };
  }

  if (plannerError || !plannerResponse.trim()) {
    const fallbackMsg = plannerError
      ? "Planner encountered an error. Falling back to single-model mode."
      : "Planner returned empty response. Falling back to single-model mode.";

    yield { type: "content", content: fallbackMsg };

    const fallback = processAgentMessage(
      conversationId,
      userMessage,
      endpoint,
      modelName,
      mode,
      maxTokens,
      temperature,
      projectPath,
    );

    for await (const chunk of fallback) {
      yield chunk;
    }
    return;
  }

  plannerResponse = plannerResponse
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "")
    .replace(/<\|think\|>[\s\S]*?<\|think\|>/gi, "")
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, "")
    .trim();

  let coderTasks = parseCoderTasks(plannerResponse);

  // Validate task quality - re-prompt if tasks are empty/vague
  if (coderTasks.length > 0) {
    const vagueTasks = coderTasks.filter(t => t.description.length < 20 || !t.description.trim());
    if (vagueTasks.length === coderTasks.length) {
      // All tasks are vague/empty - retry with stronger prompt
      try {
        yield {
          type: "iteration_status",
          iteration: 2,
          maxIterations: 0,
          phase: "Refining tasks...",
        };

        let retryResponse = "";
        const retryMessages = [
          ...plannerMessages,
          { role: "assistant", content: plannerResponse },
          {
            role: "user",
            content: `Your tasks are too vague - they have empty or very short descriptions. Each <coder_task> MUST have a TASK field with at least 2-3 detailed sentences explaining exactly what to implement, what files to create/modify, and what the expected behavior should be. Please rewrite ALL your tasks with proper detail. Output the corrected <coder_task> blocks now.`,
          },
        ];

        await callLLMStreaming(
          endpoint,
          retryMessages,
          null,
          effectivePlannerModel,
          Math.min(maxTokens, 2048),
          temperature,
          (text) => { retryResponse += text; },
          () => {},
        );

        retryResponse = retryResponse
          .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "")
          .replace(/<\|think\|>[\s\S]*?<\|think\|>/gi, "")
          .replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, "")
          .trim();

        const retryTasks = parseCoderTasks(retryResponse);
        if (retryTasks.length > 0) {
          coderTasks = retryTasks;
          // Update plannerResponse text for display
          const retryText = retryResponse
            .replace(/<coder_task>[\s\S]*?<\/coder_task>/gi, "")
            .replace(/```[\w]*\s*\n?[\s\S]*?```/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
          if (retryText) {
            yield { type: "content", content: retryText + "\n\n" };
          }
        }
      } catch (err: any) {
        console.error("[Planner Retry] Error:", err.message);
      }
    }
  }

  // If in build mode but no coder_tasks were produced, re-prompt Planner once
  if (coderTasks.length === 0 && effectiveMode === "build") {
    try {
      yield {
        type: "iteration_status",
        iteration: 2,
        maxIterations: 0,
        phase: "Creating implementation tasks...",
      };

      let retryBuildResponse = "";
      const retryBuildMessages = [
        ...plannerMessages,
        { role: "assistant", content: plannerResponse },
        {
          role: "user",
          content: `You described the steps but did NOT output any <coder_task> blocks. You are in BUILD MODE — you MUST create <coder_task> blocks so the Coder can implement the work. Each block needs:
<coder_task>
TASK: [2-3 sentences describing exactly what to implement]
FILES_TO_READ: [files to read for context]
FILES_TO_CREATE_OR_EDIT: [files to create or modify]
CONTEXT: [implementation details]
</coder_task>

Output the <coder_task> blocks NOW. Do not repeat the plan in text — create the actual task blocks.`,
        },
      ];

      await callLLMStreaming(
        endpoint,
        retryBuildMessages,
        null,
        effectivePlannerModel,
        Math.min(maxTokens, 2048),
        temperature,
        (text) => { retryBuildResponse += text; },
        () => {},
      );

      retryBuildResponse = retryBuildResponse
        .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "")
        .replace(/<\|think\|>[\s\S]*?<\|think\|>/gi, "")
        .replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, "")
        .trim();

      const retryBuildTasks = parseCoderTasks(retryBuildResponse);
      if (retryBuildTasks.length > 0) {
        coderTasks = retryBuildTasks;
      }
    } catch (err: any) {
      console.error("[Planner Build Retry] Error:", err.message);
    }
  }

  if (mode === "plan" || coderTasks.length === 0) {
    const cleanResponse = plannerResponse
      .replace(/<coder_task>[\s\S]*?<\/coder_task>/gi, "")
      .replace(/```[\w]*\s*\n?[\s\S]*?```/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleanResponse) {
      yield { type: "content", content: cleanResponse };
    }

    const allLines = (cleanResponse || plannerResponse).split("\n");
    const stepPattern = /^\s*(\d+[\.\)]\s+|[-*]\s+)/;
    let bestRun: string[] = [];
    let currentRun: string[] = [];
    for (const line of allLines) {
      if (stepPattern.test(line)) currentRun.push(line);
      else {
        if (currentRun.length > bestRun.length) bestRun = currentRun;
        currentRun = [];
      }
    }
    if (currentRun.length > bestRun.length) bestRun = currentRun;
    if (bestRun.length >= 2 && mode === "plan") {
      yield { type: "plan", content: bestRun.join("\n") };
    }

    await storage.createMessage({
      conversationId,
      role: mode === "plan" ? "plan" : "assistant",
      content: cleanResponse || plannerResponse || "I could not generate a response.",
      status: "complete",
    });

    yield { type: "done" };
    return;
  }

  const plannerUserText = plannerResponse
    .replace(/<coder_task>[\s\S]*?<\/coder_task>/gi, "")
    .replace(/```[\w]*\s*\n?[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (plannerUserText) {
    yield { type: "content", content: plannerUserText + "\n\n" };
  }

  const tasks = coderTasks.map((ct, i) => ({
    id: `step-${i + 1}`,
    title: ct.description.slice(0, 100),
    status: i === 0 ? "in_progress" : "pending",
  }));

  const taskListPath = path.join(workingDir, ".agent-tasks.json");
  fs.writeFileSync(taskListPath, JSON.stringify({ tasks, createdAt: new Date().toISOString() }, null, 2));
  yield { type: "tasks", tasks };

  const PLAN_MODE_ALLOWED_TOOLS = new Set([
    "read_file", "list_files", "search_files", "read_multiple_files", "read_logs",
  ]);

  const toolsForApi = AGENT_TOOLS
    .filter((t: any) => !PLAN_MODE_ALLOWED_TOOLS.has(t.name) || true)
    .map((t: any) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

  let fullResponse = plannerUserText ? plannerUserText + "\n\n" : "";
  const toolCallsLog: any[] = [];
  const sessionDiffs: Map<string, { before: string; after: string; path: string }> = new Map();
  const modifiedFiles: Set<string> = new Set();
  let overallIteration = 2;
  const taskResults: Array<{ taskId: string; description: string; toolCalls: string[]; errors: string[]; filesModified: string[] }> = [];

  for (let taskIdx = 0; taskIdx < coderTasks.length; taskIdx++) {
    const task = coderTasks[taskIdx];
    const taskResult = { taskId: task.id, description: task.description, toolCalls: [] as string[], errors: [] as string[], filesModified: [] as string[] };

    yield {
      type: "content",
      content: `\n**[Planner]** Starting task ${taskIdx + 1}/${coderTasks.length}: ${task.description.slice(0, 120)}\n`,
    };

    yield {
      type: "iteration_status",
      iteration: overallIteration,
      maxIterations: 0,
      phase: `Working on task ${taskIdx + 1}/${coderTasks.length}: ${task.description.slice(0, 50)}...`,
    };

    const fileContents = await gatherFileContents(task.relevantFiles, workingDir);
    const recentResults = taskResults.length > 5 ? taskResults.slice(-5) : taskResults;
    const coderPrompt = buildCoderPrompt(task, fileContents, recentResults.length > 0 ? recentResults : undefined);

    const coderSystemPrompt = getCoderSystemPrompt(workingDir) +
      `\n\nPROJECT STRUCTURE:\n${projectContext || "(empty project)"}`;

    const coderMessages: any[] = [
      { role: "system", content: coderSystemPrompt },
      { role: "user", content: coderPrompt },
    ];

    let coderIteration = 0;
    let consecutiveErrors = 0;
    let textOnlyNudges = 0;
    const maxTextOnlyNudges = 3;
    let consecutiveEmptyResponses = 0;
    const maxCoderIterations = 30;
    const maxOverallIterations = 100;
    const recentToolActions: string[] = [];
    let repetitionCount = 0;

    while (coderIteration < maxCoderIterations && overallIteration < maxOverallIterations) {
      coderIteration++;
      overallIteration++;

      yield {
        type: "iteration_status",
        iteration: overallIteration,
        maxIterations: 0,
        phase: `Task ${taskIdx + 1}/${coderTasks.length}, step ${coderIteration}...`,
      };

      try {
        let messageContent = "";
        const assembledToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

        await callLLMStreaming(
          endpoint,
          coderMessages,
          toolsForApi,
          effectiveCoderModel,
          maxTokens,
          Math.max(temperature - 0.1, 0.1),
          (text) => {
            const cleaned = text
              .replace(/\[?(?:Task progress|Progress|IMPORTANT)[^\]]*(?:\]|$)/gi, "")
              .replace(/\n{3,}/g, "\n\n");
            if (cleaned.trim()) messageContent += cleaned;
          },
          (tc) => { assembledToolCalls.push(tc); },
        );

        if (!messageContent && assembledToolCalls.length === 0) {
          consecutiveEmptyResponses++;
          if (consecutiveEmptyResponses >= 5) break;
          await new Promise(r => setTimeout(r, 2000));
          coderMessages.push({
            role: "user" as any,
            content: `Your response was empty. You MUST use tools to complete the task. Call read_file, write_file, edit_file, execute_command, or install_package NOW.`,
          });
          continue;
        }
        consecutiveEmptyResponses = 0;

        consecutiveErrors = 0;

        if (assembledToolCalls.length === 0 && messageContent) {
          const extractedCalls = extractToolCallsFromText(messageContent);
          if (extractedCalls.length > 0) {
            for (const ec of extractedCalls) {
              assembledToolCalls.push({
                id: `tc-extracted-${coderIteration}-${ec.name}`,
                name: ec.name,
                arguments: JSON.stringify(ec.arguments),
              });
            }
          }
        }

        if (assembledToolCalls.length > 0) {
          const apiToolCalls = assembledToolCalls.map((tc, i) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));

          coderMessages.push({
            role: "assistant",
            content: messageContent || "",
            tool_calls: apiToolCalls,
          });

          let hasErrors = false;
          for (const toolCall of assembledToolCalls) {
            const fnName = toolCall.name;
            let fnArgs: Record<string, any> = {};
            try { fnArgs = JSON.parse(toolCall.arguments || "{}"); } catch { fnArgs = {}; }

            const toolCallId = toolCall.id || `tc-${coderIteration}-${fnName}`;

            yield {
              type: "tool_call",
              toolName: fnName,
              toolCallId,
              toolArgs: fnArgs,
              content: `Coder: ${fnName}`,
            };

            const resolvePath = (p: string) => path.isAbsolute(p) ? p : path.join(workingDir, p);
            if (["write_file", "edit_file", "delete_file"].includes(fnName) && fnArgs.path) {
              const fp = resolvePath(fnArgs.path);
              if (!sessionDiffs.has(fp)) {
                try {
                  sessionDiffs.set(fp, {
                    before: fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : "",
                    after: "",
                    path: fnArgs.path,
                  });
                } catch {}
              }
            }

            const commandOutputChunks: string[] = [];
            if (fnName === "execute_command") {
              fnArgs._onOutput = (chunk: string) => { commandOutputChunks.push(chunk); };
            }

            const toolTimeout = fnName === "execute_command" ? 90000 : 60000;
            let result: { success: boolean; result: string };
            try {
              const toolPromise = executeTool(fnName, fnArgs, workingDir, !!projectPath);
              let timer: ReturnType<typeof setTimeout> | null = null;
              const timeoutPromise = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Tool "${fnName}" timed out`)), toolTimeout);
              });
              try {
                result = await Promise.race([toolPromise, timeoutPromise]);
              } finally {
                if (timer) clearTimeout(timer);
              }
            } catch (toolErr: any) {
              result = { success: false, result: `Tool error: ${toolErr.message}` };
            }

            if (!result.success) {
              hasErrors = true;
              if (taskResult.errors.length < 10) {
                taskResult.errors.push(`${fnName}: ${result.result.slice(0, 150)}`);
              }
            }
            taskResult.toolCalls.push(fnName);

            if (fnName === "execute_command" && commandOutputChunks.length > 0) {
              yield { type: "command_output", toolCallId, content: commandOutputChunks.join("") };
            }

            if (["write_file", "edit_file", "delete_file"].includes(fnName) && fnArgs.path && result.success) {
              const fp = resolvePath(fnArgs.path);
              modifiedFiles.add(fp);
              taskResult.filesModified.push(fnArgs.path);
              const entry = sessionDiffs.get(fp);
              if (entry) {
                try {
                  entry.after = fnName === "delete_file" ? "(deleted)" : (fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : "");
                } catch {}
              }
            }

            if (!result.success && fnName === "execute_command") {
              const parsed = parseErrorsFromOutput(result.result);
              if (parsed) result.result += `\n\n${parsed}\nPlease analyze and fix.`;
            }

            toolCallsLog.push({
              name: fnName,
              args: fnArgs,
              status: result.success ? "success" : "error",
              result: result.result.slice(0, 500),
            });

            yield {
              type: "tool_call",
              toolName: fnName,
              toolCallId,
              toolResult: result.result.slice(0, 300),
              toolStatus: result.success ? "success" : "error",
            };

            coderMessages.push({
              role: "tool" as any,
              content: result.result,
              tool_call_id: toolCall.id,
            });
          }

          // Loop detection: track recent actions and break if repeating
          const actionSig = assembledToolCalls.map(tc => {
            let args: any = {};
            try { args = JSON.parse(tc.arguments || "{}"); } catch {}
            return `${tc.name}:${args.path || args.command || args.packages || ""}`;
          }).sort().join("|");
          recentToolActions.push(actionSig);

          // Check for blocked command retries - break immediately on 2nd attempt
          const blockedRetryCount = toolCallsLog.filter(r => r.result.includes("BLOCKED:")).length;
          if (blockedRetryCount >= 2) {
            coderMessages.push({
              role: "user" as any,
              content: `STOP: Multiple commands were BLOCKED. These commands are permanently blocked and retrying will never work. Move on to a different approach or consider the task complete.`,
            });
            break;
          }

          // Check for exact repetition (2 consecutive identical actions = warning, 3 = break)
          if (recentToolActions.length >= 2) {
            const last2 = recentToolActions.slice(-2);
            if (last2[0] === last2[1]) {
              repetitionCount++;
              if (repetitionCount >= 2) {
                coderMessages.push({
                  role: "user" as any,
                  content: `STOP: You are repeating the same actions. The task is either complete or you need a completely different approach. STOP working on this and move on.`,
                });
                break;
              }
              coderMessages.push({
                role: "user" as any,
                content: `WARNING: You just repeated the same action. Do NOT repeat it again. Either the task is done (move on) or try a COMPLETELY DIFFERENT approach. Do NOT retry the same tool calls.`,
              });
            }
          }

          // Check for high error rate - if most recent actions are failing, break
          const recentResults = toolCallsLog.slice(-6);
          const recentErrors = recentResults.filter(r => r.status === "error" || r.result.includes("BLOCKED:"));
          if (recentResults.length >= 4 && recentErrors.length >= 3) {
            coderMessages.push({
              role: "user" as any,
              content: `WARNING: Most of your recent actions are failing. Stop retrying failing approaches. Either the task is complete, or you need to try something fundamentally different.`,
            });
          }

          continue;
        }

        if (messageContent && assembledToolCalls.length === 0 && textOnlyNudges < maxTextOnlyNudges) {
          textOnlyNudges++;
          coderMessages.push({
            role: "assistant",
            content: messageContent,
          });
          coderMessages.push({
            role: "user" as any,
            content: `You wrote text instead of using tools. You MUST use tool calls (function calling) to do work. Do NOT write JSON in your message - use the tool/function calling mechanism. Call read_file, write_file, edit_file, execute_command, or install_package as actual tool calls NOW. Do NOT explain what you'll do - just call the tools.`,
          });
          continue;
        }

        if (messageContent) {
          const cleaned = messageContent.replace(/```[\w]*\s*\n?[\s\S]*?```/g, "").trim();
          if (cleaned) {
            fullResponse += cleaned + "\n";
          }
        }

        break;
      } catch (err: any) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          coderMessages.push({
            role: "user" as any,
            content: `Error: ${err.message}. Try a COMPLETELY DIFFERENT approach. Use web_search if needed. Do NOT give up.`,
          });
          consecutiveErrors = 0;
          continue;
        }
        await new Promise(r => setTimeout(r, 2000 * consecutiveErrors));
      }
    }

    taskResults.push(taskResult);

    const taskSummary = taskResult.errors.length > 0
      ? `completed with ${taskResult.errors.length} error(s)`
      : `completed successfully`;
    const filesInfo = taskResult.filesModified.length > 0
      ? ` (modified: ${taskResult.filesModified.slice(0, 5).join(", ")}${taskResult.filesModified.length > 5 ? ` +${taskResult.filesModified.length - 5} more` : ""})`
      : "";

    yield {
      type: "content",
      content: `**[Planner]** Task ${taskIdx + 1}/${coderTasks.length} ${taskSummary}${filesInfo}\n`,
    };

    try {
      const taskData = JSON.parse(fs.readFileSync(taskListPath, "utf-8"));
      const taskEntry = taskData.tasks.find((t: any) => t.id === `step-${taskIdx + 1}`);
      if (taskEntry) taskEntry.status = "completed";
      const nextEntry = taskData.tasks.find((t: any) => t.id === `step-${taskIdx + 2}`);
      if (nextEntry) nextEntry.status = "in_progress";
      fs.writeFileSync(taskListPath, JSON.stringify(taskData, null, 2));
      yield { type: "tasks", tasks: taskData.tasks };
    } catch {}
  }

  if (sessionDiffs.size > 0) {
    const diffEntries: Array<{ path: string; diff: string }> = [];
    for (const [fp, entry] of Array.from(sessionDiffs.entries())) {
      if (entry.after === "" && entry.before === "") continue;
      const diff = generateUnifiedDiff(entry.path, entry.before, entry.after || entry.before);
      if (diff) diffEntries.push({ path: entry.path, diff });
    }
    if (diffEntries.length > 0) {
      yield { type: "diff", diffs: diffEntries };
    }
  }

  // === PLANNER REVIEW PHASE ===
  yield {
    type: "iteration_status",
    iteration: overallIteration + 1,
    maxIterations: 0,
    phase: "Reviewing results...",
  };

  let reviewSummary = "";
  try {
    let reviewContext = `All ${coderTasks.length} coding tasks have been executed. Here are the results:\n\n`;
    for (const tr of taskResults) {
      reviewContext += `TASK: "${tr.description}"\n`;
      reviewContext += `  Tool calls: ${tr.toolCalls.length} (${Array.from(new Set(tr.toolCalls)).join(", ")})\n`;
      reviewContext += `  Files modified: ${tr.filesModified.length > 0 ? tr.filesModified.join(", ") : "none"}\n`;
      reviewContext += `  Errors: ${tr.errors.length > 0 ? tr.errors.slice(0, 3).join("; ") : "none"}\n\n`;
    }

    const allModifiedFiles = Array.from(modifiedFiles).map(fp => {
      try { return path.relative(workingDir, fp); } catch { return fp; }
    });

    reviewContext += `\nTOTAL FILES MODIFIED: ${allModifiedFiles.length > 0 ? allModifiedFiles.join(", ") : "none"}`;
    reviewContext += `\nTOTAL ERRORS ACROSS ALL TASKS: ${taskResults.reduce((sum, tr) => sum + tr.errors.length, 0)}`;

    const reviewMessages = [
      {
        role: "system",
        content: `You are the PLANNER reviewing completed work. The Coder has finished all assigned tasks. Your job is to:
1. Summarize what was accomplished
2. Note any errors or issues that occurred
3. Report the status to the user in a clear, concise way

Keep your response to 3-6 sentences. Be specific about what was built/changed. If there were errors, mention them briefly. Do NOT write code. Do NOT use code blocks.`,
      },
      {
        role: "user",
        content: `Original request: "${userMessage}"\n\n${reviewContext}\n\nProvide a brief summary for the user of what was accomplished and any issues.`,
      },
    ];

    await callLLMStreaming(
      endpoint,
      reviewMessages,
      null,
      effectivePlannerModel,
      Math.min(maxTokens, 1024),
      temperature,
      (text) => { reviewSummary += text; },
      () => {},
    );

    reviewSummary = reviewSummary
      .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "")
      .replace(/<\|think\|>[\s\S]*?<\|think\|>/gi, "")
      .replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, "")
      .replace(/```[\w]*\s*\n?[\s\S]*?```/g, "")
      .trim();
  } catch (err: any) {
    console.error("[Planner Review] Error:", err.message);
  }

  if (reviewSummary) {
    yield { type: "content", content: `\n**[Planner Review]** ${reviewSummary}\n` };
    fullResponse += `\n${reviewSummary}`;
  } else {
    const fallbackReview = `All ${coderTasks.length} task(s) have been completed. ${taskResults.reduce((s, t) => s + t.errors.length, 0) > 0 ? "Some errors occurred during execution - please check the results." : "No errors detected."}`;
    yield { type: "content", content: `\n**[Planner Review]** ${fallbackReview}\n` };
    fullResponse += `\n${fallbackReview}`;
  }

  const finalContent = fullResponse.trim() || "Tasks completed.";

  await storage.createMessage({
    conversationId,
    role: "assistant",
    content: finalContent,
    toolCalls: toolCallsLog.length > 0 ? toolCallsLog : null,
    status: "complete",
  });

  yield { type: "done" };
}
