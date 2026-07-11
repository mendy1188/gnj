import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function PosSplashScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.brandLockup}>
        <Text style={styles.brandName}>JAH OIL</Text>
        <Text style={styles.brandProduct}>POS</Text>
      </View>
      <ActivityIndicator size="small" color="#38bdf8" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#020617",
    paddingHorizontal: 24,
  },
  brandLockup: {
    alignItems: "center",
    marginBottom: 24,
  },
  brandName: {
    color: "#f8fafc",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 4,
  },
  brandProduct: {
    marginTop: 8,
    color: "#38bdf8",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 8,
  },
});
