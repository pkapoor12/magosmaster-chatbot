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
  const textBufferRef = useRef('');
  const speakingQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    initializeTTS();
    
    return () => {
      Tts.removeAllListeners('tts-start');
      Tts.removeAllListeners('tts-finish');
      Tts.removeAllListeners('tts-cancel');
      Tts.stop();
    };
  }, []);

  const initializeTTS = async () => {
    // Initialize TTS
    Tts.setDefaultRate(0.5); // Adjust speed (0.5 = normal)
    Tts.setDefaultPitch(1.0);

    // Set initial language and voice
    await setLanguage(currentLanguage);

    // Setup listeners
    Tts.addEventListener('tts-start', () => setIsSpeaking(true));
    Tts.addEventListener('tts-finish', () => {
      setIsSpeaking(false);
      processQueue();
    });
    Tts.addEventListener('tts-cancel', () => setIsSpeaking(false));
  };

  const setLanguage = async (language: TTSLanguage) => {
    try {
      setCurrentLanguage(language);
      Tts.setDefaultLanguage(language);
      
      // Get available voices and select a male voice for the language
      const voices = await Tts.voices();
      console.log(`Setting TTS language to: ${language}`);
      console.log('Total available voices:', voices.length);
      
      // Filter voices for the selected language
      // First try exact match, then fall back to language prefix (for cases where voices don't have region codes)
      const languageVoices = voices.filter((v: any) => {
        const voiceLang = v.language.toLowerCase();
        const targetLang = language.toLowerCase();
        const targetPrefix = targetLang.split('-')[0];
        
        // Exact match (e.g., zh-CN matches zh-CN)
        if (voiceLang === targetLang) return true;
        
        // For Chinese, check if it's specifically CN or TW
        if (targetPrefix === 'zh') {
          // Match zh-CN with zh-cn, cmn-CN, zh-Hans-CN, etc.
          if (targetLang.includes('cn') && voiceLang.includes('cn')) return true;
          // Match zh-TW with zh-tw, cmn-TW, zh-Hant-TW, etc.
          if (targetLang.includes('tw') && voiceLang.includes('tw')) return true;
          // If voice is just "zh" without region, only use it if no specific match found
          return false;
        }
        
        // For other languages, prefix match is fine (e.g., en for en-US, en-GB)
        return voiceLang.startsWith(targetPrefix);
      });
      
      console.log(`Found ${languageVoices.length} voices for ${language}:`, 
        languageVoices.map((v: any) => `${v.name} (${v.language})`));
      
      // Try to find a male voice with broader detection for Android and iOS
      const maleVoice = languageVoices.find((v: any) => {
        const nameL = v.name.toLowerCase();
        const idL = v.id.toLowerCase();
        
        // Check if voice object has quality/gender metadata
        const isMale = v.quality === 'male' || v.gender === 'male';
        
        // iOS male voice names
        const iosMaleNames = ['aaron', 'daniel', 'fred', 'thomas', 'alex'];
        const hasIosMaleName = iosMaleNames.some(name => nameL.includes(name));
        
        // Android male voice indicators (common variant codes for male voices)
        const androidMaleVariants = ['tpd', 'tpc', 'iob', 'iog'];
        const hasAndroidMaleVariant = androidMaleVariants.some(variant => 
          idL.includes(`-${variant}-`) || idL.includes(`-${variant}#`)
        );
        
        // Generic male indicators
        const hasGenericMale = nameL.includes('male') || idL.includes('male');
        
        return isMale || hasIosMaleName || hasAndroidMaleVariant || hasGenericMale;
      });
      
      if (maleVoice) {
        console.log('Selected male voice:', maleVoice.name, '| ID:', maleVoice.id);
        Tts.setDefaultVoice(maleVoice.id);
      } else if (languageVoices.length > 0) {
        // If no male voice found, use the first available voice for that language
        console.log('No male voice found, using:', languageVoices[0].name, '| ID:', languageVoices[0].id);
        Tts.setDefaultVoice(languageVoices[0].id);
      }
    } catch (error) {
      console.error('Error setting TTS language:', error);
    }
  };

  const processQueue = async () => {
    if (isProcessingRef.current || speakingQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    const text = speakingQueueRef.current.shift();
    
    if (text && isTTSEnabled) {
      try {
        await Tts.speak(text);
      } catch (error) {
        console.error('TTS Error:', error);
      }
    }
    
    isProcessingRef.current = false;
    
    // Process next item if available
    if (speakingQueueRef.current.length > 0) {
      processQueue();
    }
  };

  const speakToken = (token: string) => {
    if (!isTTSEnabled) return;

    textBufferRef.current += token;

    // Check for sentence endings or natural pauses
    // Include both Western (.!?;:) and Chinese/CJK punctuation (。！？；：)
    const sentenceEndings = /[.!?;:。！？；：]\s*$/;
    // Include both Western (,) and Chinese/CJK comma (，)
    const commaEndings = /[,，]\s*$/;
    
    // Speak when we hit a sentence ending
    if (sentenceEndings.test(textBufferRef.current)) {
      const textToSpeak = textBufferRef.current.trim();
      if (textToSpeak.length > 0) {
        speakingQueueRef.current.push(textToSpeak);
        processQueue();
        textBufferRef.current = '';
      }
    }
    // Also consider speaking at commas for more natural flow (optional)
    else if (commaEndings.test(textBufferRef.current) && textBufferRef.current.length > 30) {
      const textToSpeak = textBufferRef.current.trim();
      if (textToSpeak.length > 0) {
        speakingQueueRef.current.push(textToSpeak);
        processQueue();
        textBufferRef.current = '';
      }
    }
  };

  const finishSpeaking = () => {
    // Speak any remaining text in buffer
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
    setIsTTSEnabled(prev => !prev);
    if (isTTSEnabled) {
      // Turning off - stop speaking
      Tts.stop();
      resetBuffer();
    }
  };

  const stopSpeaking = () => {
    Tts.stop();
    resetBuffer();
    setIsSpeaking(false);
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

