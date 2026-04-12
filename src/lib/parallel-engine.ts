// ============================================
// RECO-TRADING - Parallel Engine
// ============================================
// Manages multiple trading pairs simultaneously
// Orchestrates multiple Execution Engines
// Handles portfolio risk and balance allocation
// ============================================

import { ExecutionEngine, type EngineStatus, type TickResult } from './execution-engine';

export interface ParallelConfig {
  pairs: string[];
  maxConcurrentPositions: number;
  balancePerPair: number;
  correlationThreshold: number;
  tickInterval: number;
}

export interface PortfolioStatus {
  running: boolean;
  totalPairs: number;
  activePairs: number;
  totalPositions: number;
  totalTradesToday: number;
  dailyPnl: number;
  portfolioRisk: number;
  pairs: Map<string, PairEngineStatus>;
}

export interface PairEngineStatus {
  pair: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR';
  engineRunning: boolean;
  hasPosition: boolean;
  positionSide?: string;
  positionPnl?: number;
  lastSignal: string;
  lastTick: number;
}

const globalForPE = globalThis as unknown as {
  parallelEngine: ParallelEngine | undefined;
};

export class ParallelEngine {
  private engines: Map<string, ExecutionEngine> = new Map();
  private config: ParallelConfig;
  private isRunning = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastPortfolioStatus: PortfolioStatus | null = null;

  constructor(config?: Partial<ParallelConfig>) {
    const pairsEnv = process.env.TRADING_PAIRS || process.env.TRADING_SYMBOL || 'XAU_USD';
    const pairs = pairsEnv.includes(',') ? pairsEnv.split(',').map(p => p.trim()) : [pairsEnv];
    
    this.config = {
      pairs,
      maxConcurrentPositions: parseInt(process.env.MAX_CONCURRENT_POSITIONS || '5'),
      balancePerPair: parseFloat(process.env.BALANCE_PER_PAIR || '20'), // % por par
      correlationThreshold: parseFloat(process.env.CORRELATION_THRESHOLD || '0.7'),
      tickInterval: parseInt(process.env.TICK_INTERVAL || '3000'),
      ...config,
    };

    console.log(`[PARALLEL] Initialized with ${this.config.pairs.length} pairs: ${this.config.pairs.join(', ')}`);
  }

  start(): void {
    if (this.isRunning) {
      console.log('[PARALLEL] Already running');
      return;
    }

    this.isRunning = true;

    for (const pair of this.config.pairs) {
      this.addEngine(pair);
    }

    this.tickTimer = setInterval(() => {
      this.tickAll();
    }, this.config.tickInterval);

    console.log(`[PARALLEL] Started with ${this.engines.size} engines`);
  }

  stop(): void {
    this.isRunning = false;
    
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    for (const [_, engine] of this.engines) {
      engine.stop();
    }

    console.log('[PARALLEL] Stopped');
  }

  private addEngine(pair: string): void {
    if (this.engines.has(pair)) {
      console.log(`[PARALLEL] Engine for ${pair} already exists`);
      return;
    }

    const engine = new ExecutionEngine({ symbol: pair });
    this.engines.set(pair, engine);
    engine.start();

    console.log(`[PARALLEL] Added engine for ${pair}`);
  }

  removeEngine(pair: string): void {
    const engine = this.engines.get(pair);
    if (engine) {
      engine.stop();
      this.engines.delete(pair);
      console.log(`[PARALLEL] Removed engine for ${pair}`);
    }
  }

  private async tickAll(): Promise<void> {
    const results: Map<string, TickResult> = new Map();

    const tickPromises = Array.from(this.engines.entries()).map(async ([pair, engine]) => {
      try {
        const result = await engine.tick();
        results.set(pair, result);
      } catch (err) {
        console.error(`[PARALLEL] Tick error for ${pair}:`, err);
      }
    });

    await Promise.all(tickPromises);
    this.updatePortfolioStatus(results);
  }

  private updatePortfolioStatus(results: Map<string, TickResult>): void {
    let totalPositions = 0;
    let totalTradesToday = 0;
    let dailyPnl = 0;
    const pairsStatus: Map<string, PairEngineStatus> = new Map();

    for (const [pair, engine] of this.engines) {
      const status = engine.getStatus();
      if (status.hasOpenPosition) totalPositions++;
      totalTradesToday += status.tradesToday;
      dailyPnl += status.dailyPnl;

      pairsStatus.set(pair, {
        pair,
        status: status.running ? 'ACTIVE' : 'PAUSED',
        engineRunning: status.running,
        hasPosition: status.hasOpenPosition,
        positionSide: status.positionSide,
        positionPnl: status.positionPnl,
        lastSignal: status.signal,
        lastTick: status.lastTick,
      });
    }

    const portfolioRisk = this.calculatePortfolioRisk();

    this.lastPortfolioStatus = {
      running: this.isRunning,
      totalPairs: this.config.pairs.length,
      activePairs: this.engines.size,
      totalPositions,
      totalTradesToday,
      dailyPnl,
      portfolioRisk,
      pairs: pairsStatus,
    };
  }

  private calculatePortfolioRisk(): number {
    let totalExposure = 0;
    
    for (const [_, engine] of this.engines) {
      const status = engine.getStatus();
      if (status.hasOpenPosition && status.positionPnl !== undefined) {
        const positionValue = Math.abs(status.positionPnl);
        totalExposure += positionValue;
      }
    }

    const initialCapital = parseFloat(process.env.INITIAL_CAPITAL || '1000');
    return initialCapital > 0 ? (totalExposure / initialCapital) * 100 : 0;
  }

  canOpenNewPosition(): boolean {
    const currentPositions = Array.from(this.engines.values())
      .filter(e => e.getStatus().hasOpenPosition).length;
    
    return currentPositions < this.config.maxConcurrentPositions;
  }

  getStatus(): PortfolioStatus {
    if (!this.lastPortfolioStatus) {
      const pairsStatus: Map<string, PairEngineStatus> = new Map();
      for (const [pair, engine] of this.engines) {
        const status = engine.getStatus();
        pairsStatus.set(pair, {
          pair,
          status: status.running ? 'ACTIVE' : 'PAUSED',
          engineRunning: status.running,
          hasPosition: status.hasOpenPosition,
          positionSide: status.positionSide,
          positionPnl: status.positionPnl,
          lastSignal: status.signal,
          lastTick: status.lastTick,
        });
      }

      this.lastPortfolioStatus = {
        running: this.isRunning,
        totalPairs: this.config.pairs.length,
        activePairs: this.engines.size,
        totalPositions: 0,
        totalTradesToday: 0,
        dailyPnl: 0,
        portfolioRisk: 0,
        pairs: pairsStatus,
      };
    }

    return this.lastPortfolioStatus;
  }

  getEngine(pair: string): ExecutionEngine | undefined {
    return this.engines.get(pair);
  }

  addPair(pair: string): void {
    if (!this.config.pairs.includes(pair)) {
      this.config.pairs.push(pair);
      if (this.isRunning) {
        this.addEngine(pair);
      }
    }
  }

  removePair(pair: string): void {
    const index = this.config.pairs.indexOf(pair);
    if (index > -1) {
      this.config.pairs.splice(index, 1);
    }
    if (this.isRunning) {
      this.removeEngine(pair);
    }
  }

  isPairActive(pair: string): boolean {
    return this.engines.has(pair) && this.engines.get(pair)!.getStatus().running;
  }

  getConfig(): ParallelConfig {
    return this.config;
  }

  setMaxPositions(max: number): void {
    this.config.maxConcurrentPositions = max;
  }
}

export const parallelEngine: ParallelEngine =
  globalForPE.parallelEngine ?? new ParallelEngine();

if (process.env.NODE_ENV !== 'production') {
  globalForPE.parallelEngine = parallelEngine;
}
