import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, FolderOpen, Settings, Trash2, BookOpen, LogOut, Home, Rocket } from "lucide-react";
import { useLocation } from "wouter";

interface Project {
  name: string;
  path: string;
  conversationId: string | null;
  conversationTitle: string | null;
  updatedAt: string | null;
}

export function AppSidebar() {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const { user } = useAuth();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/local-projects"],
  });

  const deleteProject = useMutation({
    mutationFn: async (project: Project) => {
      if (project.conversationId) {
        await apiRequest("DELETE", `/api/conversations/${project.conversationId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setLocation("/");
    },
  });

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User"
    : "User";

  const initials = user
    ? (user.firstName?.[0] || "") + (user.lastName?.[0] || "") || user.email?.[0]?.toUpperCase() || "U"
    : "U";

  return (
    <Sidebar>
      <SidebarHeader className="p-3">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setLocation("/")}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Home className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Agent Studio</span>
            <span className="text-xs text-muted-foreground">AI Coding Assistant</span>
          </div>
        </div>
      </SidebarHeader>

      <div className="px-3 pb-2">
        <Button
          onClick={() => setLocation("/")}
          className="w-full justify-start gap-2"
          data-testid="button-new-project"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading && (
                <div className="px-3 py-2">
                  <div className="h-6 w-full animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-6 w-3/4 animate-pulse rounded bg-muted" />
                </div>
              )}
              {projects.map((project) => {
                const isActive = location === `/project/${project.name}`;
                return (
                  <SidebarMenuItem key={project.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer group"
                        onClick={() => setLocation(`/project/${project.name}`)}
                        data-testid={`link-project-${project.name}`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm">{project.name}</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 invisible group-hover:visible">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete project "${project.name}"? This will remove the conversation history.`)) {
                                deleteProject.mutate(project);
                              }
                            }}
                            data-testid={`button-delete-project-${project.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {!isLoading && projects.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">No projects yet</p>
                  <p className="text-xs text-muted-foreground">Create one to get started</p>
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location === "/published"}
            >
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setLocation("/published")}
                data-testid="link-published-apps"
              >
                <Rocket className="h-4 w-4" />
                <span>Published Apps</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location === "/settings"}
            >
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setLocation("/settings")}
                data-testid="link-settings"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location === "/setup"}
            >
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setLocation("/setup")}
                data-testid="link-setup-guide"
              >
                <BookOpen className="h-4 w-4" />
                <span>Setup Guide</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border pt-3">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" data-testid="text-user-name">{displayName}</p>
            {user?.email && (
              <p className="text-[10px] text-muted-foreground truncate" data-testid="text-user-email">{user.email}</p>
            )}
          </div>
          <a href="/api/logout">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" data-testid="button-logout">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
