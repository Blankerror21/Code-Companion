import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Bot,
  Code,
  FileEdit,
  Bug,
  Terminal,
  Zap,
  Shield,
  Eye,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import heroBg from "@/assets/images/hero-bg.png";

const features = [
  {
    icon: Bot,
    title: "Autonomous Agent",
    desc: "25-iteration autonomous loop with automatic error recovery. Describe what you want, and the AI plans, builds, and debugs on its own.",
  },
  {
    icon: Eye,
    title: "Live Preview",
    desc: "See your project running in real-time with a built-in preview panel, live logs, and a file browser. Just like a desktop IDE.",
  },
  {
    icon: Shield,
    title: "Your Own LLM",
    desc: "Powered by your self-hosted LM Studio. Your code stays private, your data stays local. No API keys or cloud services needed.",
  },
];

const capabilities = [
  { icon: FileEdit, label: "Read & Write Files" },
  { icon: Bug, label: "Debug & Fix" },
  { icon: Terminal, label: "Run Commands" },
  { icon: Code, label: "Search Codebase" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm" data-testid="text-logo">Agent Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/api/login">
              <Button data-testid="button-login-nav">
                Sign In
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={heroBg}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-background" />
          </div>

          <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-6">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Self-Hosted AI Coding Agent</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4 font-serif" data-testid="text-hero-title">
                Build software with your own AI agent
              </h1>

              <p className="text-lg text-zinc-300 mb-8 leading-relaxed max-w-xl">
                Describe what you want to build. Agent Studio analyzes your project,
                plans the work, writes the code, and debugs issues autonomously
                &mdash; all powered by your self-hosted LM Studio.
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <a href="/api/login">
                  <Button size="lg" className="gap-2" data-testid="button-get-started">
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
              </div>

              <div className="flex items-center gap-4 mt-6">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Zap className="h-3 w-3" />
                  Free forever
                </span>
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Shield className="h-3 w-3" />
                  Your data stays private
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Everything you need to build</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              A complete AI-powered development environment in your browser
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-12">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="p-6 hover-elevate">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {capabilities.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{c.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-20">
          <Card className="p-8 text-center">
            <Bot className="h-10 w-10 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Ready to start building?</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Sign in to create your first project and start building with AI.
            </p>
            <a href="/api/login">
              <Button size="lg" className="gap-2" data-testid="button-cta-signin">
                Sign In to Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-muted-foreground">
          Agent Studio &mdash; Self-hosted AI coding assistant
        </div>
      </footer>
    </div>
  );
}
