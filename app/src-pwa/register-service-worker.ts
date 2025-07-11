import { register } from "register-service-worker";
import { Notify } from "quasar";
import { major, minor } from "semver";
import { clearPersistedData } from "src/store/persist";
import { i18n } from "src/boot/i18n";

// This is the version of the currently running application, set in build time from package.json.
const CURRENT_VERSION = process.env.APP_VERSION || "0.0.0";

// The ready(), registered(), cached(), updatefound() and updated()
// events passes a ServiceWorkerRegistration instance in their arguments.
// ServiceWorkerRegistration: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration
register(process.env.SERVICE_WORKER_FILE as string, {
  // The registrationOptions object will be passed as the second argument
  // to ServiceWorkerContainer.register()
  // https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#Parameter

  // registrationOptions: { scope: "./" },

  async ready(/* registration */) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("App is being served from cache by a service worker.");
    }
  },

  registered(/* registration */) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("Service worker has been registered.");
    }
  },

  cached(/* registration */) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("Content has been cached for offline use.");
    }
  },

  updatefound(/* registration */) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("New content is downloading.");
    }
  },

  updated(registration) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("New content is available; please inspect.");
    }
    // A new service worker has been downloaded and is waiting.
    // We need to ask it for its version.
    const worker = registration.waiting;
    if (!worker) {
      return;
    }

    // Create a communication channel to the waiting service worker
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data && event.data.version) {
        const newVersion = event.data.version as string;

        if (process.env.DEV) {
          // eslint-disable-next-line no-console
          console.log(`Update available. Current: ${CURRENT_VERSION}, New: ${newVersion}`);
        }

        // A breaking change is when the major or minor version changes.
        const isBreaking = major(newVersion) > major(CURRENT_VERSION) ||
                           minor(newVersion) > minor(CURRENT_VERSION);

        if (isBreaking) {
          if (process.env.DEV) {
            // eslint-disable-next-line no-console
            console.log("Breaking change detected. Prompting user.");
          }
          Notify.create({
            message: i18n.global.t('appUpdateAvailable'),
            timeout: 0, // persistent
            actions: [
              {
                label: i18n.global.t('update'),
                color: 'white',
                handler: async () => {
                  if (process.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log("User accepted update. Clearing data and activating new service worker.");
                  }
                  
                  // Ensure data is cleared before we proceed.
                  try {
                    await clearPersistedData();
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Failed to clear persisted data:', e);
                    // Optional: notify user that cleanup failed but proceed anyway.
                  }

                  reloadOnControllerChange = true;
                  // Ask the waiting service worker to take control.
                  worker.postMessage({ type: 'SKIP_WAITING' });
                }
              },
              {
                label: i18n.global.t('dismiss'),
                color: 'white',
                handler: () => {}
              }
            ]
          });
        } else {
          if (process.env.DEV) {
            // eslint-disable-next-line no-console
            console.log("Non-breaking change detected. New version will be active on next refresh.");
          }
          // For non-breaking changes, we do nothing. The new service worker
          // will be installed but will wait. It will activate automatically
          // when the user closes all tabs and re-opens the app.
        }
      }
    };

    // Send the message to the waiting service worker, passing the second port
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  },

  offline() {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log(
        "No internet connection found. App is running in offline mode."
      );
    }
  },

  error(err) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("Error during service worker registration:", err);
    }
  }
});

// Listen for the controllerchange event. This fires when the service worker
// controlling the page changes, for example, after a call to skipWaiting().
let reloadOnControllerChange = false;

navigator.serviceWorker.addEventListener('controllerchange', () => {
  // Only reload if the controller change was triggered by our update button.
  if (reloadOnControllerChange) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('Controller changed after user update. Reloading the page.');
    }
    window.location.reload();
  } else {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('Controller changed naturally. No reload needed.');
    }
  }
});

