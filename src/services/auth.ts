import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ConfigLoader } from '../config';
import { ApiKeyConfig, AuthResponse, AuthToken, DeribitAuthRequestParams, DeribitError } from '../types';

export class DeribitAuth {
  private httpClient: AxiosInstance;
  private configLoader: ConfigLoader;
  private tokens: Map<string, AuthToken> = new Map();

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Authenticate with Deribit API using OAuth 2.0 client credentials flow
   */
  public async authenticate(accountName: string): Promise<AuthToken> {
    const account = this.configLoader.getAccountByName(accountName);
    if (!account) {
      throw new Error(`Account not found: ${accountName}`);
    }

    if (!account.enabled) {
      throw new Error(`Account is disabled: ${accountName}`);
    }

    // Check if we have a valid cached token
    const cachedToken = this.tokens.get(accountName);
    if (cachedToken && this.isTokenValid(cachedToken)) {
      return cachedToken;
    }

    // Get new token from Deribit
    const token = await this.requestNewToken(account);
    this.tokens.set(accountName, token);
    
    return token;
  }

  /**
   * Make HTTP request to Deribit auth endpoint
   * @param url The authentication URL
   * @param params The request parameters containing authentication data
   * @returns The HTTP response containing auth data
   */
  private async makeAuthRequest(url: string, params: DeribitAuthRequestParams): Promise<AxiosResponse<AuthResponse>> {
    return await this.httpClient.get(url, {
      params,
    });
  }

  /**
   * Request a new access token from Deribit
   */
  private async requestNewToken(account: ApiKeyConfig): Promise<AuthToken> {
    const baseUrl = this.configLoader.getApiBaseUrl();
    const url = `${baseUrl}/public/auth`;

    const params: DeribitAuthRequestParams = {
      grant_type: account.grantType,
      client_id: account.clientId,
      client_secret: account.clientSecret,
    };

    // Add scope if specified
    if (account.scope && account.scope.trim()) {
      params.scope = account.scope;
    }

    try {
      const response = await this.makeAuthRequest(url, params);

      if (response.data.result && response.data.result.access_token) {
        const result = response.data.result;
        const expiresAt = Date.now() + (result.expires_in * 1000);

        return {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAt,
          scope: result.scope,
        };
      } else {
        throw new Error('Invalid response: No access token received');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.data) {
          const deribitError = error.response.data as DeribitError;
          if (deribitError.error) {
            throw new Error(`Deribit API Error [${deribitError.error.code}]: ${deribitError.error.message}`);
          }
        }
        throw new Error(`HTTP Error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Refresh an access token using refresh token
   */
  public async refreshToken(accountName: string): Promise<AuthToken> {
    const account = this.configLoader.getAccountByName(accountName);
    if (!account) {
      throw new Error(`Account not found: ${accountName}`);
    }

    const cachedToken = this.tokens.get(accountName);
    if (!cachedToken || !cachedToken.refreshToken) {
      throw new Error('No refresh token available');
    }

    const baseUrl = this.configLoader.getApiBaseUrl();
    const url = `${baseUrl}/public/auth`;

    const params = {
      grant_type: 'refresh_token',
      refresh_token: cachedToken.refreshToken,
    };

    try {
      const response: AxiosResponse<AuthResponse> = await this.httpClient.get(url, {
        params,
      });

      const result = response.data.result;
      const expiresAt = Date.now() + (result.expires_in * 1000);

      const newToken: AuthToken = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt,
        scope: result.scope,
      };

      this.tokens.set(accountName, newToken);
      return newToken;
    } catch (error) {
      // If refresh fails, clear the cached token and re-authenticate
      this.tokens.delete(accountName);
      return this.authenticate(accountName);
    }
  }

  /**
   * Check if a token is valid (not expired)
   */
  private isTokenValid(token: AuthToken): boolean {
    // Add 5 seconds buffer before expiration
    return Date.now() < (token.expiresAt - 5 * 1000);
  }

  /**
   * Get a valid access token for an account
   */
  public async getValidToken(accountName: string): Promise<string> {
    const token = await this.authenticate(accountName);
    
    // If token is about to expire, refresh it
    if (!this.isTokenValid(token)) {
      const refreshedToken = await this.refreshToken(accountName);
      return refreshedToken.accessToken;
    }

    return token.accessToken;
  }

  /**
   * Clear cached token for an account
   */
  public clearToken(accountName: string): void {
    this.tokens.delete(accountName);
  }

  /**
   * Clear all cached tokens
   */
  public clearAllTokens(): void {
    this.tokens.clear();
  }

  /**
   * Get token info for an account
   */
  public getTokenInfo(accountName: string): AuthToken | null {
    return this.tokens.get(accountName) || null;
  }

  /**
   * Test connection with Deribit API
   */
  public async testConnection(accountName?: string): Promise<boolean> {
    try {
      const accounts = accountName 
        ? [this.configLoader.getAccountByName(accountName)].filter(Boolean)
        : this.configLoader.getEnabledAccounts();

      if (accounts.length === 0) {
        throw new Error('No enabled accounts found');
      }

      // Test first enabled account
      const account = accounts[0]!;
      const baseUrl = this.configLoader.getApiBaseUrl();
      
      // Test public endpoint first
      await this.httpClient.get(`${baseUrl}/public/test`);
      
      // Test authentication
      await this.authenticate(account.name);
      
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}