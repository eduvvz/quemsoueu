import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => {}}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>começar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  button: {
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
