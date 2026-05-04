/**
 * SCL and STL keyword databases for autocompletion and hover documentation.
 */

export interface KeywordInfo {
    label: string;
    detail: string;
    documentation: string;
    insertText?: string;
    kind: 'keyword' | 'type' | 'function' | 'constant' | 'snippet';
}

// ─── SCL Keywords ────────────────────────────────────────────────────

export const SCL_KEYWORDS: KeywordInfo[] = [
    // Control flow
    { label: 'IF', detail: 'Conditional statement', documentation: 'IF condition THEN ... ELSIF ... ELSE ... END_IF;', insertText: 'IF ${1:condition} THEN\n\t$0\nEND_IF;', kind: 'snippet' },
    { label: 'ELSIF', detail: 'Else-if branch', documentation: 'ELSIF condition THEN ...', kind: 'keyword' },
    { label: 'ELSE', detail: 'Else branch', documentation: 'ELSE ...', kind: 'keyword' },
    { label: 'END_IF', detail: 'End of IF statement', documentation: 'Closes an IF block', kind: 'keyword' },
    { label: 'CASE', detail: 'Case statement', documentation: 'CASE expression OF value: ... END_CASE;', insertText: 'CASE ${1:expression} OF\n\t${2:1}:\n\t\t$0\nEND_CASE;', kind: 'snippet' },
    { label: 'END_CASE', detail: 'End of CASE statement', documentation: 'Closes a CASE block', kind: 'keyword' },
    { label: 'FOR', detail: 'For loop', documentation: 'FOR var := start TO end [BY step] DO ... END_FOR;', insertText: 'FOR ${1:i} := ${2:0} TO ${3:10} DO\n\t$0\nEND_FOR;', kind: 'snippet' },
    { label: 'END_FOR', detail: 'End of FOR loop', documentation: 'Closes a FOR block', kind: 'keyword' },
    { label: 'WHILE', detail: 'While loop', documentation: 'WHILE condition DO ... END_WHILE;', insertText: 'WHILE ${1:condition} DO\n\t$0\nEND_WHILE;', kind: 'snippet' },
    { label: 'END_WHILE', detail: 'End of WHILE loop', documentation: 'Closes a WHILE block', kind: 'keyword' },
    { label: 'REPEAT', detail: 'Repeat-until loop', documentation: 'REPEAT ... UNTIL condition END_REPEAT;', insertText: 'REPEAT\n\t$0\nUNTIL ${1:condition}\nEND_REPEAT;', kind: 'snippet' },
    { label: 'END_REPEAT', detail: 'End of REPEAT loop', documentation: 'Closes a REPEAT block', kind: 'keyword' },
    { label: 'DO', detail: 'Loop body keyword', documentation: 'Marks beginning of loop body', kind: 'keyword' },
    { label: 'TO', detail: 'FOR loop upper bound', documentation: 'Upper bound of FOR loop', kind: 'keyword' },
    { label: 'BY', detail: 'FOR loop step', documentation: 'Step value of FOR loop', kind: 'keyword' },
    { label: 'THEN', detail: 'IF/ELSIF body', documentation: 'Marks beginning of IF/ELSIF body', kind: 'keyword' },
    { label: 'OF', detail: 'CASE/ARRAY keyword', documentation: 'Used in CASE and ARRAY declarations', kind: 'keyword' },
    { label: 'RETURN', detail: 'Return from function', documentation: 'Exits the current function/FB', kind: 'keyword' },
    { label: 'EXIT', detail: 'Exit loop', documentation: 'Exits the innermost FOR/WHILE/REPEAT loop', kind: 'keyword' },
    { label: 'CONTINUE', detail: 'Skip to next iteration', documentation: 'Skips to the next iteration of the innermost loop', kind: 'keyword' },
    { label: 'GOTO', detail: 'Jump to label', documentation: 'GOTO label; (avoid if possible)', kind: 'keyword' },

    // Logical operators
    { label: 'AND', detail: 'Logical AND', documentation: 'Bitwise/logical AND operator', kind: 'keyword' },
    { label: 'OR', detail: 'Logical OR', documentation: 'Bitwise/logical OR operator', kind: 'keyword' },
    { label: 'XOR', detail: 'Logical XOR', documentation: 'Bitwise/logical XOR operator', kind: 'keyword' },
    { label: 'NOT', detail: 'Logical NOT', documentation: 'Bitwise/logical NOT operator', kind: 'keyword' },
    { label: 'MOD', detail: 'Modulo operator', documentation: 'Returns remainder of integer division', kind: 'keyword' },

    // Boolean literals
    { label: 'TRUE', detail: 'Boolean true', documentation: 'Boolean literal TRUE', kind: 'constant' },
    { label: 'FALSE', detail: 'Boolean false', documentation: 'Boolean literal FALSE', kind: 'constant' },

    // Block structure
    { label: 'FUNCTION_BLOCK', detail: 'Function Block declaration', documentation: 'FUNCTION_BLOCK "Name"', kind: 'keyword' },
    { label: 'END_FUNCTION_BLOCK', detail: 'End of Function Block', documentation: 'Closes a FUNCTION_BLOCK', kind: 'keyword' },
    { label: 'FUNCTION', detail: 'Function declaration', documentation: 'FUNCTION "Name" : ReturnType', kind: 'keyword' },
    { label: 'END_FUNCTION', detail: 'End of Function', documentation: 'Closes a FUNCTION', kind: 'keyword' },
    { label: 'DATA_BLOCK', detail: 'Data Block declaration', documentation: 'DATA_BLOCK "Name"', kind: 'keyword' },
    { label: 'END_DATA_BLOCK', detail: 'End of Data Block', documentation: 'Closes a DATA_BLOCK', kind: 'keyword' },
    { label: 'ORGANIZATION_BLOCK', detail: 'Organization Block declaration', documentation: 'ORGANIZATION_BLOCK "Name"', kind: 'keyword' },
    { label: 'END_ORGANIZATION_BLOCK', detail: 'End of Organization Block', documentation: 'Closes an ORGANIZATION_BLOCK', kind: 'keyword' },
    { label: 'TYPE', detail: 'UDT declaration', documentation: 'TYPE "Name"', kind: 'keyword' },
    { label: 'END_TYPE', detail: 'End of TYPE', documentation: 'Closes a TYPE block', kind: 'keyword' },

    // Variable sections
    { label: 'VAR_INPUT', detail: 'Input variable section', documentation: 'Declares input parameters', kind: 'keyword' },
    { label: 'VAR_OUTPUT', detail: 'Output variable section', documentation: 'Declares output parameters', kind: 'keyword' },
    { label: 'VAR_IN_OUT', detail: 'In/Out variable section', documentation: 'Declares in-out parameters (passed by reference)', kind: 'keyword' },
    { label: 'VAR_TEMP', detail: 'Temporary variable section', documentation: 'Declares temporary local variables', kind: 'keyword' },
    { label: 'VAR_STATIC', detail: 'Static variable section', documentation: 'Declares static variables (retain value between calls)', kind: 'keyword' },
    { label: 'VAR_CONSTANT', detail: 'Constant section', documentation: 'Declares constants', kind: 'keyword' },
    { label: 'VAR', detail: 'Variable section', documentation: 'Generic variable declaration section', kind: 'keyword' },
    { label: 'END_VAR', detail: 'End of variable section', documentation: 'Closes a VAR section', kind: 'keyword' },
    { label: 'BEGIN', detail: 'Code section start', documentation: 'Marks beginning of executable code', kind: 'keyword' },

    // Pragmas
    { label: 'STRUCT', detail: 'Structure type', documentation: 'Inline structure declaration', kind: 'keyword' },
    { label: 'END_STRUCT', detail: 'End of structure', documentation: 'Closes a STRUCT', kind: 'keyword' },
    { label: 'ARRAY', detail: 'Array type', documentation: 'ARRAY[lower..upper] OF DataType', kind: 'keyword' },
    { label: 'AT', detail: 'Overlay variable', documentation: 'AT overlay for direct memory access', kind: 'keyword' },
    { label: 'REF_TO', detail: 'Reference type', documentation: 'REF_TO DataType — pointer/reference', kind: 'keyword' },
    { label: 'VERSION', detail: 'Block version', documentation: 'VERSION : 0.1', kind: 'keyword' },
];

// ─── SCL Data Types ──────────────────────────────────────────────────

export const SCL_TYPES: KeywordInfo[] = [
    { label: 'Bool', detail: 'Boolean (1 bit)', documentation: 'TRUE or FALSE', kind: 'type' },
    { label: 'Byte', detail: 'Unsigned 8-bit', documentation: '0 to 255', kind: 'type' },
    { label: 'Word', detail: 'Unsigned 16-bit', documentation: '0 to 65535 (bit pattern)', kind: 'type' },
    { label: 'DWord', detail: 'Unsigned 32-bit', documentation: '0 to 4294967295 (bit pattern)', kind: 'type' },
    { label: 'LWord', detail: 'Unsigned 64-bit', documentation: '64-bit bit pattern', kind: 'type' },
    { label: 'SInt', detail: 'Signed 8-bit integer', documentation: '-128 to 127', kind: 'type' },
    { label: 'Int', detail: 'Signed 16-bit integer', documentation: '-32768 to 32767', kind: 'type' },
    { label: 'DInt', detail: 'Signed 32-bit integer', documentation: '-2147483648 to 2147483647', kind: 'type' },
    { label: 'LInt', detail: 'Signed 64-bit integer', documentation: '64-bit signed integer', kind: 'type' },
    { label: 'USInt', detail: 'Unsigned 8-bit integer', documentation: '0 to 255', kind: 'type' },
    { label: 'UInt', detail: 'Unsigned 16-bit integer', documentation: '0 to 65535', kind: 'type' },
    { label: 'UDInt', detail: 'Unsigned 32-bit integer', documentation: '0 to 4294967295', kind: 'type' },
    { label: 'ULInt', detail: 'Unsigned 64-bit integer', documentation: '0 to 18446744073709551615', kind: 'type' },
    { label: 'Real', detail: '32-bit floating point', documentation: 'IEEE 754 single precision', kind: 'type' },
    { label: 'LReal', detail: '64-bit floating point', documentation: 'IEEE 754 double precision', kind: 'type' },
    { label: 'String', detail: 'Character string', documentation: 'String[max_length], default 254 chars', kind: 'type' },
    { label: 'WString', detail: 'Wide character string', documentation: 'Unicode string', kind: 'type' },
    { label: 'Char', detail: 'Single character', documentation: 'Single ASCII character', kind: 'type' },
    { label: 'WChar', detail: 'Wide character', documentation: 'Single Unicode character', kind: 'type' },
    { label: 'Time', detail: 'IEC time duration', documentation: 'T#1s, T#500ms, T#1h30m', kind: 'type' },
    { label: 'LTime', detail: 'Long time duration', documentation: 'Nanosecond resolution time', kind: 'type' },
    { label: 'Date', detail: 'Date value', documentation: 'D#2026-01-01', kind: 'type' },
    { label: 'TOD', detail: 'Time of day', documentation: 'TOD#12:30:00', kind: 'type' },
    { label: 'LTOD', detail: 'Long time of day', documentation: 'Nanosecond resolution time of day', kind: 'type' },
    { label: 'DT', detail: 'Date and time', documentation: 'DT#2026-01-01-12:00:00', kind: 'type' },
    { label: 'DTL', detail: 'Date and time long', documentation: 'Nanosecond resolution date+time', kind: 'type' },
    { label: 'Timer', detail: 'S5 Timer', documentation: 'Legacy S5 timer type', kind: 'type' },
    { label: 'Counter', detail: 'S5 Counter', documentation: 'Legacy S5 counter type', kind: 'type' },
    { label: 'Void', detail: 'No return type', documentation: 'Used for functions with no return value', kind: 'type' },
];

// ─── SCL Built-in Functions ──────────────────────────────────────────

export const SCL_FUNCTIONS: KeywordInfo[] = [
    // Math
    { label: 'ABS', detail: 'Absolute value', documentation: 'ABS(value) : same_type — Returns absolute value', kind: 'function' },
    { label: 'SQR', detail: 'Square', documentation: 'SQR(value) : Real — Returns value squared', kind: 'function' },
    { label: 'SQRT', detail: 'Square root', documentation: 'SQRT(value) : Real — Returns square root', kind: 'function' },
    { label: 'LN', detail: 'Natural logarithm', documentation: 'LN(value) : Real — Returns natural log', kind: 'function' },
    { label: 'EXP', detail: 'Exponential', documentation: 'EXP(value) : Real — Returns e^value', kind: 'function' },
    { label: 'SIN', detail: 'Sine', documentation: 'SIN(angle) : Real — Angle in radians', kind: 'function' },
    { label: 'COS', detail: 'Cosine', documentation: 'COS(angle) : Real — Angle in radians', kind: 'function' },
    { label: 'TAN', detail: 'Tangent', documentation: 'TAN(angle) : Real — Angle in radians', kind: 'function' },
    { label: 'ASIN', detail: 'Arc sine', documentation: 'ASIN(value) : Real — Returns angle in radians', kind: 'function' },
    { label: 'ACOS', detail: 'Arc cosine', documentation: 'ACOS(value) : Real — Returns angle in radians', kind: 'function' },
    { label: 'ATAN', detail: 'Arc tangent', documentation: 'ATAN(value) : Real — Returns angle in radians', kind: 'function' },
    { label: 'MIN', detail: 'Minimum value', documentation: 'MIN(IN1 := a, IN2 := b) : same_type', kind: 'function' },
    { label: 'MAX', detail: 'Maximum value', documentation: 'MAX(IN1 := a, IN2 := b) : same_type', kind: 'function' },
    { label: 'LIMIT', detail: 'Clamp value', documentation: 'LIMIT(MN := min, IN := value, MX := max) : same_type', kind: 'function' },

    // Conversion
    { label: 'INT_TO_REAL', detail: 'Int to Real conversion', documentation: 'Converts Int to Real', kind: 'function' },
    { label: 'REAL_TO_INT', detail: 'Real to Int conversion', documentation: 'Converts Real to Int (truncates)', kind: 'function' },
    { label: 'BOOL_TO_INT', detail: 'Bool to Int conversion', documentation: 'FALSE=0, TRUE=1', kind: 'function' },
    { label: 'INT_TO_DINT', detail: 'Int to DInt conversion', documentation: 'Widens Int to DInt', kind: 'function' },
    { label: 'DINT_TO_INT', detail: 'DInt to Int conversion', documentation: 'Narrows DInt to Int', kind: 'function' },
    { label: 'DINT_TO_REAL', detail: 'DInt to Real conversion', documentation: 'Converts DInt to Real', kind: 'function' },

    // Bit/shift
    { label: 'SHL', detail: 'Shift left', documentation: 'SHL(IN := value, N := bits) : same_type', kind: 'function' },
    { label: 'SHR', detail: 'Shift right', documentation: 'SHR(IN := value, N := bits) : same_type', kind: 'function' },
    { label: 'ROL', detail: 'Rotate left', documentation: 'ROL(IN := value, N := bits) : same_type', kind: 'function' },
    { label: 'ROR', detail: 'Rotate right', documentation: 'ROR(IN := value, N := bits) : same_type', kind: 'function' },

    // String
    { label: 'LEN', detail: 'String length', documentation: 'LEN(s) : Int — Returns current length of string', kind: 'function' },
    { label: 'CONCAT', detail: 'Concatenate strings', documentation: 'CONCAT(IN1 := s1, IN2 := s2) : String', kind: 'function' },
    { label: 'LEFT', detail: 'Left substring', documentation: 'LEFT(IN := s, L := count) : String', kind: 'function' },
    { label: 'RIGHT', detail: 'Right substring', documentation: 'RIGHT(IN := s, L := count) : String', kind: 'function' },
    { label: 'MID', detail: 'Middle substring', documentation: 'MID(IN := s, L := count, P := start) : String', kind: 'function' },
    { label: 'FIND', detail: 'Find substring', documentation: 'FIND(IN1 := haystack, IN2 := needle) : Int', kind: 'function' },
    { label: 'REPLACE', detail: 'Replace substring', documentation: 'REPLACE(IN1 := s, IN2 := new, L := count, P := start) : String', kind: 'function' },
];

// ─── STL Instructions ────────────────────────────────────────────────

export const STL_INSTRUCTIONS: KeywordInfo[] = [
    // Bit logic
    { label: 'A', detail: 'AND', documentation: 'A operand — AND with RLO', kind: 'keyword' },
    { label: 'AN', detail: 'AND NOT', documentation: 'AN operand — AND NOT with RLO', kind: 'keyword' },
    { label: 'O', detail: 'OR', documentation: 'O operand — OR with RLO', kind: 'keyword' },
    { label: 'ON', detail: 'OR NOT', documentation: 'ON operand — OR NOT with RLO', kind: 'keyword' },
    { label: 'X', detail: 'XOR', documentation: 'X operand — XOR with RLO', kind: 'keyword' },
    { label: 'XN', detail: 'XOR NOT', documentation: 'XN operand — XOR NOT with RLO', kind: 'keyword' },
    { label: 'NOT', detail: 'Negate RLO', documentation: 'NOT — Inverts RLO', kind: 'keyword' },
    { label: 'SET', detail: 'Set RLO=1', documentation: 'SET — Forces RLO to 1', kind: 'keyword' },
    { label: 'CLR', detail: 'Clear RLO=0', documentation: 'CLR — Forces RLO to 0', kind: 'keyword' },
    { label: 'SAVE', detail: 'Save RLO to BR', documentation: 'SAVE — Saves RLO to BR register', kind: 'keyword' },
    { label: 'S', detail: 'Set bit', documentation: 'S operand — Sets bit if RLO=1', kind: 'keyword' },
    { label: 'R', detail: 'Reset bit', documentation: 'R operand — Resets bit if RLO=1', kind: 'keyword' },
    { label: '=', detail: 'Assign bit', documentation: '= operand — Assigns RLO to bit', kind: 'keyword' },
    { label: 'FP', detail: 'Positive edge', documentation: 'FP operand — Detects 0->1 transition', kind: 'keyword' },
    { label: 'FN', detail: 'Negative edge', documentation: 'FN operand — Detects 1->0 transition', kind: 'keyword' },

    // Load/Transfer
    { label: 'L', detail: 'Load', documentation: 'L operand — Loads value into ACCU1', kind: 'keyword' },
    { label: 'T', detail: 'Transfer', documentation: 'T operand — Transfers ACCU1 to operand', kind: 'keyword' },

    // Accumulator
    { label: 'TAK', detail: 'Toggle ACCU', documentation: 'TAK — Swaps ACCU1 and ACCU2', kind: 'keyword' },
    { label: 'PUSH', detail: 'Push ACCU', documentation: 'PUSH — Copies ACCU1 to ACCU2', kind: 'keyword' },
    { label: 'POP', detail: 'Pop ACCU', documentation: 'POP — Copies ACCU2 to ACCU1', kind: 'keyword' },

    // Integer math
    { label: '+I', detail: 'Add Int', documentation: 'ACCU1 := ACCU2 + ACCU1 (16-bit)', kind: 'keyword' },
    { label: '-I', detail: 'Subtract Int', documentation: 'ACCU1 := ACCU2 - ACCU1 (16-bit)', kind: 'keyword' },
    { label: '*I', detail: 'Multiply Int', documentation: 'ACCU1 := ACCU2 * ACCU1 (16-bit)', kind: 'keyword' },
    { label: '/I', detail: 'Divide Int', documentation: 'ACCU1 := ACCU2 / ACCU1 (16-bit)', kind: 'keyword' },
    { label: '+D', detail: 'Add DInt', documentation: 'ACCU1 := ACCU2 + ACCU1 (32-bit)', kind: 'keyword' },
    { label: '-D', detail: 'Subtract DInt', documentation: 'ACCU1 := ACCU2 - ACCU1 (32-bit)', kind: 'keyword' },
    { label: '*D', detail: 'Multiply DInt', documentation: 'ACCU1 := ACCU2 * ACCU1 (32-bit)', kind: 'keyword' },
    { label: '/D', detail: 'Divide DInt', documentation: 'ACCU1 := ACCU2 / ACCU1 (32-bit)', kind: 'keyword' },
    { label: '+R', detail: 'Add Real', documentation: 'ACCU1 := ACCU2 + ACCU1 (float)', kind: 'keyword' },
    { label: '-R', detail: 'Subtract Real', documentation: 'ACCU1 := ACCU2 - ACCU1 (float)', kind: 'keyword' },
    { label: '*R', detail: 'Multiply Real', documentation: 'ACCU1 := ACCU2 * ACCU1 (float)', kind: 'keyword' },
    { label: '/R', detail: 'Divide Real', documentation: 'ACCU1 := ACCU2 / ACCU1 (float)', kind: 'keyword' },

    // Compare
    { label: '==I', detail: 'Compare Int ==', documentation: 'RLO := (ACCU2 == ACCU1) Int', kind: 'keyword' },
    { label: '<>I', detail: 'Compare Int <>', documentation: 'RLO := (ACCU2 <> ACCU1) Int', kind: 'keyword' },
    { label: '>I', detail: 'Compare Int >', documentation: 'RLO := (ACCU2 > ACCU1) Int', kind: 'keyword' },
    { label: '>=I', detail: 'Compare Int >=', documentation: 'RLO := (ACCU2 >= ACCU1) Int', kind: 'keyword' },
    { label: '<I', detail: 'Compare Int <', documentation: 'RLO := (ACCU2 < ACCU1) Int', kind: 'keyword' },
    { label: '<=I', detail: 'Compare Int <=', documentation: 'RLO := (ACCU2 <= ACCU1) Int', kind: 'keyword' },

    // Jump
    { label: 'JU', detail: 'Jump unconditional', documentation: 'JU label — Unconditional jump', kind: 'keyword' },
    { label: 'JC', detail: 'Jump if RLO=1', documentation: 'JC label — Jump if RLO is true', kind: 'keyword' },
    { label: 'JCN', detail: 'Jump if RLO=0', documentation: 'JCN label — Jump if RLO is false', kind: 'keyword' },
    { label: 'JCB', detail: 'Jump if RLO=1 + save', documentation: 'JCB label — Jump conditional, save RLO to BR', kind: 'keyword' },
    { label: 'JNB', detail: 'Jump if RLO=0 + save', documentation: 'JNB label — Jump if not, save RLO to BR', kind: 'keyword' },
    { label: 'JBI', detail: 'Jump if BR=1', documentation: 'JBI label — Jump if BR is 1', kind: 'keyword' },
    { label: 'JNBI', detail: 'Jump if BR=0', documentation: 'JNBI label — Jump if BR is 0', kind: 'keyword' },
    { label: 'JL', detail: 'Jump list', documentation: 'JL label — Jump via distribution list', kind: 'keyword' },
    { label: 'LOOP', detail: 'Loop decrement', documentation: 'LOOP label — Decrement ACCU1, jump if > 0', kind: 'keyword' },

    // Block calls
    { label: 'CALL', detail: 'Call block', documentation: 'CALL FB/FC/SFB/SFC — Call program block', kind: 'keyword' },
    { label: 'UC', detail: 'Unconditional call', documentation: 'UC block — Unconditional call (no params)', kind: 'keyword' },
    { label: 'CC', detail: 'Conditional call', documentation: 'CC block — Call if RLO=1', kind: 'keyword' },
    { label: 'BE', detail: 'Block end', documentation: 'BE — Unconditional block end', kind: 'keyword' },
    { label: 'BEC', detail: 'Block end conditional', documentation: 'BEC — End block if RLO=1', kind: 'keyword' },
    { label: 'BEU', detail: 'Block end unconditional', documentation: 'BEU — Unconditional block end (same as BE)', kind: 'keyword' },

    // Timer/Counter
    { label: 'FR', detail: 'Free timer/counter', documentation: 'FR T/C — Enable timer/counter', kind: 'keyword' },
    { label: 'SD', detail: 'On-delay timer', documentation: 'SD T — Start on-delay timer', kind: 'keyword' },
    { label: 'SS', detail: 'Retentive on-delay', documentation: 'SS T — Start retentive on-delay', kind: 'keyword' },
    { label: 'SP', detail: 'Pulse timer', documentation: 'SP T — Start pulse timer', kind: 'keyword' },
    { label: 'SE', detail: 'Extended pulse', documentation: 'SE T — Start extended pulse timer', kind: 'keyword' },
    { label: 'SF', detail: 'Off-delay timer', documentation: 'SF T — Start off-delay timer', kind: 'keyword' },
    { label: 'CU', detail: 'Count up', documentation: 'CU C — Count up if RLO=1', kind: 'keyword' },
    { label: 'CD', detail: 'Count down', documentation: 'CD C — Count down if RLO=1', kind: 'keyword' },

    // Misc
    { label: 'NOP 0', detail: 'No operation (0)', documentation: 'NOP 0 — Null operation', kind: 'keyword' },
    { label: 'NOP 1', detail: 'No operation (1)', documentation: 'NOP 1 — Null operation', kind: 'keyword' },
];
