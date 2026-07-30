import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  type ICachePlugin,
  type INetworkModule,
  type NetworkRequestOptions,
  type NetworkResponse,
  type TokenCacheContext
} from "@azure/msal-node";
import { requestUrl, type App } from "obsidian";

const AUTHORITY = "https://login.microsoftonline.com/consumers";
const SCOPES = ["Tasks.Read"];
const TOKEN_CACHE_SECRET_ID = "microsoft-todo-importer-token-cache";

export interface DeviceCodePrompt {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
}

export class AuthenticationRequiredError extends Error {
  public constructor(message = "Microsoft-Anmeldung erforderlich.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

/** Routes MSAL requests through Obsidian's desktop HTTP API instead of fetch. */
class ObsidianNetworkClient implements INetworkModule {
  public async sendGetRequestAsync<T>(
    url: string,
    options?: NetworkRequestOptions
  ): Promise<NetworkResponse<T>> {
    return this.sendRequest<T>(url, "GET", options);
  }

  public async sendPostRequestAsync<T>(
    url: string,
    options?: NetworkRequestOptions
  ): Promise<NetworkResponse<T>> {
    return this.sendRequest<T>(url, "POST", options);
  }

  private async sendRequest<T>(
    url: string,
    method: "GET" | "POST",
    options?: NetworkRequestOptions
  ): Promise<NetworkResponse<T>> {
    const response = await requestUrl({
      url,
      method,
      headers: options?.headers,
      body: options?.body,
      throw: false
    });

    return {
      status: response.status,
      headers: response.headers,
      body: JSON.parse(response.text) as T
    };
  }
}

class SecretStorageCachePlugin implements ICachePlugin {
  public constructor(private readonly app: App) {}

  public async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    const serializedCache = this.app.secretStorage.getSecret(TOKEN_CACHE_SECRET_ID);
    if (serializedCache) {
      context.tokenCache.deserialize(serializedCache);
    }
    await Promise.resolve();
  }

  public async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (context.cacheHasChanged) {
      this.app.secretStorage.setSecret(TOKEN_CACHE_SECRET_ID, context.tokenCache.serialize());
    }
    await Promise.resolve();
  }
}

export class MicrosoftAuthService {
  private client: PublicClientApplication | null = null;
  private configuredClientId = "";

  public constructor(
    private readonly app: App,
    private readonly getClientId: () => string
  ) {}

  public resetClient(): void {
    this.client = null;
    this.configuredClientId = "";
  }

  public async getAccount(): Promise<AccountInfo | null> {
    const client = this.getClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    return accounts[0] ?? null;
  }

  public async connect(onPrompt: (prompt: DeviceCodePrompt) => void): Promise<AccountInfo> {
    const result = await this.getClient().acquireTokenByDeviceCode({
      scopes: SCOPES,
      deviceCodeCallback: (response) => {
        onPrompt({
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          message: response.message,
          expiresIn: response.expiresIn
        });
      }
    });

    if (!result?.account) {
      throw new AuthenticationRequiredError("Die Microsoft-Anmeldung wurde nicht abgeschlossen.");
    }
    return result.account;
  }

  public async getAccessToken(): Promise<string> {
    const client = this.getClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    const account = accounts[0];
    if (!account) {
      throw new AuthenticationRequiredError();
    }

    let result: AuthenticationResult;
    try {
      result = await client.acquireTokenSilent({ account, scopes: SCOPES });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "Unbekannter Authentifizierungsfehler";
      throw new AuthenticationRequiredError(`Microsoft-Anmeldung muss erneuert werden: ${detail}`);
    }
    return result.accessToken;
  }

  public async disconnect(): Promise<void> {
    const client = this.client;
    if (client) {
      const tokenCache = client.getTokenCache();
      const accounts = await tokenCache.getAllAccounts();
      await Promise.all(accounts.map((account) => tokenCache.removeAccount(account)));
    }
    this.app.secretStorage.setSecret(TOKEN_CACHE_SECRET_ID, "");
    this.resetClient();
  }

  private getClient(): PublicClientApplication {
    const clientId = this.getClientId().trim();
    if (!clientId) {
      throw new AuthenticationRequiredError("Bitte zuerst eine Microsoft Application-/Client-ID eintragen.");
    }

    if (this.client && this.configuredClientId === clientId) {
      return this.client;
    }

    const configuration: Configuration = {
      auth: {
        clientId,
        authority: AUTHORITY
      },
      cache: {
        cachePlugin: new SecretStorageCachePlugin(this.app)
      },
      system: {
        networkClient: new ObsidianNetworkClient()
      }
    };
    this.client = new PublicClientApplication(configuration);
    this.configuredClientId = clientId;
    return this.client;
  }
}
