import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function ScreenShell({
  eyebrow,
  title,
  description,
  children,
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
    paddingBottom: 28,
    gap: 18,
  },
  hero: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: palette.surface,
    borderWidth: 0.6,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: palette.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: palette.text,
  },
  description: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: palette.mutedText,
  },
});
