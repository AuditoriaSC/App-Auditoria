export type ComplianceValue = 'cumple' | 'no_cumple' | null;

export type ScoredComplianceAnswer = {
  questionId: string;
  points: number;
  isScored: boolean;
  dualCompliance: boolean;
  value: ComplianceValue;
  localCompliance?: ComplianceValue;
  leaderCompliance?: ComplianceValue;
};

export type DualScore = {
  localObtained: number;
  leaderObtained: number;
  possible: number;
  localGrade: number;
  leaderGrade: number;
};

export type ProductWriteoffRow = {
  id: string;
  lotDate: string;
  writeoffDate: string;
  description: string;
  quantity: string;
  responsibleId: string;
  responsibleCode: string;
  responsibleName: string;
};

export type DepositDeclarationRow = {
  id: string;
  date: string;
  notebookAmount: string;
  systemAmount: string;
  responsibleId: string;
  responsibleCode: string;
  responsibleName: string;
};

export function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateDualScore(answers: ScoredComplianceAnswer[]): DualScore {
  const result = answers.reduce(
    (total, answer) => {
      if (!answer.isScored) return total;
      const points = Number(answer.points || 0);
      const local = answer.dualCompliance ? answer.localCompliance ?? answer.value : answer.value;
      const leader = answer.dualCompliance ? answer.leaderCompliance : answer.value;

      total.possible += points;
      if (local === 'cumple') total.localObtained += points;
      if (leader === 'cumple') total.leaderObtained += points;
      return total;
    },
    { localObtained: 0, leaderObtained: 0, possible: 0 },
  );

  return {
    ...result,
    localGrade: result.possible > 0 ? roundToTwo((result.localObtained / result.possible) * 10) : 0,
    leaderGrade: result.possible > 0 ? roundToTwo((result.leaderObtained / result.possible) * 10) : 0,
  };
}

function validPositiveNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return value.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;
}

function validMoney(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return value.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0;
}

export function validateProductWriteoffRow(row: ProductWriteoffRow) {
  if (!row.lotDate || !row.writeoffDate) return 'Completa la fecha del lote y la fecha de la baja.';
  if (!row.description.trim()) return 'Completa la descripción del producto.';
  if (row.description.trim().length > 500) return 'La descripción no puede superar 500 caracteres.';
  if (!validPositiveNumber(row.quantity)) return 'La cantidad debe ser mayor que cero.';
  if (!row.responsibleId) return 'Selecciona un responsable.';
  return null;
}

export function validateDepositDeclarationRow(row: DepositDeclarationRow) {
  if (!row.date) return 'Completa la fecha.';
  if (!validMoney(row.notebookAmount) || !validMoney(row.systemAmount)) {
    return 'Registro del cuaderno y declarado en sistema deben ser valores monetarios válidos.';
  }
  if (!row.responsibleId) return 'Selecciona un responsable.';
  return null;
}

export function createStableRowId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
