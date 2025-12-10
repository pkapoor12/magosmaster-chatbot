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

const DownloadScreen = ({ progress }: { progress: number }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Downloading Model...</Text>
    <Text style={styles.loadingText}>{(progress * 100).toFixed(0)}%</Text>
    <Text style={styles.downloadHintText}>This is a one-time download.</Text>
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
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [llamaContext, setLlamaContext] = useState<LlamaContext | null>(null);
  const [whisperContext, setWhisperContext] = useState<any>(null);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Ref to hold the Whisper stop function
  const stopTranscriptionRef = useRef<(() => void) | null>(null);
  
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
      
      // Download Whisper
      if (!(await RNFS.exists(WHISPER_MODEL_PATH))) {
        setAppState('downloading');
        setLoadingText('Downloading Whisper...');
        await RNFS.downloadFile({ fromUrl: WHISPER_MODEL_URL, toFile: WHISPER_MODEL_PATH }).promise;
      }

      // Download Llama
      if (!(await RNFS.exists(MODEL_PATH))) {
        setAppState('downloading');
        setLoadingText('Downloading Phi-4 Mini...');
        await RNFS.downloadFile({
          fromUrl: MODEL_URL,
          toFile: MODEL_PATH,
          background: true,
          discretionary: false,
          progressDivider: 1,
          progress: (res) => {
            setDownloadProgress(res.bytesWritten / res.contentLength);
          },
        }).promise;
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
      setLoadingText('Loading Whisper...');
      const wContext = await initWhisper({ filePath: WHISPER_MODEL_PATH });
      setWhisperContext(wContext);

      setLoadingText('Loading Llama...');
      const lContext = await initLlama({
        model: MODEL_PATH,
        use_mlock: true, 
        n_ctx: 2048,
        n_gpu_layers: 99, 
        n_threads: 4,
      });
      setLlamaContext(lContext);
      setAppState('ready');
    } catch (e: any) {
      setErrorMessage(`AI Init Failed: ${e.message}`);
      setAppState('error');
    }
  };

  // 2. Realtime Transcription Logic
  const toggleListening = async () => {
    if (isListening) {
      // STOP
      if (stopTranscriptionRef.current) {
        await stopTranscriptionRef.current();
        stopTranscriptionRef.current = null;
      }
      setIsListening(false);
    } else {
      // START
      if (!whisperContext) return;
      
      try {
        stopSpeaking(); // Stop TTS if talking
        setInput('');   // Clear previous text
        setIsListening(true);

        const { stop, subscribe } = await whisperContext.transcribeRealtime({
          language: 'en',
          // Optimize for speed:
          max_len: 1, 
          beam_size: 1, 
          audio_ctx: 512, 
        });

        stopTranscriptionRef.current = stop;

        subscribe((evt: any) => {
          const { isCapturing, data, processTime } = evt;
          
          if (isCapturing) console.log('Whisper listening...');
          
          if (data) {
            // FIX: Ensure it is a string. If it's an object, try to find the text.
            const text = typeof data === 'string' 
              ? data 
              : (data.result || data.text || JSON.stringify(data)); // Handle object case
            
            // Only update if we have actual text
            if (typeof text === 'string') {
              setInput(text);
            }
          }
        });

      } catch (e) {
        console.error('Realtime Transcription Error:', e);
        setIsListening(false);
      }
    }
  };

  // 3. Handle Send
  const handleSend = async () => {
    if (input.trim().length === 0 || !llamaContext || isGenerating) return;

    // Stop listening if active
    if (isListening && stopTranscriptionRef.current) {
      await stopTranscriptionRef.current();
      stopTranscriptionRef.current = null;
      setIsListening(false);
    }

    stopSpeaking();
    resetBuffer();

    const userText = input.trim();
    const userMessage: Message = { id: `user-${Date.now()}`, text: userText, sender: 'user' };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    // Define how you want the model to behave
    const systemInstruction = "You are a helpful magic assistant. Respond in 1-2 sentences (generally 10-15 words or less) promptingthe user with a follow up question.";

    // Add the system block BEFORE the user block
    const prompt = `<|system|>\n${systemInstruction}<|end|>\n<|user|>\n${userText}<|end|>\n<|assistant|>\n`;

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
      await llamaContext.stopCompletion();
      stopSpeaking();
      setIsGenerating(false);
    }
  };

  // UI Helper for Language Buttons
  const LangBtn = ({ lang, label }: { lang: TTSLanguage, label: string }) => (
    <TouchableOpacity 
      style={[styles.langButton, currentLanguage === lang && styles.langButtonActive]} 
      onPress={() => setLanguage(lang)}
    >
      <Text style={[styles.langText, currentLanguage === lang && styles.langTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  if (appState !== 'ready') {
    if (appState === 'downloading') return <DownloadScreen progress={downloadProgress} />;
    if (appState === 'error') return <ErrorScreen message={errorMessage} onRetry={setupModels} />;
    return <LoadingScreen text={loadingText} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Magos AI</Text>
          <TouchableOpacity onPress={toggleTTS} style={styles.iconButton}>
            <Icon name={isTTSEnabled ? "volume-2" : "volume-x"} size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.langContainer}>
          <LangBtn lang="en-US" label="🇺🇸 EN" />
          <LangBtn lang="fr-FR" label="🇫🇷 FR" />
          <LangBtn lang="zh-CN" label="🇨🇳 CN" />
          <LangBtn lang="zh-TW" label="🇹🇼 TW" />
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={({ item }) => <MessageBubble message={item} />}
          keyExtractor={item => item.id}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContentContainer}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity 
            style={[styles.micButton, isListening && styles.micButtonActive]} 
            onPress={toggleListening}
            disabled={isGenerating}
          >
            <Icon name={isListening ? "square" : "mic"} size={24} color={isListening ? "#ff3b30" : "#333"} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={isListening ? "Listening..." : "Ask anything..."}
            placeholderTextColor="#999"
            editable={!isGenerating}
            multiline
          />
          
          {isGenerating ? (
            <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
              <Icon name="square" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.sendButton, (!input.trim() && !isListening) && styles.sendButtonDisabled]} 
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
  
  langContainer: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' },
  langButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, marginHorizontal: 4, backgroundColor: '#f0f0f0' },
  langButtonActive: { backgroundColor: '#007aff' },
  langText: { fontSize: 12, fontWeight: '600', color: '#333' },
  langTextActive: { color: '#fff' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 16, color: '#333' },
  downloadHintText: { marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center' },
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
    fontSize: 16, textAlignVertical: 'center', paddingVertical: 8, includeFontPadding: false
  },
  
  micButton: { justifyContent: 'center', alignItems: 'center', height: 40, width: 40 },
  micButtonActive: { backgroundColor: '#ffe0e0', borderRadius: 20 },
  
  sendButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#007aff', borderRadius: 20, height: 40, width: 40 },
  sendButtonDisabled: { backgroundColor: '#c7e0ff' },
  
  stopButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ff3b30', borderRadius: 20, height: 40, width: 40 },
});

export default App;