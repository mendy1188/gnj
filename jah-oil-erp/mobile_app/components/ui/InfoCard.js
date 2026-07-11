import { StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function InfoCard({ children, style = null }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const createStyles = (palette) => StyleSheet.create({
  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    padding: 20,
    backgroundColor: palette.surfaceElevated,
    borderWidth: 0.6,
    borderColor: palette.border,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: palette.mode === "dark" ? 0.16 : 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 4,
  },
});
