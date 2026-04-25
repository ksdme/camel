import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.camel.re',
  appName: 'camel',
  webDir: 'dist',
  server: {
    url: 'http://192.168.1.6:5173',
    cleartext: true,
    androidScheme: 'http'
  }
};

export default config;