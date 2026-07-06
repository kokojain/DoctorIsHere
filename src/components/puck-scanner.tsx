import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { parsePuckQr, type PuckIdentity } from '@/lib/qr';
import { palette } from '@/lib/ui';

/**
 * Full-screen QR scanner for the 2D code printed on a puck.
 * Rejects codes that aren't DoctorIsHere puck payloads.
 */
export function PuckScanner({
  visible,
  title,
  onScanned,
  onClose,
}: {
  visible: boolean;
  title: string;
  onScanned: (puck: PuckIdentity) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [badCode, setBadCode] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (visible) {
      handledRef.current = false;
      setBadCode(false);
      if (permission && !permission.granted && permission.canAskAgain) {
        requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handledRef.current) return;
              const puck = parsePuckQr(data);
              if (!puck) {
                setBadCode(true);
                return;
              }
              handledRef.current = true;
              onScanned(puck);
            }}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              Camera access is needed to scan the puck’s QR code.
            </Text>
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonLabel}>Allow camera</Text>
            </Pressable>
          </View>
        )}

        {/* Overlay */}
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.frame} />
          <Text style={styles.hint}>
            {badCode
              ? 'That isn’t a DoctorIsHere puck code — look for the QR on the puck.'
              : 'Line up the QR code printed on the puck.'}
          </Text>
        </View>

        <Pressable style={styles.cancel} onPress={onClose} hitSlop={12}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  permissionButton: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionButtonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 32,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  cancel: {
    position: 'absolute',
    bottom: 56,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
