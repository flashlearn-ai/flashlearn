#!/usr/bin/env node
import { runCli } from "./cli.js";
import { createProductionDependencies } from "./production.js";
import { CliService } from "./workstream.js";
import { confirm, prompt } from "./confirm.js";
import { detectCopilot } from "./copilot.js";

const dependencies = createProductionDependencies();
const service = new CliService(dependencies);
process.exitCode = await runCli(process.argv.slice(2), service, {
  cwd: process.cwd(),
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  confirm,
  prompt,
  detectCopilot,
  endpointConfigured: Boolean(process.env.FLASHLEARN_ENDPOINT_URL?.trim() && process.env.FLASHLEARN_ENDPOINT_MODEL?.trim()),
});
