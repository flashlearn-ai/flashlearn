import type { Card } from "../../../contracts/index.js";

export type StartOptions = {
  host?: string;
  port?: number;
};

/** Commands and orchestration owned by the CLI workstream. */
export interface CliWorkstream {
  initialize(root: string): Promise<void>;
  generate(directory: string): Promise<Card[]>;
  start(root: string, options?: StartOptions): Promise<void>;
}

/** David: fill in these three commands without putting package logic here. */
export class CliService implements CliWorkstream {
  async initialize(_root: string): Promise<void> {
    // TODO(David): initialize storage for the selected project.
  }

  async generate(_directory: string): Promise<Card[]> {
    // TODO(David): connect extraction output to card storage.
    return [];
  }

  async start(_root: string, _options?: StartOptions): Promise<void> {
    // TODO(David): compose services and start the frontend server.
  }
}
