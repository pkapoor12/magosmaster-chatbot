import React, { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/Feather';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import RNFS from 'react-native-fs';
import { initWhisper } from 'whisper.rn';
import AudioRecord from 'react-native-audio-record';
import { useTTS, TTSLanguage } from './hooks/useTTS';

// Import llama.rn with error handling
let initLlama: any;
try {
  const llamaRn = require('llama.rn');
  initLlama = llamaRn.initLlama;
} catch (error) {
  console.error('Failed to import llama.rn:', error);
}

// --- Types ---
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

type AppState = 'checking' | 'downloading' | 'loading_model' | 'ready' | 'error';
type TokenData = { token: string };
type LlamaContext = any;

// --- Configuration ---
// const MODEL_URL = 'https://huggingface.co/chatpdflocal/MobileLLM-GGUF/resolve/main/MobileLLM-1B-Q8_0.gguf?download=true';
// const MODEL_FILENAME = 'MobileLLM-1B-Q8_0.gguf';
const MODEL_URL = 'https://huggingface.co/pujeetk/phi-4-mini-magic-Q4_K_M/resolve/main/phi-4-mini-magic-Q4_K_M.gguf';
const MODEL_FILENAME = 'phi-4-mini-magic-Q4_K_M.gguf';
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;

const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';
const WHISPER_MODEL_PATH = `${RNFS.DocumentDirectoryPath}/ggml-tiny.en.bin`;

// --- UI Components ---
const LoadingScreen = ({ text }: { text: string }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>{text}</Text>
  </View>
);

const ErrorScreen = ({ message, onRetry }: { message: string, onRetry: () => void }) => (
  <View style={styles.loadingContainer}>
    <Text style={styles.errorIcon}>⚠️</Text>
    <Text style={styles.errorText}>{message}</Text>
    <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
      <Text style={styles.retryButtonText}>Retry</Text>
    </TouchableOpacity>
  </View>
);

const MessageBubble = ({ message }: { message: Message }) => {
  const isUser = message.sender === 'user';
  return (
    <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.botMessageRow]}>
      <View style={[styles.messageBubble, isUser ? styles.userMessageBubble : styles.botMessageBubble]}>
        <Text textBreakStrategy="simple" style={isUser ? styles.userMessageText : styles.botMessageText}>
          {message.text}
        </Text>
      </View>
    </View>
  );
};

// --- Main App ---
const App = () => {
  const [appState, setAppState] = useState<AppState>('checking');
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [llamaContext, setLlamaContext] = useState<LlamaContext | null>(null);
  const [whisperContext, setWhisperContext] = useState<any>(null);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const flatListRef = useRef<FlatList<Message>>(null);

  // Hooks
  const { 
    isTTSEnabled, 
    currentLanguage,
    setLanguage,
    toggleTTS, 
    stopSpeaking, 
    speakToken, 
    finishSpeaking, 
    resetBuffer 
  } = useTTS();

  // 1. Initial Setup
  useEffect(() => {
    checkPermissions();
    setupModels();
    AudioRecord.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      wavFile: 'voice_input.wav'
    });
  }, []);

  const checkPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ]);
    }
  };

  const setupModels = async () => {
    try {
      setAppState('checking');
      if (!(await RNFS.exists(WHISPER_MODEL_PATH))) {
        setAppState('downloading');
        setLoadingText('Downloading Whisper...');
        await RNFS.downloadFile({ fromUrl: WHISPER_MODEL_URL, toFile: WHISPER_MODEL_PATH }).promise;
      }
      if (!(await RNFS.exists(MODEL_PATH))) {
        setAppState('downloading');
        setLoadingText('Downloading Chat Model...');
        await RNFS.downloadFile({ fromUrl: MODEL_URL, toFile: MODEL_PATH, background: true }).promise;
      }
      setAppState('loading_model');
    } catch (e: any) {
      setErrorMessage(e.message);
      setAppState('error');
    }
  };

  useEffect(() => {
    if (appState === 'loading_model') loadAI();
  }, [appState]);

  const loadAI = async () => {
    try {
      setLoadingText('Loading AI Engines...');
      const wContext = await initWhisper({ filePath: WHISPER_MODEL_PATH });
      setWhisperContext(wContext);

      const lContext = await initLlama({
        model: MODEL_PATH,
        use_mlock: false,
        n_ctx: 1024,
        n_gpu_layers: 99,
        n_threads: 4,
      });
      setLlamaContext(lContext);
      setAppState('ready');
    } catch (e: any) {
      setErrorMessage(e.message);
      setAppState('error');
    }
  };

  const toggleListening = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        const audioFile = await AudioRecord.stop();
        if (whisperContext) {
          const { result } = await whisperContext.transcribe(audioFile, { language: 'en' });
          if (result) setInput(prev => (prev + " " + result).trim());
        }
      } catch (e) {}
    } else {
      setIsRecording(true);
      AudioRecord.start();
    }
  };

  // 4. Handle Send & Stop
  const handleSend = async () => {
    if (input.trim().length === 0 || !llamaContext) return;

    if (isRecording) {
      setIsRecording(false);
      await AudioRecord.stop();
    }

    stopSpeaking();
    resetBuffer();

    const userText = input.trim();
    const userMessage: Message = { id: `user-${Date.now()}`, text: userText, sender: 'user' };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    const prompt = `<|user|>\n${userText}<|end|>\n<|assistant|>\n`;

    try {
      const botId = `bot-${Date.now()}`;
      setMessages(prev => [...prev, { id: botId, text: '', sender: 'bot' }]);

      await llamaContext.completion(
        {
          prompt,
          n_predict: 512,
          stop: ['<|end|>', '<|user|>'],
        },
        (data: TokenData) => {
          speakToken(data.token);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === botId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], text: updated[idx].text + data.token };
            return updated;
          });
        }
      );
      finishSpeaking();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStop = async () => {
    if (llamaContext) {
      // 1. Stop Llama generation
      await llamaContext.stopCompletion();
      // 2. Stop TTS speaking
      stopSpeaking();
      setIsGenerating(false);
    }
  };

  if (appState !== 'ready') {
    if (appState === 'error') return <ErrorScreen message={errorMessage} onRetry={setupModels} />;
    return <LoadingScreen text={loadingText} />;
  }

  // Language Button Helper
  const LangBtn = ({ lang, label }: { lang: TTSLanguage, label: string }) => (
    <TouchableOpacity 
      style={[styles.langButton, currentLanguage === lang && styles.langButtonActive]} 
      onPress={() => setLanguage(lang)}
    >
      <Text style={[styles.langText, currentLanguage === lang && styles.langTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Magos AI</Text>
          <TouchableOpacity onPress={toggleTTS} style={styles.iconButton}>
            <Icon name={isTTSEnabled ? "volume-2" : "volume-x"} size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Language Selector Row */}
        <View style={styles.langContainer}>
          <LangBtn lang="en-US" label="🇺🇸 EN" />
          <LangBtn lang="fr-FR" label="🇫🇷 FR" />
          <LangBtn lang="zh-CN" label="🇨🇳 CN" />
          <LangBtn lang="zh-TW" label="🇹🇼 TW" />
        </View>

        {/* Chat List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={({ item }) => <MessageBubble message={item} />}
          keyExtractor={item => item.id}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContentContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TouchableOpacity 
            style={[styles.micButton, isRecording && styles.micButtonActive]} 
            onPress={toggleListening}
            disabled={isGenerating}
          >
            <Icon name={isRecording ? "square" : "mic"} size={24} color={isRecording ? "#ff3b30" : "#333"} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? "Listening..." : "Ask anything..."}
            placeholderTextColor="#999"
            editable={!isGenerating}
            multiline
          />
          
          {/* TOGGLE: Send Button OR Stop Button */}
          {isGenerating ? (
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Icon name="square" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.sendButton, (!input.trim() && !isRecording) && styles.sendButtonDisabled]} 
              onPress={handleSend}
              disabled={!input.trim()}
            >
              <Icon name="send" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#eee', backgroundColor: '#f9f9f9' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  iconButton: { padding: 8 },
  
  // Language Styles
  langContainer: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
  langButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, marginHorizontal: 4, backgroundColor: '#f0f0f0' },
  langButtonActive: { backgroundColor: '#007aff' },
  langText: { fontSize: 12, fontWeight: '600', color: '#333' },
  langTextActive: { color: '#fff' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, fontSize: 16, color: '#333' },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 },
  errorIcon: { fontSize: 50, marginBottom: 10 },
  retryButton: { backgroundColor: '#007aff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  retryButtonText: { color: '#fff', fontWeight: 'bold' },

  chatArea: { flex: 1 },
  chatContentContainer: { padding: 15 },
  
  messageRow: { flexDirection: 'row', marginVertical: 5 },
  userMessageRow: { justifyContent: 'flex-end' },
  botMessageRow: { justifyContent: 'flex-start' },
  messageBubble: { 
    maxWidth: '80%', padding: 12, borderRadius: 15,
    borderWidth: 1, borderColor: 'transparent'
  },
  userMessageBubble: { backgroundColor: '#007aff', borderBottomRightRadius: 2 },
  botMessageBubble: { backgroundColor: '#e5e5ea', borderBottomLeftRadius: 2 },
  userMessageText: { color: '#fff', fontSize: 16, marginBottom: 2 },
  botMessageText: { color: '#000', fontSize: 16, marginBottom: 2 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  input: { 
    flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, 
    minHeight: 40, maxHeight: 100, marginHorizontal: 10, 
    fontSize: 16, textAlignVertical: 'center', paddingVertical: 8 
  },
  micButton: { justifyContent: 'center', alignItems: 'center', height: 40, width: 40 },
  micButtonActive: { backgroundColor: '#ffe0e0', borderRadius: 20 },
  
  sendButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#007aff', borderRadius: 20, height: 40, width: 40 },
  sendButtonDisabled: { backgroundColor: '#c7e0ff' },
  
  stopButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ff3b30', borderRadius: 20, height: 40, width: 40 },
});

export default App;