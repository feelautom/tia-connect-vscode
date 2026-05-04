import * as vscode from 'vscode';
import { SclCompletionProvider, StlCompletionProvider } from './completionProvider';
import { SclDocumentSymbolProvider } from './symbolProvider';
import { SclDefinitionProvider } from './definitionProvider';
import { SclHoverProvider } from './hoverProvider';

const SCL_SELECTOR: vscode.DocumentSelector = { language: 'scl' };
const STL_SELECTOR: vscode.DocumentSelector = { language: 'stl' };

/**
 * Register all language feature providers for SCL and STL.
 */
export function registerLanguageProviders(context: vscode.ExtensionContext): void {
    // SCL providers
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(SCL_SELECTOR, new SclCompletionProvider(), '.', ':'),
        vscode.languages.registerDocumentSymbolProvider(SCL_SELECTOR, new SclDocumentSymbolProvider()),
        vscode.languages.registerDefinitionProvider(SCL_SELECTOR, new SclDefinitionProvider()),
        vscode.languages.registerHoverProvider(SCL_SELECTOR, new SclHoverProvider(false)),
    );

    // STL providers
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(STL_SELECTOR, new StlCompletionProvider()),
        vscode.languages.registerDocumentSymbolProvider(STL_SELECTOR, new SclDocumentSymbolProvider()),
        vscode.languages.registerDefinitionProvider(STL_SELECTOR, new SclDefinitionProvider()),
        vscode.languages.registerHoverProvider(STL_SELECTOR, new SclHoverProvider(true)),
    );
}
