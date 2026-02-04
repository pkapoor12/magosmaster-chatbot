import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

interface TTSControlProps {
  isTTSEnabled: boolean;
  isSpeaking: boolean;
  onToggleTTS: () => void;
  onStopSpeaking: () => void;
}

const TTSControl: React.FC<TTSControlProps> = ({ 
  isTTSEnabled, 
  isSpeaking, 
  onToggleTTS,
  onStopSpeaking 
}) => {
  return (
    <View style={styles.container}>
      {isSpeaking && (
        <TouchableOpacity
          style={styles.stopButton}
          onPress={onStopSpeaking}
        >
          <Icon name="volume-x" size={20} color="#ff3b30" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[
          styles.toggleButton,
          isTTSEnabled && styles.toggleButtonActive
        ]}
        onPress={onToggleTTS}
      >
        <Icon 
          name={isTTSEnabled ? "volume-2" : "volume-x"} 
          size={20} 
          color={isTTSEnabled ? "#007aff" : "#999"} 
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleButton: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
    width: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
  },
  toggleButtonActive: {
    backgroundColor: '#e3f2ff',
  },
  stopButton: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
    width: 36,
    borderRadius: 18,
    backgroundColor: '#ffe3e3',
  },
});

export default TTSControl;

