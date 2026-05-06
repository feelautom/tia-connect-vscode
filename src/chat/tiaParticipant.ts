import * as vscode from 'vscode';
import { ProjectTreeProvider } from '../providers/projectTreeProvider';
import { log } from '../views/outputChannel';

const SYSTEM_PROMPT = `You are the T-IA Connect automation assistant for Siemens TIA Portal.
You help users create, edit, compile, test and deploy PLC programs using the registered tia_* tools.

Workflow rules:
- Use tia_get_project_overview first to understand the current project and devices.
- Use tia_list_blocks to discover blocks before reading or modifying them.
- After creating or importing code, ALWAYS compile with tia_compile_device and check the result.
- Use tia_compile_block for single-block compilation (faster than full device compile).
- Use tia_get_block_source to read SCL/STL source code. Use tia_get_block_content for LAD/FBD details.
- Use tia_import_scl to import SCL source code into TIA Portal.
- To create a new block, use tia_create_block with blockType (FB/FC/OB/DB) and language (SCL/LAD/FBD/STL/GRAPH).
- For PLCSim simulation: check tia_plcsim_status, then use tia_plcsim_read_tag / tia_plcsim_write_tag.
- Use tia_run_tests to run PLC unit tests.
- Use tia_vcs_commit to commit changes, tia_vcs_status to check pending changes.
- Keep responses concise and technical.
- When listing blocks/tags, format results as clean tables.`;

export function registerChatParticipant(
    context: vscode.ExtensionContext,
    treeProvider: ProjectTreeProvider,
): void {
    // Check if chat API is available (VS Code 1.96+)
    if (!vscode.chat?.createChatParticipant) {
        log('[Chat] vscode.chat.createChatParticipant not available — skipping @tia registration');
        return;
    }

    const handler: vscode.ChatRequestHandler = async (request, _chatContext, response, token) => {
        try {
            const tools = vscode.lm.tools.filter(t => t.name.startsWith('tia_'));
            if (tools.length === 0) {
                response.markdown('T-IA Connect tools are not registered. Make sure the extension is connected to a project.');
                return;
            }

            // Build context from current project
            const overview = treeProvider.getProjectOverview();
            const projectContext = overview
                ? `Current TIA Portal project: "${overview.Name}"\nDevices: ${overview.Devices?.map(d => `${d.Name} (${d.TypeIdentifier || 'PLC'})`).join(', ') || 'none'}`
                : 'No project is currently open. Use tia_get_project_overview to check.';

            const messages = [
                vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
                vscode.LanguageModelChatMessage.User(projectContext),
                vscode.LanguageModelChatMessage.User(request.prompt),
            ];

            const chatResponse = await request.model.sendRequest(
                messages,
                { tools, toolMode: vscode.LanguageModelChatToolMode.Auto },
                token,
            );

            for await (const part of chatResponse.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    response.markdown(part.value);
                }
                // Tool call parts are handled by VS Code automatically
            }
        } catch (err: unknown) {
            if (err instanceof vscode.CancellationError) { return; }
            const msg = err instanceof Error ? err.message : String(err);
            log(`[Chat] @tia error: ${msg}`);
            response.markdown(`**T-IA Connect error:** ${msg}`);
        }
    };

    const participant = vscode.chat.createChatParticipant('tia.connect', handler);
    participant.iconPath = new vscode.ThemeIcon('plug');
    context.subscriptions.push(participant);
    log('[Chat] Registered @tia chat participant');
}
