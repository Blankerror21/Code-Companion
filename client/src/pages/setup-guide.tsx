import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Copy,
  Check,
  Download,
  Server,
  Database,
  Key,
  Terminal,
  Globe,
  Cpu,
  CheckCircle2,
  Circle,
} from "lucide-react";

interface Step {
  id: string;
  title: string;
  icon: any;
  commands?: string[];
  description: string;
  details: string[];
  tip?: string;
}

const steps: Step[] = [
  {
    id: "nodejs",
    title: "Install Node.js 18+",
    icon: Terminal,
    description: "Download and install Node.js (version 18 or higher) from the official website.",
    details: [
      "Visit https://nodejs.org and download the LTS version",
      "Run the installer and follow the prompts",
      "Verify installation by opening a terminal",
    ],
    commands: ["node --version", "npm --version"],
    tip: "Use nvm (Node Version Manager) for easy Node.js version management",
  },
  {
    id: "postgres",
    title: "Install PostgreSQL 14+",
    icon: Database,
    description: "Install PostgreSQL database server for storing conversations and settings.",
    details: [
      "Download PostgreSQL from https://www.postgresql.org/download/",
      "During installation, set a password for the postgres user",
      "Make sure the server is running after installation",
    ],
    commands: [
      "psql --version",
      "createdb agent_studio",
      'psql -c "CREATE USER agent WITH PASSWORD \'your_password\';"',
      "psql -c \"GRANT ALL PRIVILEGES ON DATABASE agent_studio TO agent;\"",
    ],
    tip: "On macOS, you can use Homebrew: brew install postgresql@16",
  },
  {
    id: "lmstudio",
    title: "Set Up LM Studio",
    icon: Cpu,
    description: "Install LM Studio and configure it to serve as your AI backend.",
    details: [
      "Download LM Studio from https://lmstudio.ai",
      "Install and launch LM Studio",
      "Download a model (recommended: codellama, deepseek-coder, or qwen2.5-coder)",
      "Go to the Server tab and click 'Start Server'",
      "The default server runs on http://localhost:1234",
    ],
    commands: ["curl http://localhost:1234/v1/models"],
    tip: "For remote access, use ngrok: ngrok http 1234",
  },
  {
    id: "clone",
    title: "Clone & Install Dependencies",
    icon: Download,
    description: "Clone this project and install all required packages.",
    details: [
      "Clone or download this project to your local machine",
      "Navigate to the project directory",
      "Install all dependencies with npm",
    ],
    commands: [
      "git clone <your-repo-url> agent-studio",
      "cd agent-studio",
      "npm install",
    ],
  },
  {
    id: "env",
    title: "Configure Environment Variables",
    icon: Key,
    description: "Create a .env file with your configuration.",
    details: [
      "Create a .env file in the project root",
      "Add the following environment variables:",
    ],
    commands: [
      "DATABASE_URL=postgresql://agent:your_password@localhost:5432/agent_studio",
      "SESSION_SECRET=your-random-secret-key-here",
      "LM_STUDIO_ENDPOINT=http://localhost:1234",
    ],
    tip: "Generate a random session secret with: openssl rand -hex 32",
  },
  {
    id: "database",
    title: "Initialize Database",
    icon: Database,
    description: "Push the database schema and set up tables.",
    details: [
      "Run the database migration command to create all required tables",
      "This will set up tables for conversations, messages, settings, and more",
    ],
    commands: ["npm run db:push"],
  },
  {
    id: "replit",
    title: "Get Replit Session Token",
    icon: Globe,
    description: "Obtain your Replit session token to enable project access.",
    details: [
      "Log in to replit.com in your browser",
      "Open DevTools (F12 or Cmd+Shift+I)",
      "Go to Application > Cookies > https://replit.com",
      "Find the cookie named 'connect.sid'",
      "Copy the entire value",
      "Paste it in the Settings page of this app",
    ],
    tip: "The token may expire periodically. If access stops working, get a fresh token.",
  },
  {
    id: "run",
    title: "Start the Application",
    icon: Server,
    description: "Launch the application and start coding with your AI agent.",
    details: [
      "Run the development server",
      "Open your browser and navigate to the URL shown",
      "Configure your LM Studio endpoint in Settings",
    ],
    commands: ["npm run dev"],
    tip: "The app runs on http://localhost:5000 by default",
  },
];

export default function SetupGuide() {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const toggleStep = (id: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(text);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const progress = Math.round((completedSteps.size / steps.length) * 100);

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-setup-title">
              Local Setup Guide
            </h1>
            <p className="text-sm text-muted-foreground">
              Run this agent on your own computer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {completedSteps.size}/{steps.length}
          </span>
        </div>

        <div className="space-y-4">
          {steps.map((step, idx) => {
            const isComplete = completedSteps.has(step.id);
            const Icon = step.icon;

            return (
              <Card key={step.id} className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleStep(step.id)}
                    className="mt-0.5 shrink-0"
                    data-testid={`button-step-${step.id}`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Step {idx + 1}
                      </Badge>
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      <span
                        className={`text-sm font-medium ${isComplete ? "line-through text-muted-foreground" : ""}`}
                      >
                        {step.title}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5">
                      {step.description}
                    </p>

                    <ul className="mt-2 space-y-1">
                      {step.details.map((detail, i) => (
                        <li key={i} className="text-xs text-foreground/70 flex items-start gap-1.5">
                          <span className="text-muted-foreground mt-0.5">-</span>
                          {detail}
                        </li>
                      ))}
                    </ul>

                    {step.commands && step.commands.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {step.commands.map((cmd) => (
                          <div
                            key={cmd}
                            className="flex items-center gap-2 bg-muted/50 rounded-md px-2.5 py-1.5 group"
                          >
                            <code className="text-xs font-mono flex-1 truncate">
                              {cmd}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0 invisible group-hover:visible"
                              onClick={() => copyToClipboard(cmd)}
                              data-testid={`button-copy-${cmd.slice(0, 10)}`}
                            >
                              {copiedCommand === cmd ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {step.tip && (
                      <div className="mt-2 text-[10px] text-muted-foreground bg-primary/5 rounded-md px-2.5 py-1.5">
                        Tip: {step.tip}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6 p-4 border-amber-500/20 bg-amber-500/5">
          <h3 className="text-sm font-medium text-amber-500 mb-2">Troubleshooting</h3>
          <div className="space-y-2 text-xs text-foreground/70">
            <p>
              <strong>Database connection fails:</strong> Ensure PostgreSQL is running
              and the DATABASE_URL is correct.
            </p>
            <p>
              <strong>LM Studio not responding:</strong> Make sure the server is started
              in LM Studio and the correct port is configured.
            </p>
            <p>
              <strong>Replit access denied:</strong> Your session token may have expired.
              Get a fresh connect.sid cookie from your browser.
            </p>
            <p>
              <strong>Port 5000 in use:</strong> Change the PORT in your .env file to a
              different port number.
            </p>
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
