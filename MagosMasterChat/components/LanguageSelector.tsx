import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TTSLanguage } from '../hooks/useTTS';

interface LanguageSelectorProps {
  currentLanguage: TTSLanguage;
  onLanguageChange: (language: TTSLanguage) => void;
}

const LANGUAGES: { code: TTSLanguage; label: string; flag: string }[] = [
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'fr-FR', label: 'Français', flag: '🇫🇷' },
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  currentLanguage, 
  onLanguageChange 
}) => {
  return (
    <View style={styles.container}>
      {LANGUAGES.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          style={[
            styles.languageButton,
            currentLanguage === lang.code && styles.languageButtonActive
          ]}
          onPress={() => onLanguageChange(lang.code)}
        >
          <Text style={styles.flag}>{lang.flag}</Text>
          <Text style={[
            styles.label,
            currentLanguage === lang.code && styles.labelActive
          ]}>
            {lang.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 4,
  },
  languageButtonActive: {
    backgroundColor: '#e3f2ff',
    borderColor: '#007aff',
  },
  flag: {
    fontSize: 16,
  },
  label: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  labelActive: {
    color: '#007aff',
    fontWeight: '600',
  },
});

export default LanguageSelector;

