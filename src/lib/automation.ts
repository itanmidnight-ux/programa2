// ============================================
// RECO-TRADING - Trading Automation
// ============================================
// Orchestrates the execution engine with:
// - Configurable interval-based loop
// - Error recovery and reconnection
// - Health monitoring
// - Statistics reporting
// - Graceful start/stop
// ============================================

import { ExecutionEngine } from '@/lib/execution-engine';
import type { EngineStatus, TickResult } from '@/lib/execution-engine';
import { db } from '@/lib/db';
import { saveEngineState, loadEngineState } from './config-persistence';

// ---- Types ----

export interface AutomationStatus {
  running: boolean;
  pair: string;
  testnet: boolean;
  interval: number;
  lastTickTime: number;
  nextTickTime: number;
  totalTicks: number;
  successfulTicks: number;
  failedTicks: number;
  uptime: number;
  engineStatus: EngineStatus;
  tradesOpened: number;
  tradesClosed: number;
  totalPnl: number;
  avgTickLatency: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  lastHealthCheck: number;
  consecutiveErrors: number;
  reconnectAttempts: number;
  lastReconnectTime: number;
}

export interface AutomationConfig {
  interval: number;             // tick interval in ms (default: 30000 = 30s)
  maxConsecutiveErrors: number; // before pausing (default: 5)
  pauseOnErrors: boolean;       // pause on consecutive errors (default: true)
  pauseDuration: number;        // ms to pause on errors (default: 60000)
  healthCheckInterval: number;  // ms between health checks (default: 60000)
  statsInterval: number;        // ms between stats logging (default: 300000)
  reconnectDelay: number;       // ms before reconnecting (default: 5000)
  maxReconnectAttempts: number; // before giving up (default: 10)
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

// ============================================
// AUTOMATION CLASS
// ============================================

export class TradingAutomation {
  private executionEngine: ExecutionEngine;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private healthCheckId: ReturnType<typeof setInterval> | null = null;
  private statsId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isPaused = false;
  private pauseUntil = 0;

  // Statistics
  private totalTicks = 0;
  private successfulTicks = 0;
  private failedTicks = 0;
  private tradesOpened = 0;
  private tradesClosed = 0;
  private totalPnl = 0;
  private tickLatencies: number[] = [];
  private consecutiveErrors = 0;
  private reconnectAttempts = 0;
  private lastReconnectTime = 0;
  private lastHealthCheck = Date.now();

  // Configuration
  private config: AutomationConfig;

  // Daily reset tracking
  private lastDayResetDate: string = new Date().toISOString().slice(0, 10);

  // ML prediction resolution tracking
  private prevPredictionTime: number = 0;
  private prevPredictionDirection: string = '';
  private prevPredictionPrice: number = 0;
  private prevPredictionDbId: number | null = null;

  constructor(executionEngine?: ExecutionEngine, config?: Partial<AutomationConfig>) {
    this.executionEngine = executionEngine || new ExecutionEngine();
    this.config = {
      interval: parseInt(process.env.TICK_INTERVAL || '30000'),
      maxConsecutiveErrors: 5,
      pauseOnErrors: true,
      pauseDuration: 60000,
      healthCheckInterval: 60000,
      statsInterval: 300000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      logLevel: (process.env.LOG_LEVEL as AutomationConfig['logLevel']) || 'INFO',
      ...config,
    };

    // Load persisted credentials from DB on initialization
    this.loadPersistedCredentials();
    
    this.log('INFO', 'Automation initialized');
  }
  
  // Load credentials from database on startup
  private async loadPersistedCredentials(): Promise<void> {
    try {
      const { loadOandaCredentials } = await import('./oanda-credentials');
      await loadOandaCredentials();
      this.log('INFO', 'Credentials loaded from database');
    } catch (error) {
      this.log('WARN', 'Could not load persisted credentials: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /** Start automated trading */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.log('WARN', 'Automation already running');
      return;
    }

    try {
      // Restore engine state from DB before starting
      await this.restoreEngineState();

      // Check and reset daily stats if it's a new day
      this.checkDailyReset();

      // Load any existing open position
      await this.executionEngine.loadOpenPosition();

      this.isRunning = true;
      this.isPaused = false;
      this.consecutiveErrors = 0;

      // Start the execution engine
      this.executionEngine.start();

      // Save engine state to DB
      await this.saveEngineState();

      // Start the main tick loop
      this.intervalId = setInterval(() => {
        this.runTick().catch(err => {
          this.log('ERROR', `Tick loop error: ${err}`);
        });
      }, this.config.interval);

      // Start health check loop
      this.healthCheckId = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckInterval);

      // Start stats logging loop
      this.statsId = setInterval(() => {
        this.logStats();
      }, this.config.statsInterval);

      this.log('INFO', `Automation started. Interval: ${this.config.interval}ms`);
      await this.logSystemEvent('INFO', 'Automation started');

    } catch (err) {
      this.isRunning = false;
      this.log('ERROR', `Failed to start automation: ${err}`);
      await this.logSystemEvent('ERROR', `Automation start failed: ${err}`);
      throw err;
    }
  }

  /** Stop automated trading */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.log('WARN', 'Automation not running');
      return;
    }

    this.log('INFO', 'Stopping automation...');

    // Clear all intervals
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.healthCheckId) {
      clearInterval(this.healthCheckId);
      this.healthCheckId = null;
    }
    if (this.statsId) {
      clearInterval(this.statsId);
      this.statsId = null;
    }

    // Stop execution engine
    this.executionEngine.stop();

    this.isRunning = false;
    this.log('INFO', 'Automation stopped');

    // Save engine state (running=false) to DB
    await this.saveEngineState();

    this.logSystemEvent('INFO', 'Automation stopped').catch(() => {});
  }

  /** Get automation status */
  getStatus(): AutomationStatus {
    const engineStatus = this.executionEngine.getStatus();
    const now = Date.now();

    return {
      running: this.isRunning && !this.isPaused,
      pair: this.config.interval.toString(),
      testnet: this.executionEngine.getStatus().testnet,
      interval: this.config.interval,
      lastTickTime: this.totalTicks > 0 ? now : 0,
      nextTickTime: this.intervalId ? now + this.config.interval : 0,
      totalTicks: this.totalTicks,
      successfulTicks: this.successfulTicks,
      failedTicks: this.failedTicks,
      uptime: engineStatus.uptime,
      engineStatus,
      tradesOpened: this.tradesOpened,
      tradesClosed: this.tradesClosed,
      totalPnl: this.totalPnl,
      avgTickLatency: this.tickLatencies.length > 0
        ? this.tickLatencies.reduce((a, b) => a + b, 0) / this.tickLatencies.length
        : 0,
      healthStatus: this.consecutiveErrors === 0 ? 'HEALTHY'
        : this.consecutiveErrors < 3 ? 'DEGRADED' : 'UNHEALTHY',
      lastHealthCheck: this.lastHealthCheck,
      consecutiveErrors: this.consecutiveErrors,
      reconnectAttempts: this.reconnectAttempts,
      lastReconnectTime: this.lastReconnectTime,
    };
  }

  /** Execute a single tick (for manual trigger or testing) */
  async tick(): Promise<TickResult> {
    return this.runTick();
  }

  /** Internal tick execution with error handling */
  private async runTick(): Promise<TickResult> {
    // Check if paused
    if (this.isPaused) {
      if (Date.now() < this.pauseUntil) {
        this.log('WARN', `Paused until ${new Date(this.pauseUntil).toISOString()}`);
        return {
          tickTime: Date.now(),
          price: 0,
          analysis: null,
          ensemble: null,
          mlPrediction: null,
          action: 'PAUSED',
          error: 'Automation paused due to consecutive errors',
        };
      } else {
        // Resume from pause
        this.isPaused = false;
        this.consecutiveErrors = 0;
        this.log('INFO', 'Resuming from pause');
      }
    }

    const startTime = Date.now();
    this.totalTicks++;

    try {
      const result = await this.executionEngine.tick();
      const latency = Date.now() - startTime;

      this.successfulTicks++;
      this.consecutiveErrors = 0;
      this.tickLatencies.push(latency);

      // Keep latency history manageable
      if (this.tickLatencies.length > 100) {
        this.tickLatencies = this.tickLatencies.slice(-50);
      }

      // Track trade events
      if (result.action === 'TRADE_OPENED') {
        this.tradesOpened++;
        this.log('INFO', `Trade opened: ${result.tradeResult?.message}`);
      }
      if (result.action === 'STOP_LOSS_HIT' || result.action === 'TAKE_PROFIT_HIT' || result.action?.startsWith('CLOSE')) {
        this.tradesClosed++;
        this.totalPnl += result.tradeResult?.trade?.pnl || 0;
        this.log('INFO', `Trade closed: ${result.tradeResult?.message}, PnL: ${result.tradeResult?.trade?.pnl?.toFixed(2)}`);
      }

      // Check and reset daily stats if it's a new day
      this.checkDailyReset();

      // Resolve stale ML predictions (>15 min old)
      await this.resolveStaleMLPrediction(result);

      // Log significant events
      if (result.action !== 'NO_ACTION' && result.action !== 'BLOCKED:') {
        this.log('DEBUG', `Tick #${this.totalTicks}: ${result.action}, latency: ${latency}ms`);
      }

      // Log signal changes
      if (result.ensemble && result.ensemble.finalSignal !== this.executionEngine.getStatus().signal) {
        this.log('INFO', `Signal changed: ${result.ensemble.finalSignal} (conf: ${result.ensemble.confidence.toFixed(2)})`);
      }

      return result;

    } catch (err) {
      this.failedTicks++;
      this.consecutiveErrors++;

      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log('ERROR', `Tick #${this.totalTicks} failed (${this.consecutiveErrors} consecutive): ${errorMsg}`);

      // Handle consecutive errors
      if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        this.handleConsecutiveErrors(errorMsg);
      }

      return {
        tickTime: Date.now(),
        price: 0,
        analysis: null,
        ensemble: null,
        mlPrediction: null,
        action: 'ERROR',
        error: errorMsg,
      };
    }
  }

  /** Handle consecutive errors with pause/reconnect */
  private handleConsecutiveErrors(errorMsg: string): void {
    if (!this.config.pauseOnErrors) return;

    this.isPaused = true;
    this.pauseUntil = Date.now() + this.config.pauseDuration;

    this.log('WARN', `Pausing automation for ${this.config.pauseDuration / 1000}s due to ${this.consecutiveErrors} consecutive errors`);
    this.logSystemEvent('WARNING', `Paused: ${this.consecutiveErrors} consecutive errors - ${errorMsg}`).catch(() => {});
  }

  /** Attempt reconnection to API */
  private async attemptReconnect(): Promise<boolean> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('ERROR', `Max reconnect attempts (${this.config.maxReconnectAttempts}) reached. Stopping.`);
      this.stop();
      return false;
    }

    this.reconnectAttempts++;
    this.lastReconnectTime = Date.now();

    this.log('INFO', `Reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}...`);

    try {
      // Test API connectivity by checking engine status
      const status = this.executionEngine.getStatus();
      
      // Reset error counters on successful reconnect
      this.consecutiveErrors = 0;
      this.reconnectAttempts = 0;
      this.log('INFO', 'Reconnect successful');
      return true;
    } catch (err) {
      this.log('ERROR', `Reconnect failed: ${err}`);
      return false;
    }
  }

  /** Perform health check */
  private performHealthCheck(): void {
    this.lastHealthCheck = Date.now();

    try {
      const status = this.getStatus();
      const engineStatus = status.engineStatus;

      // Check for issues
      if (engineStatus.errorCount > 10) {
        this.log('WARN', `High error count: ${engineStatus.errorCount}`);
      }

      if (status.avgTickLatency > this.config.interval * 0.8) {
        this.log('WARN', `High tick latency: ${status.avgTickLatency.toFixed(0)}ms (interval: ${this.config.interval}ms)`);
      }

      if (status.failedTicks > status.totalTicks * 0.5 && status.totalTicks > 10) {
        this.log('WARN', `High failure rate: ${(status.failedTicks / status.totalTicks * 100).toFixed(1)}%`);
      }

      // Log health status
      const health = status.healthStatus;
      if (health === 'HEALTHY') {
        this.log('DEBUG', `Health check: ${health} | Ticks: ${status.totalTicks} | Errors: ${status.consecutiveErrors}`);
      } else {
        this.log('WARN', `Health check: ${health} | Ticks: ${status.totalTicks} | Errors: ${status.consecutiveErrors}`);
        // Attempt reconnect if unhealthy
        if (health === 'UNHEALTHY') {
          this.attemptReconnect().catch(() => {});
        }
      }

      // Database connectivity check
      db.session.findFirst({ take: 1 }).catch(err => {
        this.log('ERROR', `Database connectivity issue: ${err}`);
      });

    } catch (err) {
      this.log('ERROR', `Health check failed: ${err}`);
    }
  }

  /** Log statistics */
  private logStats(): void {
    try {
      const status = this.getStatus();
      const engineStatus = status.engineStatus;

      console.log('='.repeat(50));
      console.log('[AUTOMATION] STATISTICS');
      console.log('='.repeat(50));
      console.log(`  Uptime: ${formatDuration(status.uptime)}`);
      console.log(`  Total Ticks: ${status.totalTicks} (OK: ${status.successfulTicks}, Fail: ${status.failedTicks})`);
      console.log(`  Success Rate: ${status.totalTicks > 0 ? ((status.successfulTicks / status.totalTicks) * 100).toFixed(1) : 0}%`);
      console.log(`  Avg Latency: ${status.avgTickLatency.toFixed(0)}ms`);
      console.log(`  Trades Opened: ${status.tradesOpened}`);
      console.log(`  Trades Closed: ${status.tradesClosed}`);
      console.log(`  Total PnL: ${status.totalPnl.toFixed(2)}`);
      console.log(`  Daily PnL: ${engineStatus.dailyPnl.toFixed(2)}`);
      console.log(`  Current Signal: ${engineStatus.signal} (${engineStatus.confidence.toFixed(2)})`);
      console.log(`  ML: ${engineStatus.mlDirection || 'N/A'} (${engineStatus.mlConfidence.toFixed(2)})`);
      console.log(`  Market Regime: ${engineStatus.regime}`);
      console.log(`  Health: ${status.healthStatus}`);
      console.log(`  Errors (consecutive): ${status.consecutiveErrors}`);
      console.log('='.repeat(50));

    } catch (err) {
      this.log('ERROR', `Stats logging failed: ${err}`);
    }
  }

  /** Log with level filtering */
  private log(level: AutomationConfig['logLevel'], message: string): void {
    const levels: Record<AutomationConfig['logLevel'], number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    if (levels[level] >= levels[this.config.logLevel]) {
      const timestamp = new Date().toISOString();
      const prefix = `[AUTOMATION][${level}]`;
      console.log(`${timestamp} ${prefix} ${message}`);
    }
  }

  /** Log event to database */
  private async logSystemEvent(level: string, message: string): Promise<void> {
    try {
      await db.systemLog.create({
        data: {
          level,
          message,
          source: 'automation',
        },
      });
    } catch (err) {
      // Don't log errors about logging to avoid infinite recursion
      if (this.config.logLevel === 'DEBUG') {
        console.error('[AUTOMATION] Failed to log to DB:', err);
      }
    }
  }

  /** Get the execution engine reference */
  getExecutionEngine(): ExecutionEngine {
    return this.executionEngine;
  }

  // ==========================================
  // ENGINE STATE PERSISTENCE
  // ==========================================

  /** Save current engine state to database */
  private async saveEngineState(): Promise<void> {
    try {
      await saveEngineState({
        status: this.isRunning && !this.isPaused ? 'RUNNING' : this.isPaused ? 'PAUSED' : 'STOPPED',
        uptimeSeconds: Math.floor(Date.now() / 1000),
        loopCount: this.totalTicks,
        lastLoopAt: new Date(),
        lastSignal: this.executionEngine.getStatus().signal || null,
        lastError: this.executionEngine.getStatus().lastError || null,
        currentPair: this.executionEngine.getStatus().pair,
        currentStrategy: 'ensemble',
        extraState: {
          tradesOpened: this.tradesOpened,
          tradesClosed: this.tradesClosed,
          totalPnl: this.totalPnl,
          successfulTicks: this.successfulTicks,
          failedTicks: this.failedTicks,
          lastDayResetDate: this.lastDayResetDate,
        },
      });
    } catch (err) {
      this.log('ERROR', `Failed to save engine state: ${err}`);
    }
  }

  /** Restore engine state from database */
  private async restoreEngineState(): Promise<void> {
    try {
      const state = await loadEngineState();
      if (state) {
        const extra = state.extraState || {};
        if (state.loopCount) this.totalTicks = state.loopCount;
        if (extra.tradesOpened) this.tradesOpened = extra.tradesOpened as number;
        if (extra.tradesClosed) this.tradesClosed = extra.tradesClosed as number;
        if (extra.totalPnl) this.totalPnl = extra.totalPnl as number;
        if (extra.lastDayResetDate) this.lastDayResetDate = extra.lastDayResetDate as string;
        if (extra.successfulTicks) this.successfulTicks = extra.successfulTicks as number;
        if (extra.failedTicks) this.failedTicks = extra.failedTicks as number;
        this.log('INFO', `Engine state restored from DB (ticks: ${this.totalTicks}, PnL: ${this.totalPnl.toFixed(2)})`);
      }
    } catch (err) {
      this.log('ERROR', `Failed to restore engine state: ${err}`);
    }
  }

  // ==========================================
  // ML PREDICTION RESOLUTION
  // ==========================================

  /** Resolve stale ML predictions by checking if price moved as predicted */
  private async resolveStaleMLPrediction(result: TickResult): Promise<void> {
    try {
      // Track the current prediction for future resolution
      if (result.mlPrediction && result.price > 0) {
        if (this.prevPredictionTime === 0) {
          this.prevPredictionTime = Date.now();
          this.prevPredictionDirection = result.mlPrediction.direction;
          this.prevPredictionPrice = result.price;
          // Store the DB ID if the prediction was saved
          // We'll resolve using the most recent unresolved prediction
        }
      }

      // Check if we have a prediction older than 15 minutes to resolve
      if (this.prevPredictionTime > 0 && Date.now() - this.prevPredictionTime > 15 * 60 * 1000) {
        // Find the most recent unresolved ML prediction in DB
        const unresolved = await db.mLPrediction.findFirst({
          where: {
            actualResult: null,
            resolvedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (unresolved && result.price > 0 && this.prevPredictionPrice > 0) {
          const predictedDir = unresolved.direction.toLowerCase();
          const priceChange = result.price - this.prevPredictionPrice;
          const pctChange = (priceChange / this.prevPredictionPrice) * 100;

          let actualResult: string;
          if (Math.abs(pctChange) < 0.05) {
            actualResult = 'FLAT';
          } else if (priceChange > 0) {
            actualResult = 'UP';
          } else {
            actualResult = 'DOWN';
          }

          // Check if prediction was correct
          const predictedUp = predictedDir === 'buy' || predictedDir === 'long' || predictedDir === 'up';
          const actualUp = priceChange > 0 && Math.abs(pctChange) >= 0.05;
          const actualDown = priceChange < 0 && Math.abs(pctChange) >= 0.05;
          const predictedDown = predictedDir === 'sell' || predictedDir === 'short' || predictedDir === 'down';

          let correct: boolean | null = null;
          if ((predictedUp && actualUp) || (predictedDown && actualDown)) {
            correct = true;
          } else if ((predictedUp && actualDown) || (predictedDown && actualUp)) {
            correct = false;
          }

          await db.mLPrediction.update({
            where: { id: unresolved.id },
            data: {
              actualResult,
              correct,
              resolvedAt: new Date(),
            },
          });

          this.log('INFO', `ML prediction #${unresolved.id} resolved: predicted ${unresolved.direction}, actual ${actualResult}, correct: ${correct}`);
        }

        // Reset tracking
        this.prevPredictionTime = 0;
        this.prevPredictionDirection = '';
        this.prevPredictionPrice = 0;
      }
    } catch (err) {
      // Don't let ML resolution errors affect trading
      this.log('DEBUG', `ML resolution check failed: ${err}`);
    }
  }

  // ==========================================
  // DAILY STATS RESET
  // ==========================================

  /** Check if it's a new day and reset daily stats */
  private checkDailyReset(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastDayResetDate) {
      this.log('INFO', `New day detected (${this.lastDayResetDate} -> ${today}). Resetting daily stats.`);

      const engine = this.executionEngine;
      engine.getRiskManager().resetDaily();
      engine.getSmartStopTrade().resetDaily();

      this.dailyPnl = 0; // Reset automation's dailyPnl tracking
      this.lastDayResetDate = today;

      // Persist the reset date
      this.saveEngineState().catch(() => {});
    }
  }

  // Backward compat: expose dailyPnl for external access
  private dailyPnl = 0;

  /** Get engine metrics (compatibility for API routes) */
  getMetrics(): { running: boolean; lastTick: number; uptime: number; nextTickIn: number; dailyPnl: number } {
    const status = this.getStatus();
    const now = Date.now();
    return {
      running: status.running,
      lastTick: status.lastTickTime,
      uptime: status.uptime,
      nextTickIn: status.nextTickTime ? status.nextTickTime - now : 0,
      dailyPnl: status.engineStatus.dailyPnl,
    };
  }

  /** Update daily PnL from external source */
  updateDailyPnl(pnl: number): void {
    this.totalPnl = pnl;
  }

  /** Update configuration */
  updateConfig(config: Partial<AutomationConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart intervals if running
    if (this.isRunning && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        this.runTick().catch(err => {
          this.log('ERROR', `Tick loop error: ${err}`);
        });
      }, this.config.interval);

      if (this.healthCheckId) {
        clearInterval(this.healthCheckId);
        this.healthCheckId = setInterval(() => this.performHealthCheck(), this.config.healthCheckInterval);
      }

      if (this.statsId) {
        clearInterval(this.statsId);
        this.statsId = setInterval(() => this.logStats(), this.config.statsInterval);
      }
    }

    this.log('INFO', 'Configuration updated');
  }
}

/** Format duration in seconds to human readable string */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// ============================================
// GLOBAL SINGLETON
// ============================================
// Use globalThis to survive hot-reloads in development

const globalForAutomation = globalThis as unknown as {
  automation: TradingAutomation | undefined;
};

export const automation: TradingAutomation =
  globalForAutomation.automation ?? new TradingAutomation();

if (process.env.NODE_ENV !== 'production') {
  globalForAutomation.automation = automation;
}
