import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  onFileSelect: (path: string) => void;
  selectedFile?: string;
}

function FileTreeItem({
  node,
  depth,
  onFileSelect,
  selectedFile,
}: {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile?: string;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedFile === node.path;

  if (node.type === "directory") {
    return (
      <div>
        <div
          className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover-elevate rounded-md text-sm ${
            isSelected ? "bg-accent" : ""
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
          data-testid={`tree-folder-${node.name}`}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const getFileColor = (name: string) => {
    if (name.endsWith(".ts") || name.endsWith(".tsx")) return "text-blue-400";
    if (name.endsWith(".js") || name.endsWith(".jsx")) return "text-yellow-400";
    if (name.endsWith(".css")) return "text-purple-400";
    if (name.endsWith(".html")) return "text-orange-400";
    if (name.endsWith(".json")) return "text-green-400";
    if (name.endsWith(".py")) return "text-green-500";
    if (name.endsWith(".md")) return "text-muted-foreground";
    return "text-muted-foreground";
  };

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover-elevate rounded-md text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : ""
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      onClick={() => onFileSelect(node.path)}
      data-testid={`tree-file-${node.name}`}
    >
      <File className={`h-3.5 w-3.5 shrink-0 ${getFileColor(node.name)}`} />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

export function FileTree({ files, onFileSelect, selectedFile }: FileTreeProps) {
  if (!files || files.length === 0) {
    return (
      <div className="p-4 text-center">
        <Folder className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No files yet</p>
        <p className="text-xs text-muted-foreground">Files will appear here as the agent creates them</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {files.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
