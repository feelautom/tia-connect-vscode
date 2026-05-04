/** Standard T-IA Connect API response wrapper */
export interface ApiResponse<T = unknown> {
    Success: boolean;
    Message: string;
    Data: T;
    Timestamp: string;
}

/** Project overview */
export interface ProjectOverview {
    Name: string;
    Path: string;
    Author: string;
    Comment: string;
    Devices: DeviceInfo[];
}

/** Device in the project */
export interface DeviceInfo {
    Name: string;
    TypeIdentifier: string;
    DeviceItems?: DeviceItemInfo[];
}

export interface DeviceItemInfo {
    Name: string;
    TypeIdentifier: string;
}

/** Block tree node from GET /api/devices/{d}/blocks/tree */
export interface BlockTreeNode {
    Name: string;
    Type: 'Folder' | 'OB' | 'FB' | 'FC' | 'DB' | 'UDT';
    ProgrammingLanguage?: string;
    Number?: number;
    Children?: BlockTreeNode[];
    IsConsistent?: boolean;
    IsKnowHowProtected?: boolean;
    Size?: number;
}

/** Block details */
export interface BlockDetails {
    Name: string;
    Type: string;
    Number: number;
    ProgrammingLanguage: string;
    IsConsistent: boolean;
    IsKnowHowProtected: boolean;
    ModifiedDate?: string;
}

/** Job status from GET /api/jobs/{id} */
export interface JobStatus {
    JobId: string;
    Status: 'Pending' | 'Running' | 'Completed' | 'Failed';
    Progress: number;
    Message: string;
    Result?: unknown;
    Error?: string;
    CreatedAt: string;
    CompletedAt?: string;
}

/** Compilation result */
export interface CompilationResult {
    Success: boolean;
    ErrorCount: number;
    WarningCount: number;
    Messages: CompilationMessage[];
}

export interface CompilationMessage {
    Path: string;
    Description: string;
    ErrorLevel: 'Error' | 'Warning' | 'Info';
}

/** Block content from GET /api/devices/{d}/blocks/{b}/content */
export interface BlockContentDto {
    Name: string;
    BlockType: string;
    Number: number;
    ProgrammingLanguage: string;
    Title: string;
    Author: string;
    IsProtected: boolean;
    IsKnowHowProtected: boolean;
    NeedsCompilation: boolean;
    RawXml: string;
    /** Plain-text source code (SCL/STL/DB) from GenerateSource */
    SourceText?: string;
}

/** Import result */
export interface ImportResult {
    Success: boolean;
    BlockName: string;
    Message: string;
}

// ─── Source Control (VCS) types ────────────────────────────────────

export interface VcsStatus {
    IsInitialized: boolean;
    ChangedFilesCount: number;
    Changes: VcsFileChange[];
    LastCommitSha?: string;
    LastCommitMessage?: string;
    LastCommitDate?: string;
}

export interface VcsFileChange {
    FilePath: string;
    Status: string;
    Domain: string;
    DeviceName: string;
    ItemName: string;
}

export interface VcsLogEntry {
    Sha: string;
    ShortSha: string;
    Message: string;
    Author: string;
    Timestamp: string;
    FilesChanged: number;
}

export interface VcsDiffResult {
    FromSha: string;
    ToSha: string;
    Patch: string;
    Files: VcsDiffFile[];
}

export interface VcsDiffFile {
    Path: string;
    Status: string;
    LinesAdded: number;
    LinesDeleted: number;
}

export interface VcsBranchInfo {
    Name: string;
    IsCurrentBranch: boolean;
    IsRemote: boolean;
    LastCommitSha: string;
    LastCommitMessage: string;
}

export interface VcsSettings {
    Enabled: boolean;
    AuthorName: string;
    AuthorEmail: string;
}

export interface VcsRemoteInfo {
    Name: string;
    Url: string;
}

// ─── Test Harness types ────────────────────────────────────────────

export interface TestCase {
    name: string;
    description?: string;
    instanceName?: string;
    setup?: Record<string, unknown>;
    steps: TestStep[];
    teardown?: Record<string, unknown>;
}

export interface TestStep {
    description?: string;
    write?: Record<string, unknown>;
    waitMs?: number;
    assert?: Record<string, TestAssertion>;
}

export interface TestAssertion {
    expected?: unknown;
    tolerance?: number;
    min?: number;
    max?: number;
    notEqual?: unknown;
}

export interface TestSuiteResult {
    Total: number;
    Passed: number;
    Failed: number;
    Results: TestRunResult[];
    StartedAt: string;
    CompletedAt: string;
    DurationMs: number;
}

export interface TestRunResult {
    TestName: string;
    Description: string;
    Passed: boolean;
    Error?: string;
    Steps: TestStepResult[];
    StartedAt: string;
    CompletedAt: string;
    DurationMs: number;
}

export interface TestStepResult {
    StepIndex: number;
    Description: string;
    Passed: boolean;
    Assertions: AssertionResult[];
}

export interface AssertionResult {
    TagName: string;
    Passed: boolean;
    Message: string;
    ActualValue: unknown;
    ExpectedValue: unknown;
}

// ─── Pipeline types ────────────────────────────────────────────────

export type PipelineStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'Skipped';

export interface PipelineDefinition {
    name: string;
    description?: string;
    trigger: string;
    variables?: Record<string, unknown>;
    steps: PipelineStepDefinition[];
    onFailure: string;
    createdAt: string;
    updatedAt?: string;
}

export interface PipelineStepDefinition {
    name: string;
    action: string;
    params?: Record<string, unknown>;
    condition?: string;
    timeoutSeconds: number;
    retryCount: number;
    retryDelayMs: number;
}

export interface PipelineExecution {
    Id: string;
    PipelineName: string;
    Status: PipelineStatus;
    JobId: string;
    StepResults: PipelineStepResult[];
    StartedAt: string;
    CompletedAt?: string;
    DurationMs: number;
    Error?: string;
}

export interface PipelineStepResult {
    StepIndex: number;
    StepName: string;
    Action: string;
    Status: PipelineStatus;
    StartedAt: string;
    CompletedAt?: string;
    DurationMs: number;
    ResultMessage: string;
    Error?: string;
    Attempts: number;
}

export interface PipelineTemplateSummary {
    Id: string;
    Name: string;
    Description: string;
    Category: string;
}

// ─── Common types ──────────────────────────────────────────────────

/** Block metadata stored alongside temp files */
export interface BlockMetadata {
    deviceName: string;
    blockName: string;
    blockType: string;
    language: string;
    exportedAt: string;
    modifiedDate?: string;
}
