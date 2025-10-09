import type { Server} from "miragejs";
import { Response } from "miragejs";
import { KOptions } from "../boot/koptions";

/**
 * Object containing the properties to create a MirageJS server that mocks the
 * Komunitin Notifications API.
 */
export default {
  routes(server: Server) {
    // Devices POST endpoint.
    server.post(
      KOptions.url.notifications + "/subscriptions",
      (schema, request) => {
        return new Response(201, {}, request.requestBody);
      }
    );
  }
}