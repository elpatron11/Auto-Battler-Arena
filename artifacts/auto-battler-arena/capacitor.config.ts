import type { CapacitorConfig } from '@capacitor/cli';

// Private device-testing wrapper, NOT the Play Store release configuration.
// server.url is for live reload/prototyping. A release must bundle the web app.
const config: CapacitorConfig = {
  appId: 'com.fantasyworldarenas.prototype',
  appName: 'Fantasy World Arenas Test',
  webDir: 'mobile-www',
  appendUserAgent: ' FantasyWorldArenasAndroidPrototype/1.0',
  server: {
    url: 'https://auto-battler-arena.replit.app',
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#05060c',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
