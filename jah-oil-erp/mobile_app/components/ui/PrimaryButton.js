import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function PrimaryButton({
  label,
  onPress,
  helperText = "",
  disabled = false,
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          pressed && !disabled ? styles.buttonPressed : null,
          disabled ? styles.buttonDisabled : null,
        ]}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

const createStyles = (palette) => StyleSheet.create({
  wrap: {
    gap: 8,
  },
  button: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.buttonShadow,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
    borderWidth: 0.8,
    borderColor: palette.primaryBorder,
  },
  buttonPressed: {
    opacity: 0.96,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  label: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: palette.mode === "dark" ? "#f8fafc" : "#ffffff",
  },
  helperText: {
    textAlign: "left",
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedText,
  },
});
