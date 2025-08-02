import axios, { AxiosResponse } from 'axios';

/**
 * 企业微信机器人消息类型
 */
export enum WeChatMessageType {
  TEXT = 'text',
  MARKDOWN = 'markdown',
  IMAGE = 'image',
  NEWS = 'news',
  FILE = 'file'
}

/**
 * 文本消息接口
 */
export interface TextMessage {
  msgtype: WeChatMessageType.TEXT;
  text: {
    content: string;
    mentioned_list?: string[];
    mentioned_mobile_list?: string[];
  };
}

/**
 * Markdown消息接口
 */
export interface MarkdownMessage {
  msgtype: WeChatMessageType.MARKDOWN;
  markdown: {
    content: string;
  };
}

/**
 * 图片消息接口
 */
export interface ImageMessage {
  msgtype: WeChatMessageType.IMAGE;
  image: {
    base64: string;
    md5: string;
  };
}

/**
 * 图文消息接口
 */
export interface NewsMessage {
  msgtype: WeChatMessageType.NEWS;
  news: {
    articles: Array<{
      title: string;
      description?: string;
      url: string;
      picurl?: string;
    }>;
  };
}

/**
 * 文件消息接口
 */
export interface FileMessage {
  msgtype: WeChatMessageType.FILE;
  file: {
    media_id: string;
  };
}

/**
 * 企业微信机器人消息联合类型
 */
export type WeChatMessage = TextMessage | MarkdownMessage | ImageMessage | NewsMessage | FileMessage;

/**
 * 企业微信机器人响应接口
 */
export interface WeChatBotResponse {
  errcode: number;
  errmsg: string;
}

/**
 * 企业微信机器人配置接口
 */
export interface WeChatBotConfig {
  webhookUrl: string;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * 企业微信机器人客户端
 */
export class WeChatBot {
  private config: Required<WeChatBotConfig>;

  constructor(config: WeChatBotConfig) {
    this.config = {
      webhookUrl: config.webhookUrl,
      timeout: config.timeout || 10000,
      retryCount: config.retryCount || 3,
      retryDelay: config.retryDelay || 1000
    };
  }

  /**
   * 发送消息到企业微信群
   * @param message 消息内容
   * @returns Promise<WeChatBotResponse>
   */
  async sendMessage(message: WeChatMessage): Promise<WeChatBotResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
      try {
        const response: AxiosResponse<WeChatBotResponse> = await axios.post(
          this.config.webhookUrl,
          message,
          {
            timeout: this.config.timeout,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.errcode === 0) {
          return response.data;
        } else {
          throw new Error(`WeChat Bot API Error: ${response.data.errcode} - ${response.data.errmsg}`);
        }
      } catch (error) {
        lastError = error as Error;
        console.error(`WeChat Bot send attempt ${attempt} failed:`, error);

        if (attempt < this.config.retryCount) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw new Error(`WeChat Bot send failed after ${this.config.retryCount} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * 发送文本消息
   * @param content 文本内容
   * @param mentionedList 要@的用户列表（可选）
   * @param mentionedMobileList 要@的手机号列表（可选）
   * @returns Promise<WeChatBotResponse>
   */
  async sendText(
    content: string,
    mentionedList?: string[],
    mentionedMobileList?: string[]
  ): Promise<WeChatBotResponse> {
    const message: TextMessage = {
      msgtype: WeChatMessageType.TEXT,
      text: {
        content,
        mentioned_list: mentionedList,
        mentioned_mobile_list: mentionedMobileList
      }
    };

    return this.sendMessage(message);
  }

  /**
   * 发送Markdown消息
   * @param content Markdown内容
   * @returns Promise<WeChatBotResponse>
   */
  async sendMarkdown(content: string): Promise<WeChatBotResponse> {
    const message: MarkdownMessage = {
      msgtype: WeChatMessageType.MARKDOWN,
      markdown: {
        content
      }
    };

    return this.sendMessage(message);
  }

  /**
   * 发送图片消息
   * @param base64 图片的base64编码
   * @param md5 图片的md5值
   * @returns Promise<WeChatBotResponse>
   */
  async sendImage(base64: string, md5: string): Promise<WeChatBotResponse> {
    const message: ImageMessage = {
      msgtype: WeChatMessageType.IMAGE,
      image: {
        base64,
        md5
      }
    };

    return this.sendMessage(message);
  }

  /**
   * 发送图文消息
   * @param articles 图文列表
   * @returns Promise<WeChatBotResponse>
   */
  async sendNews(articles: Array<{
    title: string;
    description?: string;
    url: string;
    picurl?: string;
  }>): Promise<WeChatBotResponse> {
    const message: NewsMessage = {
      msgtype: WeChatMessageType.NEWS,
      news: {
        articles
      }
    };

    return this.sendMessage(message);
  }

  /**
   * 发送文件消息
   * @param mediaId 文件的media_id
   * @returns Promise<WeChatBotResponse>
   */
  async sendFile(mediaId: string): Promise<WeChatBotResponse> {
    const message: FileMessage = {
      msgtype: WeChatMessageType.FILE,
      file: {
        media_id: mediaId
      }
    };

    return this.sendMessage(message);
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   * @returns Promise<void>
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取当前机器人实例的配置信息
   * @returns WeChatBotConfig 配置信息
   */
  public getConfig(): Required<WeChatBotConfig> {
    return { ...this.config };
  }

  /**
   * 获取当前机器人实例
   * @returns WeChatBot 当前实例
   */
  public getInstance(): WeChatBot {
    return this;
  }

  /**
   * 验证webhook URL格式
   * @param url webhook URL
   * @returns boolean
   */
  static isValidWebhookUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'qyapi.weixin.qq.com' && urlObj.pathname.includes('/cgi-bin/webhook/send');
    } catch {
      return false;
    }
  }
}

/**
 * 创建企业微信机器人实例的工厂函数
 * @param webhookUrl 企业微信机器人webhook地址
 * @param options 可选配置
 * @returns WeChatBot实例
 */
export function createWeChatBot(webhookUrl: string, options?: Partial<WeChatBotConfig>): WeChatBot {
  if (!WeChatBot.isValidWebhookUrl(webhookUrl)) {
    throw new Error('Invalid WeChat Bot webhook URL');
  }

  return new WeChatBot({
    webhookUrl,
    ...options
  });
}

export default WeChatBot;
