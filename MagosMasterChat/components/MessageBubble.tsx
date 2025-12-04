import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
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

const styles = StyleSheet.create({
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
});

export default MessageBubble;

