import { client } from './client';
import { PipelineDefinition, PipelineExecution, PipelineTemplateSummary } from './types';

const PREFIX = '/api/pipelines';

export async function listPipelines(): Promise<string[]> {
    const res = await client.get<string[]>(PREFIX);
    return res.Data;
}

export async function getPipeline(name: string): Promise<PipelineDefinition> {
    const res = await client.get<PipelineDefinition>(`${PREFIX}/${enc(name)}`);
    return res.Data;
}

export async function savePipeline(pipeline: PipelineDefinition): Promise<void> {
    await client.post(PREFIX, pipeline);
}

export async function deletePipeline(name: string): Promise<void> {
    await client.delete(`${PREFIX}/${enc(name)}`);
}

/** Run a pipeline. Returns a JobId. */
export async function runPipeline(name: string, variables?: Record<string, unknown>): Promise<string> {
    const res = await client.post<{ JobId: string }>(`${PREFIX}/${enc(name)}/run`, variables ? { variables } : undefined);
    return res.Data.JobId;
}

export async function getExecutionHistory(name?: string, limit = 20): Promise<PipelineExecution[]> {
    const params = new URLSearchParams();
    if (name) { params.set('name', name); }
    params.set('limit', limit.toString());
    const res = await client.get<PipelineExecution[]>(`${PREFIX}/executions?${params}`);
    return res.Data;
}

export async function getExecution(id: string): Promise<PipelineExecution> {
    const res = await client.get<PipelineExecution>(`${PREFIX}/executions/${enc(id)}`);
    return res.Data;
}

export async function listTemplates(): Promise<PipelineTemplateSummary[]> {
    const res = await client.get<PipelineTemplateSummary[]>(`${PREFIX}/templates`);
    return res.Data;
}

export async function instantiateTemplate(
    templateId: string,
    pipelineName: string,
    parameters?: Record<string, string>,
): Promise<PipelineDefinition> {
    const res = await client.post<PipelineDefinition>(
        `${PREFIX}/templates/${enc(templateId)}/instantiate`,
        { pipelineName, parameters: parameters || {} }
    );
    return res.Data;
}

function enc(s: string): string {
    return encodeURIComponent(s);
}
