import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hitspyhack.osintglobe",
  appName: "OSINT Globe",
  webDir: "www",
  backgroundColor: "#020617",
  loggingBehavior: "debug",
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#020617",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      overlaysWebView: true,
    },
  },
};

export default config;
