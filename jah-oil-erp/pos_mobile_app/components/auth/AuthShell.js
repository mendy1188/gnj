import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer = null,
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>

        <View style={styles.formCard}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
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
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: "center",
    gap: 18,
  },
  heroCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: palette.surface,
    borderWidth: 0.6,
    borderColor: palette.border,
  },
  eyebrow: {
    fontSize: 12,
    color: palette.accent,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 10,
    fontWeight: "700",
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    color: palette.text,
    fontWeight: "800",
  },
  description: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: palette.mutedText,
  },
  formCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: palette.formSurface,
    borderWidth: 0.6,
    borderColor: palette.divider,
    gap: 16,
  },
  footer: {
    paddingHorizontal: 8,
  },
});
