import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../theme/ThemeProvider";

export default function SectionHeader({ title, description }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const createStyles = (palette) => StyleSheet.create({
  wrap: {
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.text,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.mutedText,
  },
});
