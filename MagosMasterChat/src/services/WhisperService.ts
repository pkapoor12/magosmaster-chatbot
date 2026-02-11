import * as Whisper from 'whisper.rn';
import { Platform } from 'react-native';

let whisperContext: any = null;
let isInitializing = false;

export const initializeWhisper = async () => {
  try {
    if (whisperContext) return whisperContext;
    if (isInitializing) return; // Prevent multiple initializations

    isInitializing = true;

    // Path to your model file - using require to import asset
    const modelPath = require('../../assets/models/ggml-tiny.en.bin');

    console.log('Initializing Whisper with model:', modelPath);

    whisperContext = await Whisper.initWhisper({
      filePath: modelPath,
    });

    console.log('Whisper initialized successfully');
    isInitializing = false;
    return whisperContext;
  } catch (error) {
    console.error('Failed to initialize Whisper:', error);
    isInitializing = false;
    throw error;
  }
};

export const transcribeAudio = async (audioPath: string) => {
  try {
    if (!whisperContext) {
      await initializeWhisper();
    }

    console.log('Starting transcription of:', audioPath);
    
    const { promise } = whisperContext.transcribe(audioPath, {
      language: 'en',
    });

    const { result } = await promise;
    console.log('Transcription result:', result);
    
    return result;
  } catch (error) {
    console.error('Transcription failed:', error);
    throw error;
  }
};

export const releaseWhisper = async () => {
  if (whisperContext) {
    await whisperContext.release();
    whisperContext = null;
    console.log('Whisper released');
  }
};