import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourceUrl = new URL('../src/features/audits/domain/dual-compliance.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const domain = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('preguntas normales afectan por igual al Local y al Líder', () => {
  const result = domain.calculateDualScore([
    { questionId: 'normal', points: 5, isScored: true, dualCompliance: false, value: 'cumple' },
    { questionId: 'normal-fail', points: 5, isScored: true, dualCompliance: false, value: 'no_cumple' },
  ]);
  assert.equal(result.localGrade, 5);
  assert.equal(result.leaderGrade, 5);
});

test('preguntas duales separan completamente ambas calificaciones', () => {
  const result = domain.calculateDualScore([
    { questionId: 'base', points: 5, isScored: true, dualCompliance: false, value: 'cumple' },
    {
      questionId: 'dual',
      points: 5,
      isScored: true,
      dualCompliance: true,
      value: 'cumple',
      localCompliance: 'cumple',
      leaderCompliance: 'no_cumple',
    },
  ]);
  assert.equal(result.localGrade, 10);
  assert.equal(result.leaderGrade, 5);
});

test('la respuesta histórica se interpreta como Local y Líder queda sin puntos en una dual', () => {
  const result = domain.calculateDualScore([
    {
      questionId: 'historical-dual',
      points: 10,
      isScored: true,
      dualCompliance: true,
      value: 'cumple',
      localCompliance: null,
      leaderCompliance: null,
    },
  ]);
  assert.equal(result.localGrade, 10);
  assert.equal(result.leaderGrade, 0);
});

test('ignora preguntas no calificables y conserva escala 0 a 10', () => {
  const result = domain.calculateDualScore([
    { questionId: 'ignored', points: 500, isScored: false, dualCompliance: false, value: 'no_cumple' },
    { questionId: 'scored', points: 2.5, isScored: true, dualCompliance: false, value: 'cumple' },
  ]);
  assert.deepEqual(result, {
    localObtained: 2.5,
    leaderObtained: 2.5,
    possible: 2.5,
    localGrade: 10,
    leaderGrade: 10,
  });
});

test('valida una línea completa de baja con cantidad decimal', () => {
  assert.equal(domain.validateProductWriteoffRow({
    id: 'row-1',
    lotDate: '2026-07-01',
    writeoffDate: '2026-07-23',
    description: 'Materia prima de prueba',
    quantity: '1,50',
    responsibleId: 'responsible-1',
    responsibleCode: 'L001',
    responsibleName: 'Responsable',
  }), null);
});

test('rechaza cantidad cero y responsables ausentes en bajas', () => {
  assert.match(domain.validateProductWriteoffRow({
    id: 'row-1',
    lotDate: '2026-07-01',
    writeoffDate: '2026-07-23',
    description: 'Producto',
    quantity: '0',
    responsibleId: 'responsible-1',
    responsibleCode: 'L001',
    responsibleName: 'Responsable',
  }), /mayor que cero/);
});

test('valida moneda decimal y responsable en declaración de depósito', () => {
  assert.equal(domain.validateDepositDeclarationRow({
    id: 'row-2',
    date: '2026-07-23',
    notebookAmount: '125,75',
    systemAmount: '125.75',
    responsibleId: 'responsible-2',
    responsibleCode: 'L002',
    responsibleName: 'Responsable',
  }), null);
});
