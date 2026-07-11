import { StyleSheet, Text, TextInput, View } from "react-native";

import { useAppTheme, useThemedStyles } from "../../theme/ThemeProvider";

export default function AuthTextInput({ label, ...props }) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.placeholder}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const createStyles = (palette) => StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.label,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    borderRadius: 18,
    borderWidth: 0.8,
    borderColor: palette.inputBorder,
    backgroundColor: palette.formSurface,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontSize: 14,
    color: palette.text,
  },
});
