import axios, { type AxiosInstance } from "axios";

const REPLIT_GQL = "https://replit.com/graphql";

function createClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: REPLIT_GQL,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: `connect.sid=${token}`,
      "User-Agent": "AgentStudio/1.0",
    },
    timeout: 30000,
  });
}

async function gql(token: string, query: string, variables: Record<string, any> = {}): Promise<any> {
  const client = createClient(token);
  const res = await client.post("", { query, variables });
  if (res.data.errors && res.data.errors.length > 0) {
    throw new Error(res.data.errors.map((e: any) => e.message).join(", "));
  }
  return res.data.data;
}

export interface ReplInfo {
  id: string;
  title: string;
  slug: string;
  url: string;
  language: string;
  description: string;
  isPrivate: boolean;
}

export async function verifyToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const data = await gql(token, `
      query {
        currentUser {
          id
          username
        }
      }
    `);
    if (data.currentUser) {
      return { valid: true, username: data.currentUser.username };
    }
    return { valid: false, error: "No user found for this token" };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function listRepls(token: string, limit: number = 20): Promise<ReplInfo[]> {
  const data = await gql(token, `
    query ListRepls($count: Int) {
      currentUser {
        repls(count: $count) {
          items {
            id
            title
            slug
            url
            language
            description
            isPrivate
          }
        }
      }
    }
  `, { count: limit });

  return data.currentUser?.repls?.items || [];
}

export async function searchRepls(token: string, searchQuery: string): Promise<ReplInfo[]> {
  const data = await gql(token, `
    query SearchRepls($search: String!) {
      currentUser {
        repls(search: $search, count: 20) {
          items {
            id
            title
            slug
            url
            language
            description
            isPrivate
          }
        }
      }
    }
  `, { search: searchQuery });

  return data.currentUser?.repls?.items || [];
}

export async function getReplById(token: string, replId: string): Promise<any> {
  const data = await gql(token, `
    query GetRepl($id: String!) {
      repl(id: $id) {
        id
        title
        slug
        url
        language
        description
        isPrivate
      }
    }
  `, { id: replId });

  return data.repl;
}

export async function getReplByUrl(token: string, url: string): Promise<any> {
  const data = await gql(token, `
    query GetReplByUrl($url: String!) {
      repl(url: $url) {
        id
        title
        slug
        url
        language
        description
        isPrivate
      }
    }
  `, { url });

  return data.repl;
}

export interface ReplFileInfo {
  id: number;
  path: string;
  content: {
    asPlainText: string;
  } | null;
}

export async function readReplFile(token: string, replId: string, filePath: string): Promise<string> {
  const data = await gql(token, `
    query ReadFile($replId: String!, $filePath: String!) {
      repl(id: $replId) {
        ... on Repl {
          fileByPath(path: $filePath) {
            ... on ReplFile {
              content {
                asPlainText
              }
            }
          }
        }
      }
    }
  `, { replId, filePath });

  const file = data.repl?.fileByPath;
  if (!file || !file.content) {
    throw new Error(`File not found: ${filePath}`);
  }
  return file.content.asPlainText;
}

export async function listReplFiles(token: string, replId: string, dirPath: string = "."): Promise<string[]> {
  const data = await gql(token, `
    query ListFiles($replId: String!, $path: String!) {
      repl(id: $replId) {
        ... on Repl {
          fileByPath(path: $path) {
            ... on ReplFolder {
              children {
                ... on ReplFile {
                  filename
                  path
                }
                ... on ReplFolder {
                  filename
                  path
                }
              }
            }
          }
        }
      }
    }
  `, { replId, path: dirPath });

  const folder = data.repl?.fileByPath;
  if (!folder || !folder.children) {
    throw new Error(`Folder not found: ${dirPath}`);
  }
  return folder.children.map((c: any) => c.path || c.filename);
}

export async function writeReplFile(token: string, replId: string, filePath: string, content: string): Promise<boolean> {
  const data = await gql(token, `
    mutation WriteFile($replId: String!, $filePath: String!, $content: String!) {
      replFileWrite(replId: $replId, path: $filePath, content: $content) {
        ... on ReplFile {
          path
        }
      }
    }
  `, { replId, filePath, content });

  return !!data.replFileWrite;
}

export async function deleteReplFile(token: string, replId: string, filePath: string): Promise<boolean> {
  const data = await gql(token, `
    mutation DeleteFile($replId: String!, $filePath: String!) {
      replFileDelete(replId: $replId, path: $filePath) {
        id
      }
    }
  `, { replId, filePath });

  return !!data.replFileDelete;
}

export async function createReplFile(token: string, replId: string, filePath: string, content: string = ""): Promise<boolean> {
  return writeReplFile(token, replId, filePath, content);
}
