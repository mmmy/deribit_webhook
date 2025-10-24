import { DeltaManager } from '../../src/database/delta-manager';

// 创建一个测试辅助类来暴露私有方法
class TestableDeltaManager extends DeltaManager {
  public static testParseInstrumentExpiry(instrumentName: string): Date | null {
    // 使用类型断言来访问私有方法
    return (this as any).parseInstrumentExpiry(instrumentName);
  }
}

describe('DeltaManager - parseInstrumentExpiry', () => {
  describe('parseInstrumentExpiry', () => {
    it('should parse ETH option instrument name correctly', () => {
      const result = TestableDeltaManager.testParseInstrumentExpiry('ETH-31OCT25-3400-P');
      
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(9); // October (0-indexed)
      expect(result!.getDate()).toBe(31);
      expect(result!.getUTCHours()).toBe(8); // UTC time as per implementation
    });

    it('should parse BTC_USDC option instrument name correctly', () => {
      const result = TestableDeltaManager.testParseInstrumentExpiry('BTC_USDC-24OCT25-100000-P');
      
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(9); // October (0-indexed)
      expect(result!.getDate()).toBe(24);
      expect(result!.getUTCHours()).toBe(8); // UTC time as per implementation
    });

    it('should handle different month abbreviations', () => {
      const testCases = [
        { instrument: 'BTC-15JAN25-50000-C', expectedMonth: 0 }, // January
        { instrument: 'BTC-28FEB25-45000-P', expectedMonth: 1 }, // February
        { instrument: 'BTC-15MAR25-40000-C', expectedMonth: 2 }, // March
        { instrument: 'BTC-30APR25-35000-P', expectedMonth: 3 }, // April
        { instrument: 'BTC-31MAY25-30000-C', expectedMonth: 4 }, // May
        { instrument: 'BTC-30JUN25-25000-P', expectedMonth: 5 }, // June
        { instrument: 'BTC-31JUL25-20000-C', expectedMonth: 6 }, // July
        { instrument: 'BTC-31AUG25-15000-P', expectedMonth: 7 }, // August
        { instrument: 'BTC-30SEP25-10000-C', expectedMonth: 8 }, // September
        { instrument: 'BTC-31OCT25-5000-P', expectedMonth: 9 },  // October
        { instrument: 'BTC-30NOV25-8000-C', expectedMonth: 10 }, // November
        { instrument: 'BTC-31DEC25-9000-P', expectedMonth: 11 }, // December
      ];

      testCases.forEach(({ instrument, expectedMonth }) => {
        const result = TestableDeltaManager.testParseInstrumentExpiry(instrument);
        expect(result).toBeInstanceOf(Date);
        expect(result!.getMonth()).toBe(expectedMonth);
      });
    });

    it('should handle different years', () => {
      const testCases = [
        { instrument: 'BTC-31DEC24-50000-C', expectedYear: 2024 },
        { instrument: 'BTC-31DEC25-50000-C', expectedYear: 2025 },
        { instrument: 'BTC-31DEC26-50000-C', expectedYear: 2026 },
        { instrument: 'BTC-31DEC99-50000-C', expectedYear: 2099 },
      ];

      testCases.forEach(({ instrument, expectedYear }) => {
        const result = TestableDeltaManager.testParseInstrumentExpiry(instrument);
        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(expectedYear);
      });
    });

    it('should handle single digit days', () => {
      const testCases = [
        { instrument: 'BTC-1OCT25-50000-C', expectedDay: 1 },
        { instrument: 'BTC-5OCT25-50000-C', expectedDay: 5 },
        { instrument: 'BTC-9OCT25-50000-C', expectedDay: 9 },
      ];

      testCases.forEach(({ instrument, expectedDay }) => {
        const result = TestableDeltaManager.testParseInstrumentExpiry(instrument);
        expect(result).toBeInstanceOf(Date);
        expect(result!.getDate()).toBe(expectedDay);
      });
    });

    it('should return null for invalid instrument names', () => {
      // Test cases that should actually return null - these have invalid expiry formats
      expect(TestableDeltaManager.testParseInstrumentExpiry('')).toBeNull(); // empty string
      expect(TestableDeltaManager.testParseInstrumentExpiry('BTC')).toBeNull(); // no expiry part
      expect(TestableDeltaManager.testParseInstrumentExpiry('BTC-31OCT-3400-P')).toBeNull(); // missing year
      expect(TestableDeltaManager.testParseInstrumentExpiry('BTC-31XXX25-3400-P')).toBeNull(); // invalid month
      expect(TestableDeltaManager.testParseInstrumentExpiry('BTC-32OCT25-3400-P')).toBeNull(); // invalid day
      expect(TestableDeltaManager.testParseInstrumentExpiry('BTC-0OCT25-3400-P')).toBeNull(); // invalid day (0)
      expect(TestableDeltaManager.testParseInstrumentExpiry('BTC-31ABC25-3400-P')).toBeNull(); // invalid month abbreviation
      
      // Note: The function only validates the expiry part (DDMMMYY), so cases like:
      // - 'BTC-31OCT25' -> valid expiry (31OCT25)
      // - 'INVALID-31OCT25-3400-P' -> valid expiry (31OCT25) 
      // - 'BTC-31OCT25-3400-X' -> valid expiry (31OCT25)
      // These will successfully parse the expiry component even if other parts are invalid
    });

    it('should handle lowercase input', () => {
      const result = TestableDeltaManager.testParseInstrumentExpiry('eth-31oct25-3400-p');
      
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(9); // October (0-indexed)
      expect(result!.getDate()).toBe(31);
    });

    it('should handle mixed case input', () => {
      const result = TestableDeltaManager.testParseInstrumentExpiry('Eth-31Oct25-3400-p');
      
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
      expect(result!.getMonth()).toBe(9); // October (0-indexed)
      expect(result!.getDate()).toBe(31);
    });

    it('should return null for null or undefined input', () => {
      expect(TestableDeltaManager.testParseInstrumentExpiry(null as any)).toBeNull();
      expect(TestableDeltaManager.testParseInstrumentExpiry(undefined as any)).toBeNull();
    });

    it('should create date with correct UTC time', () => {
      const result = TestableDeltaManager.testParseInstrumentExpiry('BTC-31OCT25-50000-C');
      
      expect(result).toBeInstanceOf(Date);
      expect(result!.getUTCHours()).toBe(8);
      expect(result!.getUTCMinutes()).toBe(0);
      expect(result!.getUTCSeconds()).toBe(0);
      expect(result!.getUTCMilliseconds()).toBe(0);
    });

    it('should handle edge cases for day validation', () => {
      // Test February 29th on a leap year (2024)
      const leapYearResult = TestableDeltaManager.testParseInstrumentExpiry('BTC-29FEB24-50000-C');
      expect(leapYearResult).toBeInstanceOf(Date);
      expect(leapYearResult!.getFullYear()).toBe(2024);
      expect(leapYearResult!.getMonth()).toBe(1); // February
      expect(leapYearResult!.getDate()).toBe(29);

      // Test February 29th on a non-leap year (2025) - should still parse but date might be invalid
      const nonLeapYearResult = TestableDeltaManager.testParseInstrumentExpiry('BTC-29FEB25-50000-C');
      // The method doesn't validate if the date actually exists, just parses the format
      expect(nonLeapYearResult).toBeInstanceOf(Date);
    });
  });
});