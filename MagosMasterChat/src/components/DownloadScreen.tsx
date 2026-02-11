import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

interface DownloadScreenProps {
  progress: number;
}

const DownloadScreen = ({ progress }: DownloadScreenProps) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Downloading AI Model...</Text>
    <Text style={styles.loadingText}>{(progress * 100).toFixed(0)}%</Text>
    <Text style={styles.downloadHintText}>This is a one-time download.</Text>
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 18, color: '#333', fontWeight: '600' },
  downloadHintText: { marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
});

export default DownloadScreen;

