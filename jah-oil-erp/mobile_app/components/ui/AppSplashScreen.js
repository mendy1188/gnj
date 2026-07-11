import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function AppSplashScreen({ palette, message = "Loading your account..." }) {
  const styles = createStyles(palette);

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>JAH</Text>
      </View>
      <Text style={styles.brand}>Client Mobile APP</Text>
      {/* <Text style={styles.title}>Mobile App</Text> */}
      <Text style={styles.subtitle}>Fuel rewards, gifts, and bulk balance</Text>
      <View style={styles.loaderRow}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const createStyles = (palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 28,
      backgroundColor: palette.background,
    },
    badge: {
      height: 72,
      width: 72,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
      backgroundColor: palette.primary,
      shadowColor: palette.primary,
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 10,
      },
      elevation: 8,
    },
    badgeText: {
      fontSize: 32,
      fontWeight: "800",
      color: palette.background,
    },
    brand: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 3.2,
      color: palette.primary,
    },
    title: {
      fontSize: 30,
      fontWeight: "800",
      color: palette.text,
    },
    subtitle: {
      maxWidth: 260,
      textAlign: "center",
      fontSize: 14,
      lineHeight: 21,
      color: palette.mutedText,
    },
    loaderRow: {
      marginTop: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    message: {
      fontSize: 13,
      fontWeight: "600",
      color: palette.mutedText,
    },
  });
