export type SnippetGroup = {
  id: number;
  name: string;
};

export type Snippet = {
  id: number;
  groupId: number | null;
  name: string;
  body: string;
};

export type SnippetStore = {
  groups: SnippetGroup[];
  snippets: Snippet[];
};

export function snippetLabel(snippet: Snippet): string {
  if (snippet.name.trim()) {
    return snippet.name;
  }
  const body = snippet.body.replace(/\s+/g, ' ').trim();
  return body.length > 80 ? `${body.slice(0, 80)}…` : body;
}
