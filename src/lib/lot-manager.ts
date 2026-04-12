// ============================================
// RECO-TRADING - Lot Manager (MetaTrader 5 Style)
// ============================================
// Manages position sizing using MT5-style lot sizes.
// Supports Fixed, Percentage, and Kelly modes.
// ============================================

import { loadAppSetting, saveAppSetting } from './config-persistence';

// ============================================
// Types
// ============================================

export type LotMode = 'FIXED' | 'PERCENTAGE' | 'KELLY';

export interface LotConfig {
  mode: LotMode;
  // Fixed mode
  fixedLotSize: number;       // 0.01, 0.05, 0.10, 0.25, 0.50, 1.00
  // Percentage mode
  riskPerTradePct: number;    // 0.5%, 1%, 2%, 3%
  // Kelly mode
  kellyFraction: number;      // 0.25 (25%), 0.50 (50%), 1.0 (100%)

  // Safety limits
  minLotSize: number;         // Minimum lot (0.01)
  maxLotSize: number;         // Maximum lot per trade
  maxTotalExposurePct: number;// Max % of balance in total exposure

  // Symbol info
  defaultPipValue: number;    // Value of 1 pip for standard lot
}

export interface SymbolInfo {
  symbol: string;
  pipSize: number;
  pipValue: number;           // Per standard lot (1.0)
  contractSize: number;
  minLotSize: number;
  maxLotSize: number;
  lotStep: number;
}

export interface LotCalculation {
  lotSize: number;
  units: number;
  pipValue: number;           // Value per pip for this lot size
  riskAmount: number;         // $ amount at risk
  stopLossPips: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: LotConfig = {
  mode: 'PERCENTAGE',
  fixedLotSize: 0.10,
  riskPerTradePct: 1.0,
  kellyFraction: 0.25,
  minLotSize: 0.01,
  maxLotSize: 10.0,
  maxTotalExposurePct: 30,
  defaultPipValue: 10,
};

// ============================================
// Lot Manager Class
// ============================================

export class LotManager {
  private config: LotConfig;
  private symbolInfos: Map<string, SymbolInfo> = new Map();

  constructor(config?: Partial<LotConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Load config from DB */
  async initFromDB(): Promise<void> {
    try {
      const saved = await loadAppSetting('lot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config = { ...this.config, ...parsed };
        console.log('[LOT] Config loaded from DB:', this.config.mode);
      }
    } catch (err) {
      console.error('[LOT] Failed to load config from DB:', err);
    }
  }

  /** Save config to DB */
  async saveToDB(): Promise<void> {
    try {
      await saveAppSetting('lot_config', JSON.stringify(this.config));
      console.log('[LOT] Config saved to DB');
    } catch (err) {
      console.error('[LOT] Failed to save config to DB:', err);
    }
  }

  /** Register symbol information */
  registerSymbol(info: SymbolInfo): void {
    this.symbolInfos.set(info.symbol.toUpperCase(), info);
  }

  /** Get symbol info */
  getSymbolInfo(symbol: string): SymbolInfo {
    const normalized = symbol.replace(/[_\-\/]/g, '').toUpperCase();
    return this.symbolInfos.get(normalized) || {
      symbol: normalized,
      pipSize: 0.0001,
      pipValue: 10,
      contractSize: 100000,
      minLotSize: 0.01,
      maxLotSize: 100,
      lotStep: 0.01,
    };
  }

  /** Calculate lot size based on configuration */
  calculateLotSize(
    balance: number,
    stopLossPips: number,
    winRate?: number,
    avgWin?: number,
    avgLoss?: number
  ): number {
    let lotSize: number;

    switch (this.config.mode) {
      case 'FIXED':
        lotSize = this.config.fixedLotSize;
        break;

      case 'PERCENTAGE':
        lotSize = this.calculatePercentageLot(balance, stopLossPips);
        break;

      case 'KELLY':
        lotSize = this.calculateKellyLot(balance, winRate || 0, avgWin || 0, avgLoss || 0);
        break;

      default:
        lotSize = this.config.fixedLotSize;
    }

    // Apply safety limits
    lotSize = this.clampLotSize(lotSize);

    return lotSize;
  }

  /** Calculate lot size for percentage mode */
  private calculatePercentageLot(balance: number, stopLossPips: number): number {
    if (stopLossPips <= 0) stopLossPips = 10; // Default SL

    const riskAmount = balance * (this.config.riskPerTradePct / 100);
    const pipValuePerLot = this.config.defaultPipValue;
    const riskPerLot = stopLossPips * pipValuePerLot;

    if (riskPerLot <= 0) return this.config.minLotSize;

    return riskAmount / riskPerLot;
  }

  /** Calculate lot size for Kelly Criterion mode */
  private calculateKellyLot(
    balance: number,
    winRate: number,
    avgWin: number,
    avgLoss: number
  ): number {
    // Need at least some history for Kelly
    if (winRate <= 0 || avgWin <= 0 || avgLoss <= 0) {
      // Fallback to percentage mode
      return this.calculatePercentageLot(balance, 10);
    }

    const winProb = winRate / 100;
    const lossProb = 1 - winProb;
    const winLossRatio = avgWin / avgLoss;

    // Kelly formula: K% = W - [(1 - W) / R]
    const kellyPercent = winProb - (lossProb / winLossRatio);

    // Apply fraction (conservative Kelly)
    const adjustedKelly = kellyPercent * this.config.kellyFraction;

    // Don't risk more than 5% per trade
    const cappedKelly = Math.min(adjustedKelly, 0.05);

    // Convert to lot size (assume 10 pip average move)
    const riskAmount = balance * Math.max(cappedKelly, 0.001); // Min 0.1%
    const riskPerLot = 10 * this.config.defaultPipValue; // 10 pips avg

    return riskAmount / riskPerLot;
  }

  /** Clamp lot size to safe limits */
  private clampLotSize(lotSize: number): number {
    const min = Math.max(this.config.minLotSize, this.getSymbolInfo('').minLotSize);
    const max = Math.min(this.config.maxLotSize, 100); // Hard cap at 100 lots

    // Round to lot step (0.01)
    const step = 0.01;
    lotSize = Math.round(lotSize / step) * step;

    return Math.max(min, Math.min(max, lotSize));
  }

  /** Convert lot size to units */
  lotToUnits(lotSize: number, symbolInfo?: SymbolInfo): number {
    const info = symbolInfo || { contractSize: 100000 };
    return lotSize * info.contractSize;
  }

  /** Convert units to lot size */
  unitsToLot(units: number, symbolInfo?: SymbolInfo): number {
    const info = symbolInfo || { contractSize: 100000 };
    return units / info.contractSize;
  }

  /** Calculate pip value for a specific lot size */
  calculatePipValue(lotSize: number, symbolInfo?: SymbolInfo): number {
    const info = symbolInfo || { pipValue: 10 };
    return lotSize * info.pipValue;
  }

  /** Calculate full lot calculation with details */
  calculate(
    balance: number,
    stopLossPips: number,
    symbolInfo?: SymbolInfo,
    winRate?: number,
    avgWin?: number,
    avgLoss?: number
  ): LotCalculation {
    const lotSize = this.calculateLotSize(balance, stopLossPips, winRate, avgWin, avgLoss);
    const info = symbolInfo || this.getSymbolInfo('');

    const units = this.lotToUnits(lotSize, info);
    const pipValue = this.calculatePipValue(lotSize, info);
    const riskAmount = stopLossPips * pipValue;

    return {
      lotSize: +lotSize.toFixed(2),
      units: +units.toFixed(0),
      pipValue: +pipValue.toFixed(2),
      riskAmount: +riskAmount.toFixed(2),
      stopLossPips,
    };
  }

  /** Get current configuration */
  getConfig(): LotConfig {
    return { ...this.config };
  }

  /** Update configuration */
  updateConfig(config: Partial<LotConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[LOT] Config updated:', this.config.mode, this.config.fixedLotSize);
  }

  /** Format lot size for display */
  formatLot(lotSize: number): string {
    return lotSize.toFixed(2);
  }

  /** Get common lot sizes for UI */
  getCommonLotSizes(): number[] {
    return [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00, 5.00];
  }
}

// ============================================
// Singleton
// ============================================

let lotManagerInstance: LotManager | null = null;

export function getLotManager(): LotManager {
  if (!lotManagerInstance) {
    lotManagerInstance = new LotManager();
    console.log('[LOT] LotManager instance created');
  }
  return lotManagerInstance;
}
