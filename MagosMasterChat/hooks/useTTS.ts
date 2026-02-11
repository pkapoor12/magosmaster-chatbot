import { useState, useRef, useEffect } from 'react';
import Tts from 'react-native-tts';

export type TTSLanguage = 'en-US' | 'zh-CN' | 'zh-TW' | 'fr-FR';

interface UseTTSReturn {
  isTTSEnabled: boolean;
  isSpeaking: boolean;
  currentLanguage: TTSLanguage;
  toggleTTS: () => void;
  stopSpeaking: () => void;
  speakToken: (token: string) => void;
  finishSpeaking: () => void;
  resetBuffer: () => void;
  setLanguage: (language: TTSLanguage) => void;
}

export const useTTS = (): UseTTSReturn => {
  const [isTTSEnabled, setIsTTSEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<TTSLanguage>('en-US');
  
  // Buffers
  const textBufferRef = useRef('');
  const speakingQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    initializeTTS();
    
    return () => {
      try {
        Tts?.removeAllListeners?.('tts-start');
        Tts?.removeAllListeners?.('tts-finish');
        Tts?.removeAllListeners?.('tts-cancel');
        Tts?.stop?.();
      } catch (e) {
        console.log("TTS cleanup warning:", e);
      }
    };
  }, []);

  const initializeTTS = async () => {
    try {
      await Tts.getInitStatus();
      Tts.setDefaultRate(0.5);
      Tts.setDefaultPitch(1.0);
      await setLanguage(currentLanguage);

      // --- LISTENERS ---
      Tts.addEventListener('tts-start', () => setIsSpeaking(true));
      
      // ✅ FIX: Reset processing flag when speech finishes
      Tts.addEventListener('tts-finish', () => {
        setIsSpeaking(false);
        isProcessingRef.current = false; // <--- THIS WAS MISSING!
        processQueue(); // Run the next item in line
      });
      
      Tts.addEventListener('tts-cancel', () => {
        setIsSpeaking(false);
        isProcessingRef.current = false; // Reset on cancel too
      });

    } catch (e) {
      console.warn("TTS Init failed:", e);
    }
  };

  const setLanguage = async (language: TTSLanguage) => {
    try {
      setCurrentLanguage(language);
      await Tts.setDefaultLanguage(language);
      
      const voices = await Tts.voices();
      const availableVoices = voices.filter((v: any) => !v.notInstalled);
      
      // Prefer Male voices for this persona
      const maleVoice = availableVoices.find((v: any) => {
        const name = v.name.toLowerCase();
        return (v.language === language) && 
               (name.includes('male') || name.includes('david') || name.includes('aaron'));
      });

      if (maleVoice) {
        await Tts.setDefaultVoice(maleVoice.id);
      }
    } catch (error) {
      console.warn('Error setting TTS language:', error);
    }
  };

  const processQueue = async () => {
    // If already talking, OR queue is empty, stop.
    if (isProcessingRef.current || speakingQueueRef.current.length === 0) return;

    // Lock the queue
    isProcessingRef.current = true;
    const text = speakingQueueRef.current.shift();
    
    if (text && isTTSEnabled) {
      try {
        await Tts.speak(text);
        // Note: isProcessingRef remains TRUE until 'tts-finish' fires
      } catch (error) {
        console.warn('TTS Speak Error:', error);
        isProcessingRef.current = false; // Unlock if error occurs
        processQueue(); // Try next
      }
    } else {
      isProcessingRef.current = false;
    }
  };

  const speakToken = (token: string) => {
    if (!isTTSEnabled) return;

    textBufferRef.current += token;

    // Check for sentence endings (. ? ! : or newline)
    const sentenceEndings = /[.?!:\n]\s*$/;
    
    if (sentenceEndings.test(textBufferRef.current)) {
      const textToSpeak = textBufferRef.current.trim();
      if (textToSpeak.length > 0) {
        speakingQueueRef.current.push(textToSpeak);
        processQueue();
        textBufferRef.current = '';
      }
    }
  };

  const finishSpeaking = () => {
    // Flush whatever is left in the buffer (incomplete sentences)
    if (textBufferRef.current.trim().length > 0 && isTTSEnabled) {
      speakingQueueRef.current.push(textBufferRef.current.trim());
      processQueue();
      textBufferRef.current = '';
    }
  };

  const resetBuffer = () => {
    textBufferRef.current = '';
    speakingQueueRef.current = [];
    isProcessingRef.current = false;
  };

  const toggleTTS = () => {
    setIsTTSEnabled(prev => {
      const nextState = !prev;
      if (!nextState) stopSpeaking();
      return nextState;
    });
  };

  const stopSpeaking = () => {
    try {
      Tts.stop();
      resetBuffer();
      setIsSpeaking(false);
    } catch (e) {}
  };

  return {
    isTTSEnabled,
    isSpeaking,
    currentLanguage,
    toggleTTS,
    stopSpeaking,
    speakToken,
    finishSpeaking,
    resetBuffer,
    setLanguage,
  };
};