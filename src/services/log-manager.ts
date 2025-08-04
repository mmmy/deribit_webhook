import fs from 'fs';
import path from 'path';
import readline from 'readline';

/**
 * 日志记录接口
 */
export interface LogRecord {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
}

/**
 * 日志查询参数接口
 */
export interface LogQuery {
  startTime?: string;    // 开始时间 (ISO 8601格式)
  endTime?: string;      // 结束时间 (ISO 8601格式)
  maxRecords?: number;   // 最大记录数，默认200
  level?: string;        // 日志级别过滤
  keyword?: string;      // 关键词搜索
}

/**
 * 日志管理器
 * 负责从日志文件中读取和查询日志记录
 */
export class LogManager {
  private static instance: LogManager;
  private logPaths: string[];

  constructor() {
    // 定义可能的日志文件路径
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    this.logPaths = [
      // 开发环境日志路径
      path.join(process.cwd(), 'logs', 'combined.log'),
      path.join(process.cwd(), 'logs', 'out.log'),
      path.join(process.cwd(), 'logs', 'error.log'),
      // 生产环境日志路径
      path.join(process.cwd(), '..', 'logs', 'combined.log'),
      path.join(process.cwd(), '..', 'logs', 'out.log'),
      path.join(process.cwd(), '..', 'logs', 'error.log'),
      // PM2日志轮转文件路径
      path.join(process.cwd(), '..', 'logs', 'combined-0.log'),
      path.join(process.cwd(), '..', 'logs', 'out-0.log'),
      path.join(process.cwd(), '..', 'logs', 'error-0.log'),
      // PM2日志路径
      path.join(homeDir, 'logs', 'combined.log'),
      path.join(homeDir, 'logs', 'out.log'),
      path.join(homeDir, 'logs', 'error.log'),
    ];
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  /**
   * 扫描目录中的PM2日志轮转文件
   */
  private scanLogRotateFiles(logDir: string): string[] {
    const rotateFiles: string[] = [];

    if (!fs.existsSync(logDir)) {
      return rotateFiles;
    }

    try {
      const files = fs.readdirSync(logDir);

      // 匹配 PM2 日志轮转文件格式: 只要开头是 combined、out 或 error 即可
      // 支持各种格式: combined-0.log, combined-0__2025-08-03_00-00-00.log 等
      const logRotatePattern = /^(combined|out|error)-.*\.log$/;

      files.forEach(file => {
        if (logRotatePattern.test(file)) {
          const fullPath = path.join(logDir, file);
          if (fs.statSync(fullPath).isFile()) {
            rotateFiles.push(fullPath);
          }
        }
      });

      // 按文件修改时间排序，确保最新的文件在前面
      rotateFiles.sort((a, b) => {
        try {
          const aStats = fs.statSync(a);
          const bStats = fs.statSync(b);

          // 按修改时间倒序排列（最新的在前）
          return bStats.mtime.getTime() - aStats.mtime.getTime();
        } catch {
          // 如果获取文件状态失败，按文件名排序
          return a.localeCompare(b);
        }
      });

    } catch (error) {
      console.warn(`⚠️ 扫描日志轮转文件失败: ${logDir}`, error);
    }

    return rotateFiles;
  }

  /**
   * 获取可用的日志文件列表
   */
  public getAvailableLogFiles(): string[] {
    const availableFiles: string[] = [];

    // 1. 检查预定义的日志文件路径
    const staticFiles = this.logPaths.filter(logPath => {
      try {
        return fs.existsSync(logPath) && fs.statSync(logPath).isFile();
      } catch {
        return false;
      }
    });

    availableFiles.push(...staticFiles);

    // 2. 扫描生产环境日志目录中的PM2轮转文件
    const productionLogDir = path.join(process.cwd(), '..', 'logs');
    const rotateFiles = this.scanLogRotateFiles(productionLogDir);
    availableFiles.push(...rotateFiles);

    // 3. 扫描开发环境日志目录中的轮转文件
    const devLogDir = path.join(process.cwd(), 'logs');
    const devRotateFiles = this.scanLogRotateFiles(devLogDir);
    availableFiles.push(...devRotateFiles);

    // 去重
    return [...new Set(availableFiles)];
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string): LogRecord | null {
    if (!line.trim()) {
      return null;
    }

    // 尝试解析不同格式的日志
    // 1. Morgan格式: IP - - [timestamp] "method url" status size "referer" "user-agent"
    const morganMatch = line.match(/^(\S+) - - \[([^\]]+)\] "([^"]*)" (\d+) (\S+) "([^"]*)" "([^"]*)"/);
    if (morganMatch) {
      const [, , timestamp, request, status, size] = morganMatch;
      return {
        timestamp: this.parseMorganTimestamp(timestamp),
        level: parseInt(status) >= 400 ? 'ERROR' : 'INFO',
        message: `${request} - ${status} ${size}`,
        raw: line
      };
    }

    // 2. PM2格式: timestamp level: message
    const pm2Match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}): (.+)/);
    if (pm2Match) {
      const [, timestamp, message] = pm2Match;
      return {
        timestamp: new Date(timestamp).toISOString(),
        level: this.extractLogLevel(message),
        message: message,
        raw: line
      };
    }

    // 3. Console.log格式: 尝试提取时间戳
    const consoleMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (consoleMatch) {
      const timestamp = consoleMatch[1];
      return {
        timestamp: timestamp.includes('T') ? timestamp : new Date(timestamp).toISOString(),
        level: this.extractLogLevel(line),
        message: line.substring(consoleMatch[0].length).trim(),
        raw: line
      };
    }

    // 4. 默认格式：当前时间
    return {
      timestamp: new Date().toISOString(),
      level: this.extractLogLevel(line),
      message: line,
      raw: line
    };
  }

  /**
   * 解析Morgan时间戳格式
   */
  private parseMorganTimestamp(timestamp: string): string {
    // Morgan格式: 25/Dec/2023:10:30:45 +0000
    try {
      const date = new Date(timestamp.replace(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})/,
        (_, day, month, year, hour, min, sec, tz) => {
          const months: { [key: string]: string } = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          return `${year}-${months[month]}-${day}T${hour}:${min}:${sec}${tz.substring(0, 3)}:${tz.substring(3)}`;
        }));
      return date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * 提取日志级别
   */
  private extractLogLevel(message: string): string {
    const upperMessage = message.toUpperCase();
    if (upperMessage.includes('ERROR') || upperMessage.includes('❌')) return 'ERROR';
    if (upperMessage.includes('WARN') || upperMessage.includes('⚠️')) return 'WARN';
    if (upperMessage.includes('INFO') || upperMessage.includes('ℹ️') || upperMessage.includes('✅')) return 'INFO';
    if (upperMessage.includes('DEBUG') || upperMessage.includes('🐛')) return 'DEBUG';
    return 'INFO';
  }

  /**
   * 查询日志记录
   */
  public async queryLogs(query: LogQuery = {}): Promise<LogRecord[]> {
    const {
      startTime,
      endTime,
      maxRecords = 200,
      level,
      keyword
    } = query;

    const availableFiles = this.getAvailableLogFiles();
    if (availableFiles.length === 0) {
      console.warn('⚠️ 未找到可用的日志文件');
      return [];
    }

    const allRecords: LogRecord[] = [];
    const startTimestamp = startTime ? new Date(startTime).getTime() : 0;
    const endTimestamp = endTime ? new Date(endTime).getTime() : Date.now();

    // 读取所有日志文件
    for (const logFile of availableFiles) {
      try {
        const records = await this.readLogFile(logFile, startTimestamp, endTimestamp, level, keyword);
        allRecords.push(...records);
      } catch (error) {
        console.error(`❌ 读取日志文件失败: ${logFile}`, error);
      }
    }

    // 按时间戳排序（最新的在前）
    allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 限制返回数量
    return allRecords.slice(0, maxRecords);
  }

  /**
   * 读取单个日志文件
   */
  private async readLogFile(
    filePath: string,
    startTimestamp: number,
    endTimestamp: number,
    level?: string,
    keyword?: string
  ): Promise<LogRecord[]> {
    const records: LogRecord[] = [];
    
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      const record = this.parseLogLine(line);
      if (!record) continue;

      const recordTimestamp = new Date(record.timestamp).getTime();
      
      // 时间过滤
      if (recordTimestamp < startTimestamp || recordTimestamp > endTimestamp) {
        continue;
      }

      // 级别过滤
      if (level && record.level !== level.toUpperCase()) {
        continue;
      }

      // 关键词过滤
      if (keyword && !record.message.toLowerCase().includes(keyword.toLowerCase())) {
        continue;
      }

      records.push(record);
    }

    return records;
  }

  /**
   * 获取日志统计信息
   */
  public async getLogStats(): Promise<{
    totalFiles: number;
    availableFiles: number;
    fileSizes: { [path: string]: number };
  }> {
    const availableFiles = this.getAvailableLogFiles();
    const fileSizes: { [path: string]: number } = {};

    for (const file of availableFiles) {
      try {
        const stats = fs.statSync(file);
        fileSizes[file] = stats.size;
      } catch {
        fileSizes[file] = 0;
      }
    }

    return {
      totalFiles: this.logPaths.length,
      availableFiles: availableFiles.length,
      fileSizes
    };
  }
}
