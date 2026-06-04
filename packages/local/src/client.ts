// v2.0.0 - Token-authenticated Roam Local API client

import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import open from "open";
import type {
  RoamResponse,
  RoamApiError,
  GraphType,
  TokenInfoResult,
  TokenInfoResponse,
} from "@roam-research/roam-tools-core";
import {
  EXPECTED_API_VERSION,
  getErrorMessage,
  RoamError,
  ErrorCodes,
  localTodayString,
} from "@roam-research/roam-tools-core";
import type { RoamClientConfig } from "./types.js";

export class RoamClient {
  private graphName: string;
  private graphType: GraphType;
  private token: string;
  private port: number | null = null;

  constructor(config: RoamClientConfig) {
    if (!config.graphName) {
      throw new Error("graphName is required");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(config.graphName)) {
      throw new Error(
        `Invalid graph name "${config.graphName}". Graph names can only contain letters, numbers, hyphens, and underscores.`,
      );
    }
    if (!config.token) {
      throw new Error("token is required");
    }
    this.graphName = config.graphName;
    this.graphType = config.graphType;
    this.token = config.token;
    if (config.port) {
      this.port = config.port;
    }
  }

  private async getPort(): Promise<number> {
    if (this.port) return this.port;

    try {
      const configFile = join(homedir(), ".roam-local-api.json");
      const content = await readFile(configFile, "utf-8");
      const config = JSON.parse(content) as { port: number };
      this.port = config.port;
      return this.port;
    } catch {
      // Default port if file doesn't exist
      return 3333;
    }
  }

  private async openRoamDeepLink(): Promise<void> {
    const deepLink = `roam://#/app/${this.graphName}`;
    await open(deepLink);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isConnectionError(error: unknown): boolean {
    if (error instanceof Error) {
      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed") ||
        error.message.includes("network")
      ) {
        return true;
      }
      // Check error.cause for Node fetch network errors
      if (error.cause && error.cause instanceof Error) {
        const causeCode = (error.cause as NodeJS.ErrnoException).code;
        return (
          causeCode === "ECONNREFUSED" ||
          causeCode === "ECONNRESET" ||
          causeCode === "ENOTFOUND" ||
          causeCode === "ETIMEDOUT"
        );
      }
    }
    return false;
  }

  private isVersionMismatch(response: RoamResponse<unknown>): boolean {
    if (response.success) return false;
    const error = response.error;
    if (typeof error === "object" && error !== null) {
      return (error as RoamApiError).code === "VERSION_MISMATCH";
    }
    return false;
  }

  private handleVersionMismatch(response: RoamResponse<unknown>): never {
    const serverVersion = response.apiVersion ?? "unknown";
    let advice = "Please update Roam or the MCP server so versions match.";

    if (serverVersion !== "unknown") {
      const [serverMajor, serverMinor] = serverVersion.split(".").map(Number);
      const [expectedMajor, expectedMinor] = EXPECTED_API_VERSION.split(".").map(Number);

      if (
        serverMajor > expectedMajor ||
        (serverMajor === expectedMajor && serverMinor > expectedMinor)
      ) {
        advice = "Please update the MCP server.";
      } else {
        advice = "Please update Roam.";
      }
    }

    throw new RoamError(
      `Roam API version mismatch! Roam API: ${serverVersion}, MCP expected: ${EXPECTED_API_VERSION}. ${advice}`,
      ErrorCodes.VERSION_MISMATCH,
    );
  }

  /**
   * Get user-friendly guidance for authentication errors
   */
  private getAuthErrorGuidance(code?: string): string {
    const baseMsg = "Authentication failed. ";

    switch (code) {
      case ErrorCodes.MISSING_TOKEN:
        return (
          baseMsg +
          "No API token provided. Please ensure your ~/.roam-tools.json has a valid token."
        );
      case ErrorCodes.INVALID_TOKEN_FORMAT:
        return (
          baseMsg +
          "The token format is invalid. Tokens should start with 'roam-graph-local-token-'."
        );
      case ErrorCodes.WRONG_GRAPH_TYPE:
        return (
          baseMsg +
          "This token is for a different graph type. Check that 'type' matches in your config."
        );
      case ErrorCodes.TOKEN_NOT_FOUND:
        return (
          baseMsg +
          "The token was not recognized. It may have been revoked. Create a new token in Roam Settings > Graph > Local API Tokens."
        );
      default:
        return (
          baseMsg +
          "Please check your token in ~/.roam-tools.json. Create a token in Roam Settings > Graph > Local API Tokens."
        );
    }
  }

  /**
   * Get user-friendly guidance for permission errors
   */
  private getPermissionErrorGuidance(code?: string, error?: RoamApiError): string {
    switch (code) {
      case ErrorCodes.INSUFFICIENT_SCOPE:
        return (
          `Permission denied. ${error?.message || "This operation requires higher permissions."}\n` +
          "Create a token with the required scope in Roam Settings > Graph > Local API Tokens."
        );
      case ErrorCodes.SCOPE_EXCEEDS_PERMISSION:
        return (
          "The token has more permissions than your user account allows. " +
          "Please check your Roam user permissions for this graph."
        );
      default:
        return error?.message || "Access denied. Please check your permissions.";
    }
  }

  /**
   * Handle API error responses based on HTTP status and error code
   */
  private handleApiError(status: number, response: RoamResponse<unknown>): never {
    const error = typeof response.error === "object" ? response.error : undefined;
    const code = error?.code;
    const message = getErrorMessage(response.error);

    // Version mismatch - fatal
    if (this.isVersionMismatch(response)) {
      this.handleVersionMismatch(response);
    }

    // 401 - Authentication errors
    if (status === 401) {
      throw new RoamError(this.getAuthErrorGuidance(code), code);
    }

    // 403 - Permission errors
    if (status === 403) {
      throw new RoamError(this.getPermissionErrorGuidance(code, error), code);
    }

    // 404 - Unknown action
    if (status === 404) {
      throw new RoamError(`Unknown API action: ${message}`, ErrorCodes.UNKNOWN_ACTION);
    }

    // 500 - Server errors
    if (status >= 500) {
      const hint = message.toLowerCase().includes("promise error")
        ? "\n\nThis can happen if the graph was closed before the request completed, " +
          "especially for encrypted graphs, when closed before the password was entered."
        : "";
      throw new RoamError(`Server error: ${message}${hint}`, ErrorCodes.INTERNAL_ERROR);
    }

    // Other errors
    throw new RoamError(message, code);
  }

  private checkResponse<T>(response: RoamResponse<T>, httpStatus: number): void {
    if (!response.success) {
      this.handleApiError(httpStatus, response);
    }
  }

  /**
   * Query the token info endpoint for current permissions.
   * Best-effort: returns "unknown" on any failure except confirmed revocation.
   */
  async getTokenInfo(): Promise<TokenInfoResult> {
    try {
      const port = await this.getPort();
      const response = await fetch(`http://127.0.0.1:${port}/api/graphs/tokens/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.token,
          graph: this.graphName,
          type: this.graphType,
        }),
      });

      if (response.status === 401) {
        try {
          const data = (await response.json()) as {
            error?: { code?: string } | string;
          };
          const code = typeof data.error === "object" ? data.error?.code : undefined;
          if (code === "TOKEN_NOT_FOUND") {
            return { status: "revoked" };
          }
        } catch {
          // Couldn't parse 401 body
        }
        return { status: "unknown" };
      }

      if (!response.ok) return { status: "unknown" };

      const data = (await response.json()) as TokenInfoResponse;
      if (!data.success) return { status: "unknown" };
      return { status: "active", info: data };
    } catch {
      return { status: "unknown" };
    }
  }

  /**
   * The machine's local calendar date (yyyy-MM-dd). The npx process shares the
   * user's clock with the renderer, so machine-local time is the correct
   * "today" for the local transport. Core uses it to resolve relative
   * dailyNotePage words (today/yesterday/tomorrow).
   */
  getCurrentDate(): string | undefined {
    return localTodayString();
  }

  async call<T = unknown>(action: string, args: unknown[] = []): Promise<RoamResponse<T>> {
    const doRequest = async (): Promise<{
      data: RoamResponse<T>;
      status: number;
    }> => {
      const port = await this.getPort();

      // Build URL with graph name and optional type parameter
      let url = `http://127.0.0.1:${port}/api/${this.graphName}`;
      if (this.graphType === "offline") {
        url += "?type=offline";
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          action,
          args,
          expectedApiVersion: EXPECTED_API_VERSION,
        }),
      });

      const data = (await response.json()) as RoamResponse<T>;
      return { data, status: response.status };
    };

    try {
      const { data, status } = await doRequest();
      this.checkResponse(data, status);
      return data;
    } catch (error) {
      // If connection failed, try opening Roam and retry
      if (this.isConnectionError(error)) {
        // Reset cached port so we re-read from config after Roam starts
        this.port = null;
        try {
          await this.openRoamDeepLink();
        } catch {
          // Best-effort — don't let deep link failure prevent retries
        }

        let delay = 500;
        const maxDelay = 15000;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await this.sleep(delay);
          try {
            const { data, status } = await doRequest();
            this.checkResponse(data, status);
            return data;
          } catch (retryError) {
            if (!this.isConnectionError(retryError)) {
              throw retryError;
            }
          }
          delay = Math.min(delay * 2, maxDelay);
        }
        // All retries exhausted
        throw new RoamError(
          "Could not connect to Roam Desktop after multiple attempts. " +
            "Please restart the Roam desktop app and also this app and then retry again. " +
            "If you continue having issues, please let us know at support@roamresearch.com.",
          ErrorCodes.CONNECTION_FAILED,
        );
      }
      throw error;
    }
  }
}
