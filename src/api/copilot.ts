import * as vscode from 'vscode';
import { client } from './client';
import { CopilotMessage } from './types';
import { log } from '../views/outputChannel';

export interface ChatHistoryEntry {
    Role: string;
    Content: string;
}

export async function sendCopilotMessage(message: string, history?: ChatHistoryEntry[], locale?: string): Promise<void> {
    log(`[Copilot API] POST /api/assistant/chat (history=${history?.length ?? 0} msgs, locale=${locale ?? 'none'}) ...`);
    const res = await client.post('/api/assistant/chat', {
        Message: message,
        History: history ?? [],
        Locale: locale ?? vscode.env.language,
    });
    log(`[Copilot API] POST response: Success=${res.Success} Message=${res.Message}`);
}

export async function getCopilotHistory(projectKey?: string): Promise<CopilotMessage[]> {
    const query = projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : '';
    const res = await client.get<CopilotMessage[]>(`/api/assistant/history${query}`);
    return res.Data ?? [];
}

export async function clearCopilotHistory(projectKey?: string): Promise<void> {
    const query = projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : '';
    await client.delete(`/api/assistant/history${query}`);
}

export async function stopCopilot(): Promise<void> {
    await client.post('/api/assistant/stop');
}
