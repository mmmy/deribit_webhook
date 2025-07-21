import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ApiKeyConfig, AuthResponse } from '../types';
import { ConfigLoader } from '../config';

export class DeribitClient {
  private httpClient: AxiosInstance;
  private configLoader: ConfigLoader;
  
  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.httpClient = axios.create({
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Deribit-Options-Microservice/1.0.0'
      },
    });
  }

  /**
   * Test basic connectivity to Deribit API
   */
  async testConnectivity(testMode: boolean = true): Promise<boolean> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl(testMode);
      console.log(`Testing connectivity to: ${baseUrl}`);
      
      const response = await this.httpClient.get(`${baseUrl}/public/get_time`, {
        timeout: 10000
      });
      
      console.log('Connectivity test successful:', response.data);
      return true;
    } catch (error) {
      console.error('Connectivity test failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Authenticate with Deribit using client credentials
   */
  async authenticate(account: ApiKeyConfig): Promise<AuthResponse | null> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl(account.testMode);
      console.log(`Authenticating with: ${baseUrl}/public/auth`);
      
      const params = {
        grant_type: account.grantType,
        client_id: account.clientId,
        client_secret: account.clientSecret,
      };

      console.log('Auth params:', { ...params, client_secret: '***' });

      const response: AxiosResponse<AuthResponse> = await this.httpClient.get(
        `${baseUrl}/public/auth`,
        { params, timeout: 10000 }
      );

      console.log('Authentication successful:', {
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Auth error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
      } else {
        console.error('Auth error:', error);
      }
      return null;
    }
  }

  /**
   * Get available instruments (options)
   */
  async getInstruments(currency: string = 'BTC', kind: string = 'option'): Promise<any[]> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl(true); // Use test environment
      const response = await this.httpClient.get(`${baseUrl}/public/get_instruments`, {
        params: { currency, kind, expired: false }
      });
      
      return response.data.result || [];
    } catch (error) {
      console.error('Failed to get instruments:', error);
      return [];
    }
  }
}