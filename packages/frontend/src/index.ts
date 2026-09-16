import type { Server } from "node:http";
import { FrontendService, type FrontendServices } from "./workstream.js";

export { FrontendService, MockFrontendServices } from "./workstream.js";
export type { FrontendServices, FrontendWorkstream } from "./workstream.js";

/** Existing CLI entrypoint delegates to the same production service. */
export function createFlashLearnServer(services: FrontendServices): Server {
  return new FrontendService().createServer(services);
}
