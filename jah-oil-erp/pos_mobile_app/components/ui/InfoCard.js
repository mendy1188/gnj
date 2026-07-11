import { StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function InfoCard({ children, style = null }) {
  const styles = useThemedStyles(createStyles);

  return <View style={[styles.card, style]}>{children}</View>;
}

const createStyles = (palette) => StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 0.6,
    borderColor: palette.border,
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 4,
  },
});
