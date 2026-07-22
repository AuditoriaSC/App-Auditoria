import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { brandColors, brandRadii } from '../../constants/theme';

export type FloatingSelectOption = {
  value: string;
  label: string;
};

type FloatingSelectProps = {
  label: string;
  value: string;
  options: FloatingSelectOption[];
  onChange: (value: string) => void;
  minWidth?: number;
  disabled?: boolean;
};

export function FloatingSelect({ label, value, options, onChange, minWidth = 152, disabled = false }: FloatingSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const hasLabel = label.trim().length > 0;

  return (
    <View style={[styles.wrapper, { minWidth }, open && styles.wrapperOpen, disabled && styles.wrapperDisabled]}>
      {hasLabel ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        activeOpacity={0.86}
        disabled={disabled}
      >
        <Text style={styles.triggerText}>{selected?.label || value}</Text>
        <Text style={styles.chevron}>{open ? '^' : 'v'}</Text>
      </TouchableOpacity>

      {open ? (
        <View style={[styles.menu, { top: hasLabel ? 70 : 46 }]} onPointerLeave={() => setOpen(false)}>
          <ScrollView style={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  activeOpacity={0.86}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexGrow: 1,
    flexShrink: 0,
    position: 'relative',
    zIndex: 40,
  },
  wrapperOpen: {
    zIndex: 10000,
    elevation: 30,
  },
  wrapperDisabled: {
    opacity: 0.68,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: brandColors.textSecondary,
    marginBottom: 6,
  },
  trigger: {
    height: 44,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.md,
    backgroundColor: brandColors.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  triggerDisabled: {
    backgroundColor: brandColors.creamSoft,
  },
  triggerText: {
    color: brandColors.textPrimary,
    fontWeight: '800',
    flex: 1,
  },
  chevron: {
    color: brandColors.greenDark,
    fontWeight: '900',
    fontSize: 16,
  },
  menu: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 70,
    maxHeight: 192,
    backgroundColor: brandColors.white,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.md,
    overflow: 'hidden',
    zIndex: 10000,
    elevation: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  scroll: {
    maxHeight: 192,
  },
  option: {
    minHeight: 42,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: brandColors.border,
  },
  optionActive: {
    backgroundColor: brandColors.greenSoft,
  },
  optionText: {
    color: brandColors.textSecondary,
    fontWeight: '800',
  },
  optionTextActive: {
    color: brandColors.greenDark,
    fontWeight: '900',
  },
});
