import { describe, it, expect } from 'vitest';
import { parseSclDocument, parseStlDocument } from '../../src/language/sclParser';

describe('parseSclDocument', () => {
    it('parses FUNCTION_BLOCK header', () => {
        const src = `FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
    bStart : Bool;
END_VAR
BEGIN
END_FUNCTION_BLOCK`;
        const result = parseSclDocument(src);
        expect(result.header).toBeDefined();
        expect(result.header!.kind).toBe('FUNCTION_BLOCK');
        expect(result.header!.name).toBe('FB_Motor');
        expect(result.header!.line).toBe(0);
    });

    it('parses FUNCTION with return type', () => {
        const src = `FUNCTION "FC_Calc" : Int
VAR_TEMP
    tmp : Int;
END_VAR
BEGIN
    #FC_Calc := 42;
END_FUNCTION`;
        const result = parseSclDocument(src);
        expect(result.header!.kind).toBe('FUNCTION');
        expect(result.header!.name).toBe('FC_Calc');
        expect(result.header!.returnType).toBe('Int');
    });

    it('parses multiple variable sections', () => {
        const src = `FUNCTION_BLOCK "FB_Test"
VAR_INPUT
    bEnable : Bool;
    iSpeed : Int;
END_VAR
VAR_OUTPUT
    bDone : Bool;
END_VAR
VAR_STATIC
    rAccum : Real := 0.0;
END_VAR
BEGIN
END_FUNCTION_BLOCK`;
        const result = parseSclDocument(src);
        expect(result.variables).toHaveLength(4);
        expect(result.variables[0]).toMatchObject({ name: 'bEnable', dataType: 'Bool', section: 'Input' });
        expect(result.variables[1]).toMatchObject({ name: 'iSpeed', dataType: 'Int', section: 'Input' });
        expect(result.variables[2]).toMatchObject({ name: 'bDone', dataType: 'Bool', section: 'Output' });
        expect(result.variables[3]).toMatchObject({ name: 'rAccum', dataType: 'Real', section: 'Static', initialValue: '0.0' });
    });

    it('parses variable with comment', () => {
        const src = `FUNCTION_BLOCK "FB_X"
VAR_INPUT
    bStart : Bool; // Start signal
END_VAR
BEGIN
END_FUNCTION_BLOCK`;
        const result = parseSclDocument(src);
        expect(result.variables[0].comment).toBe('Start signal');
    });

    it('parses regions correctly', () => {
        const src = `FUNCTION_BLOCK "FB_R"
VAR_INPUT
    x : Int;
END_VAR
VAR_OUTPUT
    y : Int;
END_VAR
BEGIN
END_FUNCTION_BLOCK`;
        const result = parseSclDocument(src);
        expect(result.regions).toHaveLength(2);
        expect(result.regions[0].kind).toBe('VAR_INPUT');
        expect(result.regions[0].startLine).toBe(1);
        expect(result.regions[0].endLine).toBe(3);
        expect(result.regions[1].kind).toBe('VAR_OUTPUT');
    });

    it('handles empty source', () => {
        const result = parseSclDocument('');
        expect(result.header).toBeUndefined();
        expect(result.variables).toHaveLength(0);
    });

    it('handles DATA_BLOCK', () => {
        const src = `DATA_BLOCK "DB_Config"
VAR
    maxSpeed : Int := 1500;
    motorName : String := 'Motor1';
END_VAR
BEGIN
END_DATA_BLOCK`;
        const result = parseSclDocument(src);
        expect(result.header!.kind).toBe('DATA_BLOCK');
        expect(result.variables).toHaveLength(2);
        expect(result.variables[0]).toMatchObject({ name: 'maxSpeed', section: 'Var', initialValue: '1500' });
    });

    it('parses complex data types', () => {
        const src = `FUNCTION_BLOCK "FB_Arr"
VAR_TEMP
    arr : Array[0..10] of Int;
    str : String[50];
END_VAR
BEGIN
END_FUNCTION_BLOCK`;
        const result = parseSclDocument(src);
        expect(result.variables[0].dataType).toBe('Array[0..10] of Int');
        expect(result.variables[1].dataType).toBe('String[50]');
    });
});

describe('parseStlDocument', () => {
    it('parses STL block with instructions', () => {
        const src = `FUNCTION_BLOCK "FB_StlTest"
VAR_INPUT
    bIn : Bool;
END_VAR
VAR_OUTPUT
    bOut : Bool;
END_VAR
BEGIN
    A     #bIn;
    =     #bOut;
END_FUNCTION_BLOCK`;
        const result = parseStlDocument(src);
        expect(result.header!.name).toBe('FB_StlTest');
        expect(result.variables).toHaveLength(2);
        expect(result.instructions).toHaveLength(2);
        expect(result.instructions[0]).toMatchObject({ opcode: 'A', operand: '#bIn' });
        expect(result.instructions[1]).toMatchObject({ opcode: '=', operand: '#bOut' });
    });

    it('handles STL with comments', () => {
        const src = `FUNCTION "FC_Stl" : Void
BEGIN
    L     MW10; // Load speed
    T     MW20; // Transfer to output
END_FUNCTION`;
        const result = parseStlDocument(src);
        expect(result.instructions).toHaveLength(2);
        expect(result.instructions[0].comment).toBe('Load speed');
    });

    it('ignores lines before BEGIN', () => {
        const src = `FUNCTION_BLOCK "FB_Pre"
VAR_INPUT
    x : Int;
END_VAR
BEGIN
    L     #x;
END_FUNCTION_BLOCK`;
        const result = parseStlDocument(src);
        expect(result.instructions).toHaveLength(1);
        expect(result.instructions[0].opcode).toBe('L');
    });
});
