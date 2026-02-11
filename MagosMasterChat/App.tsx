import React, { useState, useEffect, useRef } from 'react';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Alert,
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
const MODEL_URL = 'https://huggingface.co/chatpdflocal/MobileLLM-GGUF/resolve/main/MobileLLM-1B-Q8_0.gguf?download=true';
const MODEL_FILENAME = 'MobileLLM-1B-Q8_0.gguf';
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;

const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin';
const WHISPER_MODEL_PATH = `${RNFS.DocumentDirectoryPath}/ggml-small.en.bin`;

// Estimated sizes for progress bar fallback
const EST_WHISPER_SIZE = 466 * 1024 * 1024;
const EST_LLAMA_SIZE = 1100 * 1024 * 1024;

// --- UI Components ---
const LoadingScreen = ({ text }: { text: string }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>{text}</Text>
  </View>
);

const DownloadScreen = ({ progress, text }: { progress: number, text: string }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>{text}</Text> 
    <Text style={styles.loadingText}>{Math.round(progress * 100)}%</Text>
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
    </View>
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
        <View style={styles.textWrapper}>
          <Text 
            style={isUser ? styles.userMessageText : styles.botMessageText}
            numberOfLines={0}
            selectable={true}
          >
            {message.text}
          </Text>
        </View>
      </View>
    </View>
  );
};

// --- Main App ---
const App = () => {
  const insets = useSafeAreaInsets();
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
  
  // Refs for logic
  const stopTranscriptionRef = useRef<(() => void) | null>(null);
  const flatListRef = useRef<FlatList<Message>>(null);
  
  // Audio Queue Refs
  const ttsQueue = useRef<string[]>([]);
  const [isTtsBusy, setIsTtsBusy] = useState(false);

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

  // 2. Audio Queue Worker
  useEffect(() => {
    const processQueue = async () => {
      if (isTtsBusy || ttsQueue.current.length === 0 || !isTTSEnabled) return;

      setIsTtsBusy(true);
      const nextSentence = ttsQueue.current.shift();
      
      if (nextSentence) {
        speakToken(nextSentence);
        // Manual delay: approx 70ms per char + 400ms buffer
        const delay = nextSentence.length * 70 + 400; 
        setTimeout(() => {
          setIsTtsBusy(false);
        }, delay);
      }
    };

    processQueue();
  }, [isTtsBusy, messages, isTTSEnabled]);

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

      // 1. Whisper Download
      if (!(await RNFS.exists(WHISPER_MODEL_PATH))) {
        setAppState('downloading');
        setLoadingText('Downloading Whisper Engine...');
        setDownloadProgress(0);
        console.log('Starting Whisper download from:', WHISPER_MODEL_URL);

        await new Promise<void>((resolve, reject) => {
          RNFS.downloadFile({
            fromUrl: WHISPER_MODEL_URL,
            toFile: WHISPER_MODEL_PATH,
            progressInterval: 250,
            progress: (res) => {
              if (res.contentLength > 0) {
                const percent = res.bytesWritten / res.contentLength;
                console.log(`Whisper: ${res.bytesWritten}/${res.contentLength} = ${Math.round(percent * 100)}%`);
                setDownloadProgress(percent);
              }
            },
            begin: () => {
              console.log('Whisper download started');
            },
            resumable: () => {
              console.log('Whisper download resumable');
            },
          }).promise.then((result) => {
            console.log('Whisper download completed:', result);
            setDownloadProgress(1);
            resolve();
          }).catch(reject);
        });
      }

      // 2. Llama Download
      if (!(await RNFS.exists(MODEL_PATH))) {
        setAppState('downloading');
        setLoadingText('Downloading MobileLLM...');
        setDownloadProgress(0);
        console.log('Starting Llama download from:', MODEL_URL);

        await new Promise<void>((resolve, reject) => {
          RNFS.downloadFile({
            fromUrl: MODEL_URL,
            toFile: MODEL_PATH,
            progressInterval: 250,
            progress: (res) => {
              if (res.contentLength > 0) {
                const percent = res.bytesWritten / res.contentLength;
                console.log(`Llama: ${res.bytesWritten}/${res.contentLength} = ${Math.round(percent * 100)}%`);
                setDownloadProgress(percent);
              }
            },
            begin: () => {
              console.log('Llama download started');
            },
            resumable: () => {
              console.log('Llama download resumable');
            },
          }).promise.then((result) => {
            console.log('Llama download completed:', result);
            setDownloadProgress(1);
            resolve();
          }).catch(reject);
        });
      }

      setAppState('loading_model');
    } catch (e: any) {
      console.error('Setup error:', e);
      setErrorMessage(e.message);
      setAppState('error');
    }
  };

  // Add delay before loading models
  const startModelLoading = async () => {
    console.log('Waiting before model load...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await loadAI();
  };

  const handleClearCache = () => {
    Alert.alert(
      "Reset AI Models?",
      "This will delete your downloaded models and re-download them. Use this to test the progress bar.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset", 
          style: "destructive", 
          onPress: async () => {
            try {
              setAppState('checking');
              await RNFS.unlink(WHISPER_MODEL_PATH).catch(() => {});
              await RNFS.unlink(MODEL_PATH).catch(() => {});
              setupModels();
            } catch (e) {
              console.error("Cache clear failed", e);
            }
          } 
        }
      ]
    );
  };

  useEffect(() => {
    if (appState === 'loading_model') startModelLoading();
  }, [appState]);

  const loadAI = async () => {
    try {
      setLoadingText('Loading Whisper...');
      console.log('Initializing Whisper from:', WHISPER_MODEL_PATH);
      
      try {
        const wContext = await initWhisper({ filePath: WHISPER_MODEL_PATH });
        console.log('Whisper loaded successfully');
        setWhisperContext(wContext);
      } catch (whisperError: any) {
        console.error('Whisper init failed:', whisperError);
        console.error('Whisper error message:', whisperError.message);
        throw new Error(`Whisper initialization failed: ${whisperError.message}`);
      }

      setLoadingText('Loading Llama...');
      console.log('Initializing Llama from:', MODEL_PATH);
      
      try {
        const lContext = await Promise.race([
          initLlama({
            model: MODEL_PATH,
            use_mlock: false, 
            n_ctx: 512,
            n_gpu_layers: 0, 
            n_threads: 2,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Llama init timeout')), 30000))
        ]);
        console.log('Llama loaded successfully');
        setLlamaContext(lContext);
      } catch (llamaError: any) {
        console.error('Llama init failed:', llamaError);
        console.error('Llama error message:', llamaError.message);
        throw new Error(`Llama initialization failed: ${llamaError.message}`);
      }
      
      setAppState('ready');
    } catch (e: any) {
      console.error('AI Init Error:', e);
      console.error('Error stack:', e.stack);
      setErrorMessage(`AI Init Failed: ${e.message}`);
      setAppState('error');
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      if (stopTranscriptionRef.current) {
        await stopTranscriptionRef.current();
        stopTranscriptionRef.current = null;
      }
      setIsListening(false);
    } else {
      if (!whisperContext) return;
      try {
        stopSpeaking();
        setInput('');
        setIsListening(true);

        const { stop, subscribe } = await whisperContext.transcribeRealtime({
          language: 'en',
          max_len: 1, 
          beam_size: 1, 
          audio_ctx: 512, 
        });

        stopTranscriptionRef.current = stop;
        subscribe((evt: any) => {
          if (evt.data) {
            const text = typeof evt.data === 'string' ? evt.data : (evt.data.result || "");
            setInput(text);
          }
        });
      } catch (e) {
        setIsListening(false);
      }
    }
  };

  const handleSend = async () => {
    if (input.trim().length === 0 || !llamaContext || isGenerating) return;

    if (isListening && stopTranscriptionRef.current) {
      await stopTranscriptionRef.current();
      stopTranscriptionRef.current = null;
      setIsListening(false);
    }

    stopSpeaking();
    resetBuffer();
    ttsQueue.current = [];
    setIsTtsBusy(false);

    const userText = input.trim();
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, text: userText, sender: 'user' }]);
    setInput('');
    setIsGenerating(true);

    const botId = `b-${Date.now()}`;
    setMessages(prev => [...prev, { id: botId, text: '', sender: 'bot' }]);

    // Accumulate all text locally, update state less frequently
    let accumulatedText = '';
    let sentenceBuffer = '';

    try {
      const systemPrompt = "You are a helpful magic assistant. Respond funly in 1-2 sentences.";
      const prompt = `System: ${systemPrompt}\n\nUser: ${userText}\n\nAssistant: `;

      await llamaContext.completion(
        {
          prompt,
          n_predict: 256,
          stop: ['\n\nUser:', 'User:', 'System:'],
        },
        (data: TokenData) => {
          const token = data.token || '';
          if (!token) return;
          
          // Accumulate locally
          accumulatedText += token;
          sentenceBuffer += token;

          // Update UI with accumulated text
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === botId);
            if (idx !== -1) {
              const current = prev[idx];
              // Only update if text actually changed
              if (current.text !== accumulatedText) {
                return [
                  ...prev.slice(0, idx),
                  { ...current, text: accumulatedText },
                  ...prev.slice(idx + 1),
                ];
              }
            }
            return prev;
          });

          // Check for sentence completion
          if (/[.!?]/.test(token)) {
            const completed = sentenceBuffer.trim();
            if (completed.length > 0 && !completed.match(/System:|User:|Assistant:/)) {
              ttsQueue.current.push(completed);
            }
            sentenceBuffer = ""; 
          }
        }
      );

      // Handle any remaining text
      const remaining = sentenceBuffer.trim();
      if (remaining.length > 0 && !remaining.includes('<|')) {
        ttsQueue.current.push(remaining);
      }
      
      finishSpeaking();
    } catch (e) {
      console.error('Completion error:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStop = async () => {
    if (llamaContext) {
      await llamaContext.stopCompletion();
      ttsQueue.current = [];
      stopSpeaking();
      setIsGenerating(false);
      setIsTtsBusy(false);
    }
  };

  const LangBtn = ({ lang, label }: { lang: TTSLanguage, label: string }) => (
    <TouchableOpacity 
      style={[styles.langButton, currentLanguage === lang && styles.langButtonActive]} 
      onPress={() => setLanguage(lang)}
    >
      <Text numberOfLines={1} style={[styles.langText, currentLanguage === lang && styles.langTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  if (appState !== 'ready') {
    if (appState === 'downloading') return <DownloadScreen progress={downloadProgress} text={loadingText} />;
    if (appState === 'error') return <ErrorScreen message={errorMessage} onRetry={setupModels} />;
    return <LoadingScreen text={loadingText} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} 
        keyboardVerticalOffset={0}
        style={{flex:1}}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClearCache} style={styles.iconButton}>
            <Icon name="refresh-cw" size={20} color="#666" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MagosMaster AI</Text>
          <TouchableOpacity onPress={toggleTTS} style={styles.iconButton}>
            <Icon name={isTTSEnabled ? "volume-2" : "volume-x"} size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.langContainer}>
          <LangBtn lang="en-US" label="🇺🇸 EN" />
          <LangBtn lang="fr-FR" label="🇫🇷 FR" />
          <LangBtn lang="zh-CN" label="🇨🇳 CN" />
          <LangBtn lang="es-ES" label="🇪🇸 ES" />
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

        <View style={[styles.inputContainer, { paddingBottom: 10 + insets.bottom }]}>
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
  langButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, marginHorizontal: 4, backgroundColor: '#f0f0f0', minWidth: 60 },
  langButtonActive: { backgroundColor: '#007aff' },
  langText: { fontSize: 12, fontWeight: '600', color: '#333', textAlign: 'center' },
  langTextActive: { color: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 16, color: '#333', fontWeight: '600' },
  progressBarContainer: { width: '80%', height: 8, backgroundColor: '#eee', borderRadius: 4, marginTop: 20, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#007aff' },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 },
  errorIcon: { fontSize: 50, marginBottom: 10 },
  retryButton: { backgroundColor: '#007aff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  retryButtonText: { color: '#fff', fontWeight: 'bold' },
  chatArea: { flex: 1 },
  chatContentContainer: { padding: 15 },
  messageRow: { flexDirection: 'row', marginVertical: 5 },
  userMessageRow: { justifyContent: 'flex-end' },
  botMessageRow: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '85%', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 15 },
  textWrapper: { justifyContent: 'center' },
  userMessageBubble: { backgroundColor: '#007aff' },
  botMessageBubble: { backgroundColor: '#e5e5ea' },
  userMessageText: { color: '#fff', fontSize: 15, fontFamily: 'System', textAlignVertical: 'center' },
  botMessageText: { color: '#000', fontSize: 15, fontFamily: 'System', textAlignVertical: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  input: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, minHeight: 40, maxHeight: 100, marginHorizontal: 10, fontSize: 16, paddingVertical: 10 },
  micButton: { justifyContent: 'center', alignItems: 'center', height: 40, width: 40 },
  micButtonActive: { backgroundColor: '#ffe0e0', borderRadius: 20 },
  sendButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#007aff', borderRadius: 20, height: 40, width: 40 },
  sendButtonDisabled: { backgroundColor: '#c7e0ff' },
  stopButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ff3b30', borderRadius: 20, height: 40, width: 40 },
});

export default App;