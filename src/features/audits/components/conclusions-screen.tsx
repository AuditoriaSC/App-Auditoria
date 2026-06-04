import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";

import { calculateAuditScore } from "../domain/score";
import type { AuditAnswerDraft, ScoreResult } from "../types";

type ConclusionsScreenProps = {
  answers: AuditAnswerDraft[];
  auditorSignatureReady: boolean;
  responsibleSignatureReady: boolean;
  onCaptureAuditorSignature: () => void;
  onCaptureResponsibleSignature: () => void;
  onFinalize: (payload: {
    generalObservations: string;
    score: ScoreResult;
  }) => void;
};

const statusCopy = {
  approved: "Aprobado",
  warning: "Advertencia",
  failed: "Reprobado",
};

const statusColor = {
  approved: "#17803D",
  warning: "#A16207",
  failed: "#B42318",
};

const statusBackground = {
  approved: "#E7F7EC",
  warning: "#FEF7C3",
  failed: "#FEE4E2",
};

export function ConclusionsScreen({
  answers,
  auditorSignatureReady,
  responsibleSignatureReady,
  onCaptureAuditorSignature,
  onCaptureResponsibleSignature,
  onFinalize,
}: ConclusionsScreenProps) {
  const [generalObservations, setGeneralObservations] = useState("");
  const score = useMemo(() => calculateAuditScore(answers), [answers]);

  const canFinalize =
    score.isComplete && auditorSignatureReady && responsibleSignatureReady;

  const handleFinalize = () => {
    if (!canFinalize) {
      Alert.alert(
        "Auditoría incompleta",
        "Por favor, completa todos los campos requeridos antes de finalizar."
      );
      return;
    }

    // Mostrar resumen antes de finalizar
    const message =
      score.status === "failed"
        ? `⚠️ Esta auditoría ha sido REPROBADA con ${score.compliancePercent}% de cumplimiento.\n\n¿Estás seguro de que deseas guardar y finalizar?`
        : `✓ Auditoría completada con ${score.compliancePercent}% de cumplimiento.\n\n¿Deseas guardar y finalizar?`;

    Alert.alert(
      "Confirmar finalización",
      message,
      [
        {
          text: "Cancelar",
          onPress: () => {},
          style: "cancel",
        },
        {
          text: "Guardar y finalizar",
          onPress: () => {
            onFinalize({ generalObservations, score });
          },
          style: score.status === "failed" ? "destructive" : "default",
        },
      ]
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 20,
        gap: 18,
        backgroundColor: "#F7F8FA",
      }}
    >
      <View
        style={{
          borderRadius: 8,
          padding: 18,
          gap: 8,
          backgroundColor: statusBackground[score.status],
          borderWidth: 1,
          borderColor: statusColor[score.status],
        }}
      >
        <Text selectable style={{ color: statusColor[score.status], fontSize: 15, fontWeight: "700" }}>
          {statusCopy[score.status]}
        </Text>
        <Text selectable style={{ color: "#111827", fontSize: 28, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          Nota: {score.obtainedScore}/{score.maxScore}
        </Text>
        <Text selectable style={{ color: "#374151", fontSize: 17, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
          {score.compliancePercent}% de cumplimiento
        </Text>
      </View>

      {!score.isComplete ? (
        <View style={{ borderRadius: 8, padding: 14, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FDBA74", gap: 4 }}>
          <Text selectable style={{ color: "#9A3412", fontWeight: "700" }}>
            Checklist incompleto
          </Text>
          <Text selectable style={{ color: "#7C2D12" }}>
            Faltan {score.missingAnswerCount} respuesta{score.missingAnswerCount !== 1 ? "s" : ""} obligatoria{score.missingAnswerCount !== 1 ? "s" : ""}.
            {score.missingObservationCount > 0 && (
              <>
                {"\n"}También faltan {score.missingObservationCount} observación{score.missingObservationCount !== 1 ? "es" : ""} en preguntas respondidas.
              </>
            )}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text selectable style={{ color: "#111827", fontSize: 16, fontWeight: "700" }}>
          Observaciones generales
        </Text>
        <TextInput
          value={generalObservations}
          onChangeText={setGeneralObservations}
          multiline
          textAlignVertical="top"
          placeholder="Novedades, recomendaciones o planes de accion inmediatos."
          placeholderTextColor="#6B7280"
          style={{
            minHeight: 150,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#D1D5DB",
            backgroundColor: "#FFFFFF",
            color: "#111827",
            padding: 14,
            fontSize: 15,
          }}
        />
      </View>

      <View style={{ gap: 10 }}>
        <Text selectable style={{ color: "#111827", fontSize: 16, fontWeight: "700" }}>
          Firmas digitales obligatorias
        </Text>
        <SignatureAction title="Firma del auditor" ready={auditorSignatureReady} onPress={onCaptureAuditorSignature} />
        <SignatureAction title="Firma del responsable del local" ready={responsibleSignatureReady} onPress={onCaptureResponsibleSignature} />
      </View>

      <Pressable
        disabled={!canFinalize}
        onPress={handleFinalize}
        style={{
          minHeight: 52,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: canFinalize ? "#1F6FEB" : "#AEB8C6",
        }}
      >
        <Text selectable style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
          Guardar y finalizar auditoria
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SignatureAction({
  title,
  ready,
  onPress,
}: {
  title: string;
  ready: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 8,
        padding: 14,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: ready ? "#17803D" : "#D1D5DB",
        gap: 4,
      }}
    >
      <Text selectable style={{ color: "#111827", fontWeight: "700" }}>
        {title}
      </Text>
      <Text selectable style={{ color: ready ? "#17803D" : "#6B7280" }}>
        {ready ? "Firma capturada" : "Tocar para capturar firma"}
      </Text>
    </Pressable>
  );
}
