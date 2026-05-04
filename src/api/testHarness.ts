import { client } from './client';
import { TestCase, TestSuiteResult } from './types';

const PREFIX = '/api/testharness';

export async function listTests(): Promise<string[]> {
    const res = await client.get<string[]>(`${PREFIX}/tests`);
    return res.Data;
}

export async function getTest(name: string): Promise<TestCase> {
    const res = await client.get<TestCase>(`${PREFIX}/tests/${encodeURIComponent(name)}`);
    return res.Data;
}

export async function createTest(testCase: TestCase): Promise<void> {
    await client.post(`${PREFIX}/tests`, testCase);
}

export async function deleteTest(name: string): Promise<void> {
    await client.delete(`${PREFIX}/tests/${encodeURIComponent(name)}`);
}

/** Run a test by name. Returns a JobId for async tracking. */
export async function runTest(testName: string): Promise<string> {
    const res = await client.post<{ JobId: string }>(`${PREFIX}/run?testName=${encodeURIComponent(testName)}`);
    return res.Data.JobId;
}

/** Run all tests. Returns a JobId. */
export async function runAllTests(): Promise<string> {
    const res = await client.post<{ JobId: string }>(`${PREFIX}/run?testName=*`);
    return res.Data.JobId;
}

export async function getResults(): Promise<TestSuiteResult> {
    const res = await client.get<TestSuiteResult>(`${PREFIX}/results`);
    return res.Data;
}
