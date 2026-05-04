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

/** Export source result */
export interface ExportSourceResult {
    Content: string;
    Language: string;
    BlockName: string;
}

/** Import result */
export interface ImportResult {
    Success: boolean;
    BlockName: string;
    Message: string;
}

/** Block metadata stored alongside temp files */
export interface BlockMetadata {
    deviceName: string;
    blockName: string;
    blockType: string;
    language: string;
    exportedAt: string;
    modifiedDate?: string;
}
