/**
 * Hardware Configuration API — export/import hardware config.
 */

import { client } from './client';

function enc(s: string): string {
    return encodeURIComponent(s);
}

/** Export hardware configuration to XML */
export async function exportHardwareConfig(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hardware/actions/export`,
        { exportPath: filePath }
    );
}

/** Import hardware configuration from XML */
export async function importHardwareConfig(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hardware/actions/import`,
        { importFilePath: filePath }
    );
}
