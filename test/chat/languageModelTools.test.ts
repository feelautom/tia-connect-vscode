import { describe, expect, it } from 'vitest';
import {
    AddDeviceTool,
    CreateBlockTool,
    DeleteBlockTool,
    DownloadToPlcTool,
    ImportSclTool,
    PipelineRunTool,
    PlcSimWriteTagTool,
    VcsCommitTool,
} from '../../src/chat/languageModelTools';

describe('dangerous language-model tools', () => {
    it.each([
        [new CreateBlockTool(), { device: 'PLC_1', blockType: 'FB', name: 'FB_Motor', language: 'SCL' }],
        [new ImportSclTool(), { device: 'PLC_1', sclContent: 'FUNCTION_BLOCK FB_Test' }],
        [new DeleteBlockTool(), { device: 'PLC_1', block: 'FB_Old' }],
        [new DownloadToPlcTool(), { device: 'PLC_1', scope: 'Software' }],
        [new PlcSimWriteTagTool(), { tagName: 'Start', value: 'true' }],
        [new VcsCommitTool(), { message: 'change' }],
        [new PipelineRunTool(), { pipeline: 'release' }],
        [new AddDeviceTool(), { orderNumber: '6ES7 511-1AK02-0AB0', name: 'PLC_1' }],
    ])('requires native user confirmation', (tool, input) => {
        const prepared = tool.prepareInvocation!({ input } as never, {} as never) as any;
        expect(prepared.confirmationMessages.title).toBeTruthy();
        expect(prepared.confirmationMessages.message).toBeTruthy();
    });
});
