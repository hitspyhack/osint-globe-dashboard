export function registerServiceWorker() {
  if (typeof window === "undefined" || !navigator.serviceWorker) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      console.log("Service Worker registered:", registration.scope);

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.onstatechange = () => {
          if (installingWorker.state === "installed") {
            if (navigator.serviceWorker.controller) {
              console.log("New content available, please refresh.");
            } else {
              console.log("Content cached for offline use.");
            }
          }
        };
      };
    } catch (error) {
      console.error("Service Worker registration failed:", error);
    }
  });
}
