import { useState, useRef, useEffect } from 'react';
import Tts from 'react-native-tts';

export type TTSLanguage = 'en-US' | 'zh-CN' | 'zh-HK' | 'fr-FR' | 'es-ES';

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
      console.log('🎤 Initializing TTS...');
      await Tts.getInitStatus();
      console.log('✅ TTS initialized');
      
      Tts.setDefaultRate(0.5);
      Tts.setDefaultPitch(1.0);
      await setLanguage(currentLanguage);

      // --- LISTENERS ---
      Tts.addEventListener('tts-start', () => {
        console.log('🔊 TTS START');
        setIsSpeaking(true);
      });
      
      // ✅ FIX: Reset processing flag BEFORE calling processQueue
      Tts.addEventListener('tts-finish', () => {
        console.log('✅ TTS FINISH - resetting isProcessing');
        setIsSpeaking(false);
        isProcessingRef.current = false; // Reset FIRST
        console.log('🔄 Now calling processQueue for next sentence');
        setTimeout(() => processQueue(), 0); // Defer to next tick
      });
      
      Tts.addEventListener('tts-cancel', () => {
        console.log('❌ TTS CANCEL');
        setIsSpeaking(false);
        isProcessingRef.current = false;
      });

    } catch (e) {
      console.warn("TTS Init failed:", e);
    }
  };

  const setLanguage = async (language: TTSLanguage) => {
    try {
      console.log('🌍 Setting TTS language to:', language);
      setCurrentLanguage(language);
      
      // 1. Set the default language/locale
      await Tts.setDefaultLanguage(language);
      
      const voices = await Tts.voices();
      const availableVoices = voices.filter((v: any) => !v.notInstalled);

      if (availableVoices.length === 0) return;

      // 2. Optimized Selection Logic
      let selectedVoice = availableVoices.find((v: any) => {
        const voiceLang = v.language.toLowerCase().replace('_', '-');
        const targetLang = language.toLowerCase();
        
        // Specifically look for 'zh-hk' or 'yue-hk' to avoid Mandarin 'zh-cn'
        if (targetLang === 'zh-hk') {
          return voiceLang === 'zh-hk' || voiceLang.includes('yue');
        }
        
        return voiceLang === targetLang;
      });

      // 3. Fallback: If no perfect match, find any voice with the specific country code
      if (!selectedVoice) {
        const countryCode = language.split('-')[1]?.toLowerCase(); // e.g., 'hk'
        selectedVoice = availableVoices.find((v: any) => 
          v.language.toLowerCase().includes(countryCode)
        );
      }

      if (selectedVoice) {
        console.log('🎤 Setting Cantonese Voice:', selectedVoice.id);
        await Tts.setDefaultVoice(selectedVoice.id);
      }
    } catch (error) {
      console.warn('Error setting TTS language/voice:', error);
    }
  };

  const processQueue = async () => {
    console.log('🔄 processQueue called - processing:', !isProcessingRef.current, 'queue length:', speakingQueueRef.current.length);
    
    // If already talking, OR queue is empty, stop.
    if (isProcessingRef.current || speakingQueueRef.current.length === 0) {
      console.log('⏭️ Early return - processing:', isProcessingRef.current, 'queue empty:', speakingQueueRef.current.length === 0);
      return;
    }

    // Lock the queue
    isProcessingRef.current = true;
    const text = speakingQueueRef.current.shift();
    console.log('📄 Processing text:', text);
    
    if (text) {
      try {
        console.log('🔊 Calling Tts.speak() with:', text);
        await Tts.speak(text);
        console.log('✅ Tts.speak() returned, waiting for tts-finish event');
      } catch (error) {
        console.warn('❌ TTS Speak Error:', error);
        isProcessingRef.current = false; // Unlock if error occurs
        // Defer processQueue to avoid recursion
        setTimeout(() => processQueue(), 100);
      }
    } else {
      console.log('⚠️ No text to process');
      isProcessingRef.current = false;
    }
  };

  const speakToken = (token: string) => {
    if (!isTTSEnabled) {
      console.log('❌ TTS disabled, skipping:', token);
      return;
    }

    console.log('📝 speakToken called with:', token);
    textBufferRef.current += token;
    console.log('📝 Buffer now:', textBufferRef.current);

   // Check for sentence endings (. ? ! : or newline) including Chinese punctuation (。？！：)
    const sentenceEndings = /[.?!:\n。？！：]\s*$/;
    
    if (sentenceEndings.test(textBufferRef.current)) {
      const textToSpeak = textBufferRef.current.trim();
      console.log('✅ Sentence boundary detected, queuing:', textToSpeak);
      console.log('📊 Queue length before push:', speakingQueueRef.current.length);
      
      if (textToSpeak.length > 0) {
        speakingQueueRef.current.push(textToSpeak);
        console.log('📊 Queue length after push:', speakingQueueRef.current.length);
        console.log('🔄 Current processing state:', isProcessingRef.current);
        
        // Only call processQueue if we're NOT currently processing
        if (!isProcessingRef.current) {
          console.log('✨ Not processing, calling processQueue immediately');
          processQueue();
        } else {
          console.log('⏳ Already processing, will handle next sentence on tts-finish');
        }
        
        textBufferRef.current = '';
      }
    } else {
      console.log('⏳ No sentence boundary yet, buffer:', textBufferRef.current);
    }
  };

  const finishSpeaking = () => {
    console.log('🏁 finishSpeaking called, buffer:', textBufferRef.current);
    // Flush whatever is left in the buffer (incomplete sentences)
    if (textBufferRef.current.trim().length > 0 && isTTSEnabled) {
      console.log('📄 Flushing remaining buffer:', textBufferRef.current.trim());
      speakingQueueRef.current.push(textBufferRef.current.trim());
      processQueue();
      textBufferRef.current = '';
    }
  };

  const resetBuffer = () => {
    console.log('🔄 resetBuffer called');
    textBufferRef.current = '';
    speakingQueueRef.current = [];
    isProcessingRef.current = false;
  };

  const toggleTTS = () => {
    setIsTTSEnabled(prev => {
      const nextState = !prev;
      console.log('🎚️ TTS toggled to:', nextState);
      if (!nextState) stopSpeaking();
      return nextState;
    });
  };

  const stopSpeaking = () => {
    try {
      console.log('🛑 stopSpeaking called');
      Tts.stop();
      resetBuffer();
      setIsSpeaking(false);
    } catch (e) {
      console.error('Error stopping TTS:', e);
    }
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