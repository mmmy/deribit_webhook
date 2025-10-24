import type { DeribitInstrumentDetail } from '../../src/types/deribit-instrument';
import { calculateSmartPrice, correctOrderPrice, getCorrectTickSize } from '../../src/utils/price-correction';

describe('Price Correction Utils', () => {
  const mockInstrumentDetail: DeribitInstrumentDetail = {
    instrument_name: 'BTC-30DEC22-20000-C',
    instrument_id: 123456,
    kind: 'option',
    tick_size: 0.0001,
    tick_size_steps: [
      { above_price: 1000, tick_size: 0.001 },
      { above_price: 100, tick_size: 0.0005 }
    ],
    min_trade_amount: 1,
    contract_size: 1,
    maker_commission: 0.0003,
    taker_commission: 0.0003,
    base_currency: 'BTC',
    quote_currency: 'USD',
    settlement_currency: 'USD',
    creation_timestamp: 1672444800000,
    expiration_timestamp: 1672444800000,
    is_active: true,
    rfq: false,
    option_type: 'call',
    strike: 20000
  };

  describe('getCorrectTickSize', () => {
    it('should return base tick size when no steps provided', () => {
      const tickSize = getCorrectTickSize(100, 0.0001);
      expect(tickSize).toBe(0.0001);
    });

    it('should return correct tick size based on price range', () => {
      const tickSize = getCorrectTickSize(1500, 0.0001, mockInstrumentDetail.tick_size_steps);
      expect(tickSize).toBe(0.001);
    });

    it('should return base tick size for lower prices', () => {
      const tickSize = getCorrectTickSize(50, 0.0001, mockInstrumentDetail.tick_size_steps);
      expect(tickSize).toBe(0.0001);
    });
  });

  describe('correctOrderPrice', () => {
    it('should correct price to valid tick size', () => {
      const result = correctOrderPrice(100.123456, mockInstrumentDetail);
      expect(result.correctedPrice).toBeCloseTo(100.1235, 4);
      expect(result.tickSize).toBe(0.0005);
    });

    it('should handle prices above tick size steps', () => {
      const result = correctOrderPrice(1500.123456, mockInstrumentDetail);
      expect(result.correctedPrice).toBeCloseTo(1500.123, 3);
      expect(result.tickSize).toBe(0.001);
    });

    it('should include price steps in result', () => {
      const result = correctOrderPrice(100, mockInstrumentDetail);
      expect(result).toHaveProperty('priceSteps');
      expect(typeof result.priceSteps).toBe('string');
    });
  });

  describe('calculateSmartPrice', () => {
    it('should calculate smart price based on market conditions', () => {
      const midPrice = 100;
      const side = 'buy';
      const spread = 0.5;
      
      // Mock the function to test basic functionality
      const result = calculateSmartPrice(side, midPrice, spread, 0.1);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });
});