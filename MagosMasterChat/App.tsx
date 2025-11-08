import React, { useState, useEffect, useRef } from 'react';
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
  NativeEventEmitter,
} from 'react-native';
import RNFS from 'react-native-fs';

// Import llama.rn with proper error handling
let LlamaModule: any;
let initLlama: any;

try {
  const llamaRn = require('llama.rn');
  initLlama = llamaRn.initLlama;
  LlamaModule = NativeModules.RNLlama || NativeModules.LlamaContext;
} catch (error) {
  console.error('Failed to import llama.rn:', error);
}

// --- Type Definitions ---
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

type AppState =
  | 'checking'
  | 'downloading'
  | 'loading_model'
  | 'ready'
  | 'error';

type TokenData = { token: string };
type LlamaContext = any;

// --- Model & Download Configuration ---
const MODEL_URL =
  'https://huggingface.co/pujeetk/phi-4-mini-instruct-Q4_K_M/resolve/main/phi-4-mini-instruct-Q4_K_M.gguf';
const MODEL_FILENAME = 'phi-4-mini-instruct-Q4_K_M.gguf';
const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;

// --- UI Components ---

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Loading Model...</Text>
  </View>
);

const DownloadScreen = ({ progress }: { progress: number }) => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#007aff" />
    <Text style={styles.loadingText}>Downloading AI Model...</Text>
    <Text style={styles.loadingText}>{(progress * 100).toFixed(0)}%</Text>
    <Text style={styles.downloadHintText}>
      This is a one-time download and may take a few minutes.
    </Text>
  </View>
);

const ErrorScreen = ({ 
  message, 
  onRetry 
}: { 
  message: string; 
  onRetry?: () => void;
}) => (
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
    <View
      style={[
        styles.messageRow,
        isUser ? styles.userMessageRow : styles.botMessageRow,
      ]}>
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userMessageBubble : styles.botMessageBubble,
        ]}>
        <Text
          style={isUser ? styles.userMessageText : styles.botMessageText}>
          {message.text}
        </Text>
      </View>
    </View>
  );
};

// --- Main App Component ---

const App = () => {
  const [appState, setAppState] = useState<AppState>('checking');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [llamaContext, setLlamaContext] = useState<LlamaContext | null>(null);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);

  // Effect 1: Check for model file and download if needed.
  useEffect(() => {
    setupModel();
  }, []);

  const setupModel = async () => {
    try {
      setAppState('checking');
      const modelFileExists = await RNFS.exists(MODEL_PATH);

      if (!modelFileExists) {
        setAppState('downloading');
        console.log('Starting model download...');

        const downloadResult = RNFS.downloadFile({
          fromUrl: MODEL_URL,
          toFile: MODEL_PATH,
          background: true,       // Allow continuation in background (iOS specific)
          discretionary: false,   // false = urgent, tries to use more resources immediately
          progressDivider: 1,
          begin: (res) => {
            console.log('Download started, size:', res.contentLength);
          },
          progress: (res) => {
            // Your existing progress logic
            const percentage = (res.bytesWritten / res.contentLength) * 100;
            // Only log every 5% to avoid spamming the console and slowing down the JS thread
            if (percentage % 5 < 1) console.log(`Progress: ${percentage.toFixed(0)}%`);
            setDownloadProgress(res.bytesWritten / res.contentLength);
          },
        });

        await downloadResult.promise;
        console.log('Model downloaded successfully.');
      } else {
        console.log('Model file already exists.');
      }
      
      setAppState('loading_model');
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Failed to setup model:', err);
      setErrorMessage(`Failed to download model: ${err.message}`);
      setAppState('error');
    }
  };

  // Effect 2: Initialize Llama context when app state is 'loading_model'.
  useEffect(() => {
    if (appState === 'loading_model') {
      initializeLlama();
    }
  }, [appState]);

  const initializeLlama = async () => {
    try {
      console.log('Initializing Llama context...');
      const context = await initLlama({
        model: MODEL_PATH,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 99,
      });
      
      console.log('Llama initialized:', context);
      
      setLlamaContext(context);
      setAppState('ready');
      console.log('Llama context initialized. App is ready.');
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Failed to initialize Llama:', err);
      setErrorMessage(`Failed to load model: ${err.message}`);
      setAppState('error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (llamaContext && llamaContext.release) {
        llamaContext.release();
      }
    };
  }, [llamaContext]);

  // Handle sending a message
  const handleSend = async () => {
    if (input.trim().length === 0 || !llamaContext || isGenerating) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: input.trim(),
      sender: 'user',
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    const history = [...messages, userMessage].map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text,
    }));

    const messagesForApi = [
      {
        role: 'system',
        content:
          'You are a helpful, friendly, and knowledgeable AI assistant. Provide clear, accurate, and concise responses.',
      },
      ...history.slice(-10),
    ];

    const botMessage: Message = {
      id: `bot-${Date.now()}`,
      text: '',
      sender: 'bot',
    };
    setMessages(prev => [...prev, botMessage]);

    try {
      await llamaContext.completion(
        {
          messages: messagesForApi,
          n_predict: 1024,
          temperature: 0.7,
          top_p: 0.9,
          stop: ['</s>', '<|end|>', '<|endoftext|>', '<|user|>', 'User:', 'user:'],
        },
        (data: TokenData) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === botMessage.id
                ? { ...msg, text: msg.text + data.token }
                : msg,
            ),
          );
        },
      );
      setIsGenerating(false);
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Chat error:', err);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === botMessage.id
            ? { ...msg, text: `Error: ${err.message}` }
            : msg,
        ),
      );
      setIsGenerating(false);
    }
  };

  const handleStop = () => {
    if (llamaContext && isGenerating && llamaContext.stopCompletion) {
      llamaContext.stopCompletion();
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  if (appState === 'checking') {
    return <LoadingScreen />;
  }
  if (appState === 'downloading') {
    return <DownloadScreen progress={downloadProgress} />;
  }
  if (appState === 'loading_model') {
    return <LoadingScreen />;
  }
  if (appState === 'error') {
    return <ErrorScreen message={errorMessage} onRetry={setupModel} />;
  }

  const renderItem = ({ item }: { item: Message }) => (
    <MessageBubble message={item} />
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        Start a conversation with your local AI assistant
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Phi-4 Mini Chat</Text>
          <Text style={styles.headerSubtitle}>Running locally on your device</Text>
        </View>
        
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContentContainer}
          ListEmptyComponent={ListEmptyComponent}
        />
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything..."
            placeholderTextColor="#999"
            multiline
            maxLength={2000}
            editable={!isGenerating}
          />
          {isGenerating ? (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={handleStop}>
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!llamaContext || input.trim().length === 0) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!llamaContext || input.trim().length === 0}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  downloadHintText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  errorText: {
    marginTop: 10,
    fontSize: 14,
    color: '#ff3b30',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007aff',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chatContentContainer: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 15,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 6,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  botMessageRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  userMessageBubble: {
    backgroundColor: '#007aff',
    borderBottomRightRadius: 4,
  },
  botMessageBubble: {
    backgroundColor: '#e5e5ea',
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    fontSize: 16,
    color: '#ffffff',
    lineHeight: 22,
  },
  botMessageText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    marginRight: 10,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007aff',
    borderRadius: 20,
    height: 40,
    paddingHorizontal: 24,
  },
  sendButtonDisabled: {
    backgroundColor: '#c7e0ff',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ff3b30',
    borderRadius: 20,
    height: 40,
    paddingHorizontal: 24,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;