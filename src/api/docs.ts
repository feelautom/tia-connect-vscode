import { client } from './client';

export interface DocSearchResult {
    Section: string;
    Snippet: string;
    Relevance: number;
}

/**
 * Search the T-IA Connect documentation.
 * Returns matching sections with snippets, sorted by relevance.
 */
export async function searchDocs(query: string): Promise<DocSearchResult[]> {
    const resp = await client.get<DocSearchResult[]>(`/api/docs/search?q=${encodeURIComponent(query)}`);
    return resp.Data ?? [];
}
