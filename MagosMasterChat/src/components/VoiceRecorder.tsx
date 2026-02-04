import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import RNFS from 'react-native-fs';
import { initializeWhisper, transcribeAudio } from '../services/WhisperService';

// For audio recording, you'll need to install:
// npm install react-native-audio-recorder-polyfill
// or use a dedicated audio library

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onTranscription }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setRecordingTime(0);
      
      // You'll need to implement actual audio recording here
      // This is a placeholder - use react-native-audio or similar
      Alert.alert('Recording', 'Recording started (placeholder)');
    } catch (error) {
      console.error('Recording error:', error);
      setIsRecording(false);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      setIsProcessing(true);

      // Placeholder - replace with actual audio file path
      const audioPath = `${RNFS.DocumentDirectoryPath}/recording.wav`;

      // Initialize whisper
      await initializeWhisper();

      // Transcribe
      const transcription = await transcribeAudio(audioPath);
      
      onTranscription(transcription);
      Alert.alert('Success', `Transcribed: ${transcription}`);
    } catch (error) {
      console.error('Transcription error:', error);
      Alert.alert('Error', 'Failed to transcribe audio');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          isRecording ? styles.buttonActive : styles.buttonDefault,
          isProcessing && styles.buttonDisabled,
        ]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>Processing...</Text>
          </>
        ) : (
          <Text style={styles.buttonText}>
            {isRecording ? '⏹ Stop & Transcribe' : '🎤 Start Recording'}
          </Text>
        )}
      </TouchableOpacity>

      {isRecording && (
        <Text style={styles.timerText}>{Math.floor(recordingTime)}s</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 160,
  },
  buttonDefault: {
    backgroundColor: '#007AFF',
  },
  buttonActive: {
    backgroundColor: '#FF3B30',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  timerText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});
