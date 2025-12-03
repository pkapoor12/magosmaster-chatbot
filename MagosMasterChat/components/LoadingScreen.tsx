import React from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Image,
  Text,
} from 'react-native';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      {/* Your Image */}
      {/* Replace require('./path/to/your/image.png') with your actual image path */}
      {/* For demonstration, I'm using a placeholder image from an online source.
          In a real app, you'd typically use a local image:
          <Image source={require('../assets/your-logo.png')} style={styles.logo} />
      */}
      <Image
        source={{ uri: 'https://reactnative.dev/img/tiny_logo.png' }} // Placeholder image
        style={styles.logo}
        accessibilityLabel="App Logo"
      />

      {/* Optional: Add some text below the logo */}
      <Text style={styles.loadingText}>Loading your chat...</Text>

      {/* Activity Spinner */}
      <ActivityIndicator size="large" color="#007aff" style={styles.spinner} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // White background
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 100, // Adjust size as needed
    height: 100, // Adjust size as needed
    marginBottom: 20, // Space between logo and text/spinner
    resizeMode: 'contain', // Ensures the image fits within the bounds
  },
  loadingText: {
    fontSize: 18,
    color: '#333333',
    marginBottom: 30, // Space between text and spinner
  },
  spinner: {
    // Basic styling for the spinner
  },
});

export default LoadingScreen;

