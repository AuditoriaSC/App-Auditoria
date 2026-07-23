import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const edgeFunctions = [
  'supabase/functions/finalize-report/index.ts',
  'supabase/functions/manage-report-edit/index.ts',
];

for (const file of edgeFunctions) {
  test(`${file} transpila sin errores sintácticos`, () => {
    const source = readFileSync(file, 'utf8');
    const result = ts.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });

    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );

    assert.deepEqual(
      errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
      [],
    );
  });
}
