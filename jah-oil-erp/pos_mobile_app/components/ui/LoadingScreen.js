import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function LoadingScreen({
  title = "Loading",
  description = "Please wait a moment.",
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={styles.$palette.primary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const createStyles = (palette) => {
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: palette.background,
      gap: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: palette.text,
    },
    description: {
      textAlign: "center",
      fontSize: 13,
      lineHeight: 20,
      color: palette.mutedText,
    },
  });

  return {
    ...styles,
    $palette: palette,
  };
};
