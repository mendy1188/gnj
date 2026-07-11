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
          <View style={styles.heroOrbPrimary} />
          <View style={styles.heroOrbSecondary} />
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
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 16,
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 30,
    padding: 24,
    gap: 10,
    backgroundColor: palette.heroBackground,
    borderWidth: 0.6,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: palette.mode === "dark" ? 0.22 : 0.1,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 6,
  },
  heroOrbPrimary: {
    position: "absolute",
    top: -38,
    right: -18,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: palette.heroOrb,
  },
  heroOrbSecondary: {
    position: "absolute",
    bottom: -52,
    left: -28,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: palette.heroOrbSecondary,
  },
  eyebrow: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.heroEyebrowBackground,
    borderWidth: 0.6,
    borderColor: palette.heroEyebrowBorder,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    color: palette.text,
  },
  description: {
    maxWidth: "92%",
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedText,
  },
});
