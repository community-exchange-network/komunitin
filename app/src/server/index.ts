// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Registry} from "miragejs";
import { Server } from "miragejs";
import { KOptions } from "src/boot/koptions";

import SocialServer from "./SocialServer";
import AuthServer from "./AuthServer";
import UUIDIndetityManager from "./UUIDManager";
import AccountingServer from "./AccountingServer";
import NotificationsServer from "./NotificationsServer";
import type { AnyFactories, AnyModels } from "miragejs/-types";

// Ensure boolean.
const mirageDevEnvironment = process.env.MOCK_ENVIRONMENT == "development";

 
console.debug(`Mocking server responses with MirageJS, mode ${process.env.MOCK_ENVIRONMENT}.`);

const server = new Server({
  timing : mirageDevEnvironment ? 200 : 0,
  //logging: mirageDevEnvironment,
  logging: true,
  environment: process.env.MOCK_ENVIRONMENT,
  serializers: {
    ...SocialServer.serializers,
    ...AccountingServer.serializers
  },
  identityManagers: {
    application: UUIDIndetityManager
  } as any,
  models: {
    ...SocialServer.models,
    ...AccountingServer.models
  },
  factories: {
    ...SocialServer.factories,
    ...AccountingServer.factories
  },
  seeds(server) {
    _createAllData(server)
  },
  routes() {
    if (process.env.MOCK_AUTH == "true") {
      AuthServer.routes(this);
    } else {
      this.passthrough(KOptions.url.auth + "/**");
    }
    if (process.env.MOCK_SOCIAL == "true") {
      SocialServer.routes(this);
    } else {
      this.passthrough(KOptions.url.social + "/**");
    }
    if (process.env.MOCK_ACCOUNTING == "true") {
      AccountingServer.routes(this);
    } else {
      this.passthrough(KOptions.url.accounting + "/**");
    }
    if (process.env.MOCK_NOTIFICATIONS == "true") {
      NotificationsServer.routes(this);
    } else {
      this.passthrough(KOptions.url.notifications + "/**");
    }

    this.passthrough("/service-worker.js");
    this.passthrough("https://firebaseinstallations.googleapis.com/**");
    this.passthrough("https://fcmregistrations.googleapis.com/**");
    // Load the ZXing WASM file from the CDN required for QR scanning.
    this.passthrough("https://fastly.jsdelivr.net/**");

    // Needed because Chrome recognizes that the Mirage Response is not a real response
    // with setting instantiateStreaming to null we fallback to legacy WebAssembly instantiation
    // this works with the Mirage Response, therefore the app can start
    // for more details see: https://github.com/miragejs/miragejs/issues/339
    Object.defineProperty(window.WebAssembly, 'instantiateStreaming', {value: null});
    const oldPassthroughRequests = (this.pretender as any).passthroughRequest.bind(this.pretender);
    (this.pretender as any).passthroughRequest = (verb: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, request: any) => {
      // Needed because responseType is not set correctly in Mirages passthrough
      // for more details see: https://github.com/miragejs/miragejs/issues/1915
      if (verb === 'GET' && path.match(/\.wasm$/)) {
        request.responseType = 'arraybuffer';
      }
      return oldPassthroughRequests(verb, path, request);
    };
  }
});

export default server;

/**
 * To be called from tests that want to load the full dataset.
 */
export function seeds() {
  _createAllData(server);
}

function _createAllData(server: Server<Registry<AnyModels, AnyFactories>>): void {
  SocialServer.seeds(server);
  AccountingServer.seeds(server);
}


