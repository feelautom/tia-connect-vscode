import { describe, it, expect } from 'vitest';
import {
    normalizeXml,
    sortXmlAttributes,
    extractSections,
    compareBlocks,
    isInstanceDb,
    extractStartValues,
} from '../../src/utils/smartComparison';

describe('normalizeXml', () => {
    it('strips ID and UId attributes', () => {
        const xml = '<Part Name="Contact" UId="25" ID="3">';
        const result = normalizeXml(xml);
        expect(result).not.toContain('UId=');
        expect(result).not.toContain('ID=');
        expect(result).toContain('Name="Contact"');
    });

    it('strips Created/Modified timestamps', () => {
        const xml = '<Root><Created>2026-05-06T21:07:36Z</Created><Name>Test</Name></Root>';
        const result = normalizeXml(xml);
        expect(result).not.toContain('Created');
        expect(result).toContain('Name');
    });

    it('strips DocumentInfo element entirely', () => {
        const xml = '<Doc><DocumentInfo><Created>2026</Created><ExportSetting>None</ExportSetting></DocumentInfo><Data>keep</Data></Doc>';
        const result = normalizeXml(xml);
        expect(result).not.toContain('DocumentInfo');
        expect(result).toContain('keep');
    });

    it('strips Engineering element', () => {
        const xml = '<Root><Engineering version="V20" /><Data>keep</Data></Root>';
        const result = normalizeXml(xml);
        expect(result).not.toContain('Engineering');
        expect(result).toContain('keep');
    });

    it('normalizes whitespace', () => {
        const xml = '<Root>\r\n\t<Child>\n\t\tvalue\n\t</Child>\r\n</Root>';
        const result = normalizeXml(xml);
        expect(result).not.toContain('\r');
        expect(result).not.toContain('\t');
    });

    it('produces identical output for semantically equal XMLs', () => {
        const xml1 = '<Root ID="1">\n  <Created>2026-01-01</Created>\n  <Part Name="X" UId="10"/>\n</Root>';
        const xml2 = '<Root ID="999">\n  <Created>2026-12-31</Created>\n  <Part Name="X" UId="42"/>\n</Root>';
        expect(normalizeXml(xml1)).toBe(normalizeXml(xml2));
    });
});

describe('sortXmlAttributes', () => {
    it('sorts attributes alphabetically', () => {
        const xml = '<Part Name="Contact" Version="1.0" Language="LAD">';
        const result = sortXmlAttributes(xml);
        expect(result).toBe('<Part Language="LAD" Name="Contact" Version="1.0">');
    });

    it('handles self-closing tags', () => {
        const xml = '<Member Name="Start" Datatype="Bool" />';
        const result = sortXmlAttributes(xml);
        expect(result).toBe('<Member Datatype="Bool" Name="Start" />');
    });

    it('leaves single-attribute tags unchanged', () => {
        const xml = '<Root Name="test">';
        const result = sortXmlAttributes(xml);
        expect(result).toBe('<Root Name="test">');
    });

    it('handles tags with no attributes', () => {
        const xml = '<Root>';
        const result = sortXmlAttributes(xml);
        expect(result).toBe('<Root>');
    });
});

describe('extractSections', () => {
    it('extracts Interface section', () => {
        const xml = '<Block><Interface><Sections><Member Name="X"/></Sections></Interface></Block>';
        const sections = extractSections(xml);
        expect(sections.has('Interface')).toBe(true);
        expect(sections.get('Interface')).toContain('Member');
    });

    it('extracts FlgNet network sources', () => {
        const xml = '<Block><FlgNet xmlns="test"><Parts><Part Name="Contact"/></Parts></FlgNet></Block>';
        const sections = extractSections(xml);
        expect(sections.has('Network_1')).toBe(true);
        expect(sections.get('Network_1')).toContain('Contact');
    });

    it('extracts multiple networks', () => {
        const xml = '<Block><FlgNet xmlns="a"><Parts>net1</Parts></FlgNet><FlgNet xmlns="b"><Parts>net2</Parts></FlgNet></Block>';
        const sections = extractSections(xml);
        expect(sections.has('Network_1')).toBe(true);
        expect(sections.has('Network_2')).toBe(true);
    });

    it('extracts AttributeList', () => {
        const xml = '<Block><AttributeList><Name>FB_Motor</Name><Number>1</Number></AttributeList></Block>';
        const sections = extractSections(xml);
        expect(sections.has('Attributes')).toBe(true);
        expect(sections.get('Attributes')).toContain('FB_Motor');
    });

    it('strips MemoryReserve from attributes', () => {
        const xml = '<Block><AttributeList><Name>FB1</Name><MemoryReserve>100</MemoryReserve></AttributeList></Block>';
        const sections = extractSections(xml);
        expect(sections.get('Attributes')).not.toContain('MemoryReserve');
    });
});

describe('compareBlocks', () => {
    it('returns isEqual=true for identical blocks', () => {
        const xml = '<Block ID="1"><Created>2026</Created><Part Name="X" UId="1"/></Block>';
        const result = compareBlocks(xml, xml);
        expect(result.isEqual).toBe(true);
        expect(result.differences).toHaveLength(0);
    });

    it('returns isEqual=true when only IDs and timestamps differ', () => {
        const local = '<Block ID="1"><Created>2026-01-01</Created><Part Name="X" UId="10"/></Block>';
        const remote = '<Block ID="99"><Created>2026-06-15</Created><Part Name="X" UId="42"/></Block>';
        const result = compareBlocks(local, remote);
        expect(result.isEqual).toBe(true);
    });

    it('detects real differences', () => {
        const local = '<Block><Interface><Member Name="Start" Datatype="Bool"/></Interface></Block>';
        const remote = '<Block><Interface><Member Name="Start" Datatype="Int"/></Interface></Block>';
        const result = compareBlocks(local, remote);
        expect(result.isEqual).toBe(false);
        expect(result.differences.length).toBeGreaterThan(0);
        const diff = result.differences.find(d => d.path === 'Interface');
        expect(diff).toBeDefined();
        expect(diff?.type).toBe('changed');
    });

    it('detects added sections', () => {
        const local = '<Block><Interface><Member Name="X"/></Interface><FlgNet xmlns="a"><Parts>net</Parts></FlgNet></Block>';
        const remote = '<Block><Interface><Member Name="X"/></Interface></Block>';
        const result = compareBlocks(local, remote);
        expect(result.isEqual).toBe(false);
        expect(result.differences.some(d => d.type === 'added' && d.path === 'Network_1')).toBe(true);
    });

    it('detects removed sections', () => {
        const local = '<Block><Interface><Member Name="X"/></Interface></Block>';
        const remote = '<Block><Interface><Member Name="X"/></Interface><FlgNet xmlns="a"><Parts>net</Parts></FlgNet></Block>';
        const result = compareBlocks(local, remote);
        expect(result.isEqual).toBe(false);
        expect(result.differences.some(d => d.type === 'removed' && d.path === 'Network_1')).toBe(true);
    });
});

describe('isInstanceDb', () => {
    it('detects SW.Blocks.InstanceDB', () => {
        expect(isInstanceDb('<SW.Blocks.InstanceDB ID="0">')).toBe(true);
    });

    it('detects BlockType InstanceDB', () => {
        expect(isInstanceDb('<Block><BlockType>InstanceDB</BlockType></Block>')).toBe(true);
    });

    it('returns false for FB', () => {
        expect(isInstanceDb('<SW.Blocks.FB ID="0">')).toBe(false);
    });
});

describe('extractStartValues', () => {
    it('extracts start values', () => {
        const xml = '<DB><StartValue>true</StartValue><StartValue>42</StartValue></DB>';
        const values = extractStartValues(xml);
        expect(values.size).toBe(2);
        expect(values.get('StartValue_1')).toBe('true');
        expect(values.get('StartValue_2')).toBe('42');
    });

    it('returns empty map when no start values', () => {
        const xml = '<DB><Name>Test</Name></DB>';
        const values = extractStartValues(xml);
        expect(values.size).toBe(0);
    });
});
