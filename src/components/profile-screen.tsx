import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { palette } from '@/lib/ui';

export function ProfileScreen() {
  const { session, profile, signOut } = useAuth();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
        <Text style={styles.line}>{session?.user.email}</Text>
        <Text style={styles.line}>Role: {profile?.role ?? '—'}</Text>
      </View>
      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, padding: 16, gap: 16 },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  name: { fontSize: 20, fontWeight: '700', color: palette.text },
  line: { fontSize: 14, color: palette.textMuted },
  signOut: {
    borderWidth: 1,
    borderColor: palette.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutLabel: { color: palette.danger, fontSize: 15, fontWeight: '600' },
});
