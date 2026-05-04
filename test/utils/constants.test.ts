import { describe, it, expect } from 'vitest';
import { EDITABLE_LANGUAGES, TEMP_DIR_NAME, META_FILE_SUFFIX, ORIGINAL_SCHEME } from '../../src/utils/constants';

describe('constants', () => {
    it('EDITABLE_LANGUAGES contains SCL and STL', () => {
        expect(EDITABLE_LANGUAGES).toContain('SCL');
        expect(EDITABLE_LANGUAGES).toContain('STL');
        expect(EDITABLE_LANGUAGES).toHaveLength(2);
    });

    it('TEMP_DIR_NAME is .tia-temp', () => {
        expect(TEMP_DIR_NAME).toBe('.tia-temp');
    });

    it('META_FILE_SUFFIX is .tia-meta.json', () => {
        expect(META_FILE_SUFFIX).toBe('.tia-meta.json');
    });

    it('ORIGINAL_SCHEME is tia-original', () => {
        expect(ORIGINAL_SCHEME).toBe('tia-original');
    });
});
