import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { brandColors } from '../../../../constants/theme';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { AppNoticeModal } from '../../../components/AppNoticeModal';

export type SignatureInputType = 'drawn' | 'uploaded';

interface SignaturePadProps {
  title: string;
  penColor: string;
  previewUri: string | null;
  previewType?: SignatureInputType | null;
  onOK: (signature: string, type: SignatureInputType) => void;
  onClear: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

export default function SignaturePad({ title, penColor, previewUri, previewType, onOK, onClear, onInteractionStart, onInteractionEnd }: SignaturePadProps) {
  const ref = useRef<SignatureViewRef>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasWebSignature, setHasWebSignature] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState(false);
  const showUploadedPreview = Boolean(previewUri && previewType === 'uploaded');
  const uploadedPreviewUri = showUploadedPreview ? previewUri : null;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 2.5;
      context.strokeStyle = penColor;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [penColor]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleWebPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    event.preventDefault();
    onInteractionStart?.();
    canvas.setPointerCapture(event.pointerId);
    context.strokeStyle = penColor;
    const point = getCanvasPoint(event);
    isDrawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    setHasWebSignature(true);
  };

  const handleWebPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    event.preventDefault();
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopWebDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    isDrawingRef.current = false;
    onInteractionEnd?.();
    const canvas = canvasRef.current;
    if (canvas) {
      onOK(canvas.toDataURL('image/png'), 'drawn');
    }
  };

  const handleClear = () => {
    if (Platform.OS === 'web') {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      setHasWebSignature(false);
      onClear();
      return;
    }

    ref.current?.clearSignature();
    onClear();
  };

  const handleUploadSignature = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionNotice(true);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    const signatureUri = asset.base64 ? `data:${asset.mimeType || 'image/png'};base64,${asset.base64}` : asset.uri;
    onOK(signatureUri, 'uploaded');
  };

  const style = `
    .m-signature-pad--footer { display: none; margin: 0px; }
    body, html { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #ffffff; }
    .m-signature-pad { box-shadow: none; border: 0; width: 100%; height: 100%; }
    .m-signature-pad--body { border: 0; width: 100%; height: 100%; }
    canvas { width: 100% !important; height: 100% !important; touch-action: none; }
  `;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.canvasContainer}>
        {uploadedPreviewUri ? (
          <Image source={{ uri: uploadedPreviewUri }} style={styles.previewImage} resizeMode="contain" />
        ) : Platform.OS === 'web' ? (
          React.createElement('canvas', {
            ref: canvasRef,
            onPointerDown: handleWebPointerDown,
            onPointerMove: handleWebPointerMove,
            onPointerUp: stopWebDrawing,
            onPointerLeave: stopWebDrawing,
            style: {
              width: '100%',
              height: '100%',
              backgroundColor: '#fff',
              cursor: 'crosshair',
              touchAction: 'none',
            },
          })
        ) : (
          <SignatureScreen
            ref={ref}
            onOK={(signature) => onOK(signature, 'drawn')}
            onBegin={onInteractionStart}
            onEnd={() => {
              onInteractionEnd?.();
              ref.current?.readSignature();
            }}
            webStyle={style}
            autoClear={false}
            descriptionText=""
            penColor={penColor}
          />
        )}
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearButtonText}>Limpiar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleUploadSignature}>
          <Text style={styles.secondaryButtonText}>Subir imagen</Text>
        </TouchableOpacity>
      </View>
      <AppNoticeModal
        visible={permissionNotice}
        title="Permiso de galería requerido"
        message="Habilita el acceso a tus imágenes desde la configuración del dispositivo para seleccionar una firma."
        variant="warning"
        onConfirm={() => setPermissionNotice(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', marginBottom: 18 },
  title: { fontSize: 14, fontWeight: '800', color: brandColors.textPrimary, marginBottom: 8 },
  canvasContainer: { width: '100%', height: Platform.OS === 'web' ? 180 : 240, borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: brandColors.white },
  previewImage: { width: '100%', height: '100%', backgroundColor: brandColors.white },
  buttonGroup: { flexDirection: 'row', gap: 8, marginTop: 8 },
  clearButton: { flex: 1, padding: 10, borderWidth: 1, borderColor: brandColors.border, borderRadius: 6, alignItems: 'center', backgroundColor: brandColors.creamSoft },
  clearButtonText: { color: brandColors.inputText, fontSize: 13, fontWeight: '700' },
  secondaryButton: { flex: 1, padding: 10, borderWidth: 1, borderColor: brandColors.greenDark, borderRadius: 6, alignItems: 'center', backgroundColor: brandColors.greenSoft },
  secondaryButtonText: { color: brandColors.greenDark, fontSize: 13, fontWeight: '800' },
});
