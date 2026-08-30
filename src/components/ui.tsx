import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { colors, radii } from '@/lib/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function H3({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.h3, style]}>{children}</Text>;
}
export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children} {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}
export function Input(props: React.ComponentProps<typeof TextInput> & { error?: string }) {
  const { error, style, ...rest } = props;
  // Default to right-aligned on Android for Arabic UX; callers can override via textAlign prop
  const textAlign = (rest as { textAlign?: string }).textAlign ?? 'right';
  return (
    <>
      <TextInput
        {...rest}
        textAlign={textAlign as never}
        placeholderTextColor="#9aa7b8"
        style={[styles.input, error ? styles.inputError : null, style as TextStyle]}
        selectionColor={colors.accent}
        underlineColorAndroid="transparent"
        textAlignVertical="center"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );
}
export function Btn({
  title,
  onPress,
  variant = 'main',
  disabled,
  loading,
  icon,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'main' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const bg =
    variant === 'main'
      ? colors.accent
      : variant === 'danger'
      ? colors.danger
      : variant === 'secondary'
      ? '#eef3f8'
      : 'transparent';
  const color = variant === 'main' || variant === 'danger' ? '#fff' : colors.primary;
  const border = variant === 'ghost' || variant === 'secondary' ? 1 : 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      hitSlop={4}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radii.md,
          paddingVertical: 12,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          minHeight: 48,
          minWidth: 48,
          borderWidth: border,
          borderColor: colors.line,
          opacity: disabled ? 0.55 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : icon}
      <Text style={{ color, fontWeight: '800', fontSize: 14, textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}
export function Badge({ text, tone = 'ok' }: { text: string; tone?: 'ok' | 'warn' | 'danger' }) {
  const map = {
    ok: { bg: colors.successBg, fg: colors.accent, bd: '#b9efd9' },
    warn: { bg: colors.warningBg, fg: '#b7791f', bd: '#fbd38d' },
    danger: { bg: colors.errorBg, fg: '#c53030', bd: '#feb2b2' },
  }[tone];
  return (
    <View style={{ backgroundColor: map.bg, borderColor: map.bd, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
      <Text style={{ color: map.fg, fontWeight: '800', fontSize: 12 }}>{text}</Text>
    </View>
  );
}
export function Empty({ icon = '🛒', text }: { icon?: string; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 28 }}>{icon}</Text>
      <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    shadowColor: '#14213d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  h3: { color: colors.primary, fontWeight: '800', fontSize: 16, marginBottom: 12, textAlign: 'right' },
  label: { color: colors.ink, fontWeight: '800', fontSize: 12, marginBottom: 6, textAlign: 'right' },
  input: {
    backgroundColor: '#fbfcfe',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
    color: colors.ink,
    minHeight: 48,
    fontSize: 14,
    textAlign: 'right',
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 4, textAlign: 'right' },
});
