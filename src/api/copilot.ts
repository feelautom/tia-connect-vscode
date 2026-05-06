import { client } from './client';
import { CopilotMessage } from './types';

export async function sendCopilotMessage(message: string): Promise<void> {
    await client.post('/api/assistant/chat', { Message: message });
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
