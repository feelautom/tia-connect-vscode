import { describe, it, expect } from 'vitest';
import { normalizeCompilationResult, flattenMessages, mapState } from '../../src/api/blocks';

describe('mapState', () => {
    it('maps "error" to Error', () => {
        expect(mapState('error')).toBe('Error');
        expect(mapState('Error')).toBe('Error');
        expect(mapState('ERROR')).toBe('Error');
    });

    it('maps "warning" to Warning', () => {
        expect(mapState('warning')).toBe('Warning');
        expect(mapState('Warning')).toBe('Warning');
    });

    it('maps anything else to Info', () => {
        expect(mapState('info')).toBe('Info');
        expect(mapState('success')).toBe('Info');
        expect(mapState('')).toBe('Info');
    });
});

describe('flattenMessages', () => {
    it('extracts flat messages', () => {
        const msgs = [
            { Description: 'Error in block', State: 'Error', Path: 'PLC_1/FB1' },
            { Description: 'Minor issue', State: 'Warning', Path: 'PLC_1/FB1' },
        ];
        const result = flattenMessages(msgs);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ Path: 'PLC_1/FB1', Description: 'Error in block', ErrorLevel: 'Error' });
        expect(result[1]).toEqual({ Path: 'PLC_1/FB1', Description: 'Minor issue', ErrorLevel: 'Warning' });
    });

    it('handles nested messages', () => {
        const msgs = [
            {
                Description: 'Parent',
                State: 'Error',
                Path: 'PLC_1',
                Messages: [
                    { Description: 'Child 1', State: 'Warning', Path: 'PLC_1/FB1' },
                    { Description: 'Child 2', State: 'Error', Path: 'PLC_1/FB2' },
                ],
            },
        ];
        const result = flattenMessages(msgs);
        expect(result).toHaveLength(3);
        expect(result[0].Description).toBe('Parent');
        expect(result[1].Description).toBe('Child 1');
        expect(result[2].Description).toBe('Child 2');
    });

    it('handles camelCase keys from API', () => {
        const msgs = [
            { description: 'Lower case', state: 'error', path: 'PLC_1/Main' },
        ];
        const result = flattenMessages(msgs);
        expect(result).toHaveLength(1);
        expect(result[0].Description).toBe('Lower case');
        expect(result[0].Path).toBe('PLC_1/Main');
        expect(result[0].ErrorLevel).toBe('Error');
    });

    it('skips messages without description', () => {
        const msgs = [
            { State: 'Error' }, // no Description
            { Description: 'Valid', State: 'Warning', Path: '' },
        ];
        const result = flattenMessages(msgs);
        expect(result).toHaveLength(1);
        expect(result[0].Description).toBe('Valid');
    });

    it('handles empty array', () => {
        expect(flattenMessages([])).toEqual([]);
    });

    it('handles deeply nested messages', () => {
        const msgs = [
            {
                Description: 'L1',
                State: 'Info',
                Path: '',
                Messages: [
                    {
                        Description: 'L2',
                        State: 'Warning',
                        Path: '',
                        messages: [
                            { Description: 'L3', State: 'Error', Path: 'deep' },
                        ],
                    },
                ],
            },
        ];
        const result = flattenMessages(msgs);
        expect(result).toHaveLength(3);
        expect(result[2].Description).toBe('L3');
        expect(result[2].ErrorLevel).toBe('Error');
    });
});

describe('normalizeCompilationResult', () => {
    it('normalizes successful compilation', () => {
        const data = {
            Result: {
                State: 'Success',
                ErrorCount: 0,
                WarningCount: 2,
                Messages: [
                    { Description: 'Warning 1', State: 'Warning', Path: 'PLC_1' },
                    { Description: 'Warning 2', State: 'Warning', Path: 'PLC_1' },
                ],
            },
        };
        const result = normalizeCompilationResult(data);
        expect(result.Success).toBe(true);
        expect(result.ErrorCount).toBe(0);
        expect(result.WarningCount).toBe(2);
        expect(result.Messages).toHaveLength(2);
    });

    it('normalizes failed compilation', () => {
        const data = {
            Result: {
                State: 'Error',
                ErrorCount: 1,
                WarningCount: 0,
                Messages: [
                    { Description: 'Syntax error', State: 'Error', Path: 'PLC_1/FB1' },
                ],
            },
        };
        const result = normalizeCompilationResult(data);
        expect(result.Success).toBe(false);
        expect(result.ErrorCount).toBe(1);
    });

    it('handles null/undefined data', () => {
        const result = normalizeCompilationResult(null);
        expect(result.Success).toBe(false);
        expect(result.ErrorCount).toBe(0);
        expect(result.WarningCount).toBe(0);
        expect(result.Messages).toEqual([]);
    });

    it('handles flat data (no Result wrapper)', () => {
        const data = {
            State: 'Success',
            ErrorCount: 0,
            WarningCount: 0,
            Messages: [],
        };
        const result = normalizeCompilationResult(data);
        expect(result.Success).toBe(true);
    });

    it('handles camelCase keys', () => {
        const data = {
            state: 'success',
            errorCount: 1,
            warningCount: 3,
            messages: [],
        };
        const result = normalizeCompilationResult(data);
        expect(result.ErrorCount).toBe(1);
        expect(result.WarningCount).toBe(3);
    });

    it('Success is false when ErrorCount > 0 even if State is Success', () => {
        const data = {
            State: 'Success',
            ErrorCount: 1,
            WarningCount: 0,
            Messages: [],
        };
        const result = normalizeCompilationResult(data);
        expect(result.Success).toBe(false);
    });
});
