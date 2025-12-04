import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ErrorScreenProps {
  message: string;
  onRetry?: () => void;
}

const ErrorScreen = ({ message, onRetry }: ErrorScreenProps) => (
  <View style={styles.loadingContainer}>
    <Text style={styles.errorIcon}>⚠️</Text>
    <Text style={styles.loadingText}>Error</Text>
    <Text style={styles.errorText}>{message}</Text>
    {onRetry && (
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 18, color: '#333', fontWeight: '600' },
  errorIcon: { fontSize: 64, marginBottom: 15 },
  errorText: { marginTop: 10, fontSize: 14, color: '#ff3b30', textAlign: 'center', paddingHorizontal: 40 },
  retryButton: { marginTop: 20, backgroundColor: '#007aff', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default ErrorScreen;

