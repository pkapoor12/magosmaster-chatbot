import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Loading AI Models...</Text>
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 18, color: '#333', fontWeight: '600' },
});

export default LoadingScreen;
