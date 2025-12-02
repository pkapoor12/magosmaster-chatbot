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
  NativeModules,
  PermissionsAndroid, // Needed for Android Permission checks
} from 'react-native';
import RNFS from 'react-native-fs';
import { initWhisper } from 'whisper.rn';
import AudioRecord from 'react-native-audio-record'; // <--- NEW LIGHTWEIGHT LIBRARY
import { Buffer } from 'buffer'; // Often needed for file handling

// Import llama.rn with proper error handling
let initLlama: any;
try {
  const llamaRn = require('llama.rn');
  initLlama = llamaRn.initLlama;
} catch (error) {
  console.error('Failed to import llama.rn:', error);
}

// --- Types & State ---
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

type AppState = 'checking' | 'downloading' | 'loading_model' | 'ready' | 'error';
type TokenData = { token: string };
type LlamaContext = any;

// --- Model URLs ---
// Llama/Phi Model
const MODEL_URL = 'https://huggingface.co/pujeetk/phi-4-mini-magic-Q4_K_M/resolve/main/phi-4-mini-magic-Q4_K_M.gguf';
const MODEL_FILENAME = 'phi-4-mini-magic-Q4_K_M.gguf';
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;

// Whisper Model (Tiny En) - ~75MB
const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';
const WHISPER_MODEL_PATH = `${RNFS.DocumentDirectoryPath}/ggml-tiny.en.bin`;

// --- UI Components ---
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Loading AI Models...</Text>
  </View>
);

const DownloadScreen = ({ progress }: { progress: number }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Downloading AI Model...</Text>
    <Text style={styles.loadingText}>{(progress * 100).toFixed(0)}%</Text>
    <Text style={styles.downloadHintText}>This is a one-time download.</Text>
  </View>
);

const ErrorScreen = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
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
  const [errorMessage, setErrorMessage] = useState('');
  
  const [llamaContext, setLlamaContext] = useState<LlamaContext | null>(null);
  const [whisperContext, setWhisperContext] = useState<any>(null);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const flatListRef = useRef<FlatList<Message>>(null);

  // 1. Initialize Audio Recorder
  useEffect(() => {
    const options = {
      sampleRate: 16000,  // default 44100
      channels: 1,        // 1 or 2, default 1
      bitsPerSample: 16,  // 8 or 16, default 16
      audioSource: 6,     // android only (VOICE_RECOGNITION)
      wavFile: 'test.wav' // default 'audio.wav'
    };
    
    AudioRecord.init(options);
  }, []);

  // 2. Check & Download Models
  useEffect(() => {
    setupModels();
  }, []);

  const setupModels = async () => {
    try {
      setAppState('checking');
      
      // A. Check Whisper Model
      const whisperExists = await RNFS.exists(WHISPER_MODEL_PATH);
      if (!whisperExists) {
        setAppState('downloading');
        console.log("Downloading Whisper...");
        await RNFS.downloadFile({
          fromUrl: WHISPER_MODEL_URL,
          toFile: WHISPER_MODEL_PATH,
          background: true
        }).promise;
      }

      // B. Check Llama Model
      const llamaExists = await RNFS.exists(MODEL_PATH);
      if (!llamaExists) {
        setAppState('downloading');
        console.log("Downloading Llama...");
        await RNFS.downloadFile({
          fromUrl: MODEL_URL,
          toFile: MODEL_PATH,
          background: true,
          progressDivider: 1,
          progress: (res) => {
            setDownloadProgress(res.bytesWritten / res.contentLength);
          },
        }).promise;
      }

      setAppState('loading_model');
    } catch (e: any) {
      setErrorMessage(`Setup failed: ${e.message}`);
      setAppState('error');
    }
  };

  // 3. Initialize AI Contexts
  useEffect(() => {
    if (appState === 'loading_model') {
      initAI();
    }
  }, [appState]);

  const initAI = async () => {
    try {
      // Init Whisper
      console.log("Init Whisper...");
      const wContext = await initWhisper({ filePath: WHISPER_MODEL_PATH });
      setWhisperContext(wContext);

      // Init Llama
      console.log("Init Llama...");
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

  // 4. Recorder Logic
  const checkPerms = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'App needs access to your microphone to hear you.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const toggleListening = async () => {
    if (isRecording) {
      // STOP & TRANSCRIBE
      setIsRecording(false);
      const audioFile = await AudioRecord.stop();
      console.log("Audio saved to:", audioFile);

      if (whisperContext) {
        console.log("Transcribing...");
        const { result } = await whisperContext.transcribe(audioFile, {
          language: 'en',
          max_len: 1, // Force short phrases if needed
        });
        console.log("Transcribed:", result);
        if (result) setInput(prev => prev + " " + result.trim());
      }
    } else {
      // START
      const hasPerm = await checkPerms();
      if (!hasPerm) {
        console.log("No permission");
        return;
      }
      console.log("Starting record...");
      setIsRecording(true);
      AudioRecord.start();
    }
  };

  // 5. Chat Logic
  const handleSend = async () => {
    if (input.trim().length === 0 || !llamaContext || isGenerating) return;
    
    // Stop recording if active
    if (isRecording) {
      setIsRecording(false);
      await AudioRecord.stop();
    }

    const textInput = input.trim(); // Capture input before clearing
    const userMessage: Message = { id: `user-${Date.now()}`, text: textInput, sender: 'user' };
    
    // UI Update: Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    // --- NEW HISTORY LOGIC STARTS HERE ---

    const systemInstruction = "You are a helpful magic assistant. Respond in a couple sentences with a possible follow-up question";

    // 1. Sliding Window: Get only the last 6 messages (3 turns) to save RAM/Tokens
    const recentHistory = messages.slice(-2); 

    // 2. Format History: Convert the array into the string format the model understands
    const historyBlock = recentHistory.map(msg => {
        const role = msg.sender === 'user' ? 'user' : 'assistant';
        return `<|${role}|>\n${msg.text}<|end|>\n`;
    }).join("");

    // 3. Assemble: System + History + Current User Message + Assistant Tag
    const prompt = `<|system|>\n${systemInstruction}<|end|>\n${historyBlock}<|user|>\n${textInput}<|end|>\n<|assistant|>\n`;

    // --- NEW HISTORY LOGIC ENDS HERE ---

    try {
      const botMessageId = `bot-${Date.now()}`;
      setMessages(prev => [...prev, { id: botMessageId, text: '', sender: 'bot' }]);

      await llamaContext.completion(
        {
          prompt: prompt,
          n_predict: 512,
          stop: ['<|end|>', '<|user|>'],
        },
        (data: TokenData) => {
          setMessages(prev => {
            const index = prev.findIndex(msg => msg.id === botMessageId);
            if (index === -1) return prev;
            
            // Create a shallow copy of the array and the object to avoid mutation issues
            const updated = [...prev];
            updated[index] = { 
                ...updated[index], 
                text: updated[index].text + data.token 
            };
            return updated;
          });
        }
      );
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // ... (Keep Styles and Render logic same as before) ...
  
  if (appState === 'checking' || appState === 'loading_model' || appState === 'downloading') return <LoadingScreen />;
  if (appState === 'error') return <ErrorScreen message={errorMessage} onRetry={setupModels} />;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoidingView}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Magos Voice AI</Text>
          <Text style={styles.headerSubtitle}>Local Whisper + Llama</Text>
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
            multiline
            editable={!isGenerating}
          />
          
          <TouchableOpacity
            style={[styles.sendButton, (!llamaContext || input.trim().length === 0) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!llamaContext || input.trim().length === 0}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  keyboardAvoidingView: { flex: 1 },
  header: { paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', backgroundColor: '#f9f9f9' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', padding: 20 },
  loadingText: { marginTop: 15, fontSize: 18, color: '#333', fontWeight: '600' },
  downloadHintText: { marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
  errorIcon: { fontSize: 64, marginBottom: 15 },
  errorText: { marginTop: 10, fontSize: 14, color: '#ff3b30', textAlign: 'center', paddingHorizontal: 40 },
  retryButton: { marginTop: 20, backgroundColor: '#007aff', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  chatArea: { flex: 1, backgroundColor: '#fff' },
  chatContentContainer: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 15, flexGrow: 1 },
  
  messageRow: { flexDirection: 'row', marginVertical: 6 },
  userMessageRow: { justifyContent: 'flex-end' },
  botMessageRow: { justifyContent: 'flex-start' },
  
  messageBubble: { 
    maxWidth: '80%', 
    paddingVertical: 12, 
    paddingHorizontal: 16, 
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  userMessageBubble: { backgroundColor: '#007aff', borderBottomRightRadius: 4 },
  botMessageBubble: { backgroundColor: '#e5e5ea', borderBottomLeftRadius: 4 },
  
  userMessageText: { fontSize: 16, color: '#ffffff', marginBottom: 2 },
  botMessageText: { fontSize: 16, color: '#000000', marginBottom: 2 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0', backgroundColor: '#fff' },
  
  micButton: { justifyContent: 'center', alignItems: 'center', height: 40, width: 40, marginRight: 8 },
  micButtonActive: { backgroundColor: '#ffdddd', borderRadius: 20 },
  
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 16,
    marginRight: 10,
    textAlignVertical: 'center',
    paddingVertical: 8,
    includeFontPadding: false,
  },
  
  sendButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#007aff', borderRadius: 20, height: 40, paddingHorizontal: 24 },
  sendButtonDisabled: { backgroundColor: '#c7e0ff' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default App;