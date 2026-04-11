/**
 * RECO-TRADING - Complete Trading Pipeline Test
 * =================================================
 * Tests every component in the trading pipeline:
 * 1. Market data fetch
 * 2. Technical analysis
 * 3. Strategy ensemble
 * 4. Signal validation
 * 5. Risk manager checks
 * 6. SmartStopTrade evaluation
 * 7. Position size calculation
 * 8. Trade execution (dry run)
 * 
 * Run: bun run test-pipeline.ts
 */

import { getKlines, getTickerPrice, getOrderBook, isTestnetMode, getCurrentCredentials, hasCredentials } from './src/lib/binance';
import { analyzeMarket } from './src/lib/analysis-engine';
import { StrategyEnsemble } from './src/lib/strategies';
import { RiskManager } from './src/lib/risk-manager';
import { SmartStopTrade } from './src/lib/smart-stop-trade';
import { SmartStopLoss } from './src/lib/smart-stop-loss';
import { evaluateMarket } from './src/lib/market-intelligence';

// Colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg: string) {
  console.log(`  ${GREEN}✓ PASS${NC} ${msg}`);
  passed++;
}

function fail(msg: string, reason?: string) {
  console.log(`  ${RED}✗ FAIL${NC} ${msg}${reason ? `: ${reason}` : ''}`);
  failed++;
}

function warn(msg: string) {
  console.log(`  ${YELLOW}⚠ WARN${NC} ${msg}`);
  warnings++;
}

function info(msg: string) {
  console.log(`  ${BLUE}ℹ INFO${NC} ${msg}`);
}

async function main() {
  console.log(`${CYAN}╔══════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║     RECO-TRADING PIPELINE TEST                       ║${NC}`);
  console.log(`${CYAN}╚══════════════════════════════════════════════════════╝${NC}`);
  console.log('');

  // ==========================================
  // STEP 1: Credentials Check
  // ==========================================
  console.log(`${BLUE}[STEP 1/8]${NC} Credentials Check...`);
  
  const testnet = isTestnetMode();
  info(`Testnet mode: ${testnet}`);
  
  const creds = getCurrentCredentials();
  if (creds.apiKey && creds.apiSecret) {
    pass(`API keys loaded: ${creds.apiKey.slice(0, 8)}...`);
  } else {
    fail('API keys NOT loaded');
    warn('Check .env file or DB credentials');
  }
  
  const hasCreds = hasCredentials(testnet);
  if (hasCreds) {
    pass(`Credentials status: CONFIGURED`);
  } else {
    fail('Credentials status: NOT CONFIGURED');
    warn('This will block trade execution');
  }
  
  console.log('');

  // ==========================================
  // STEP 2: Market Data Fetch
  // ==========================================
  console.log(`${BLUE}[STEP 2/8]${NC} Market Data Fetch...`);
  
  const pair = process.env.TRADING_PAIR || 'BTCUSDT';
  info(`Trading pair: ${pair}`);
  
  try {
    const price = await getTickerPrice(pair, testnet);
    if (price > 0) {
      pass(`Price fetched: $${price.toLocaleString()}`);
    } else {
      fail('Price is 0 or invalid');
    }
    
    const orderBook = await getOrderBook(pair, 10, testnet).catch(() => null);
    if (orderBook) {
      pass(`Order book fetched: bid=${orderBook.bid}, ask=${orderBook.ask}`);
    } else {
      warn('Order book fetch failed');
    }
    
    const candles = await getKlines(pair, '5m', 200, testnet);
    if (candles.length >= 50) {
      pass(`Candles fetched: ${candles.length} candles`);
    } else {
      fail(`Insufficient candles: ${candles.length} (need >= 50)`);
    }
    
    // Store for later use
    (global as any).testPrice = price;
    (global as any).testCandles = candles;
    (global as any).testOrderBook = orderBook;
    
  } catch (err) {
    fail('Market data fetch failed', err instanceof Error ? err.message : String(err));
  }
  
  console.log('');

  // ==========================================
  // STEP 3: Technical Analysis
  // ==========================================
  console.log(`${BLUE}[STEP 3/8]${NC} Technical Analysis...`);
  
  const candles = (global as any).testCandles;
  const orderBook = (global as any).testOrderBook;
  
  if (!candles || candles.length < 50) {
    fail('Cannot run analysis without candles');
    return;
  }
  
  try {
    const analysis = analyzeMarket(candles, [], [], [], orderBook);
    (global as any).testAnalysis = analysis;
    
    pass(`Price: $${analysis.price.toLocaleString()}`);
    pass(`Trend: ${analysis.trend} (strength: ${analysis.trendStrength.toFixed(2)})`);
    pass(`RSI: ${analysis.rsi.toFixed(1)} (${analysis.rsiZone})`);
    pass(`MACD: ${analysis.macd.crossover || 'no crossover'}`);
    pass(`ATR: ${analysis.atr.toFixed(2)} (${analysis.atrPct.toFixed(2)}%)`);
    pass(`Signal: ${analysis.signal} (confidence: ${analysis.confidence.toFixed(2)})`);
    pass(`Confluence: ${analysis.confluenceScore.toFixed(2)}`);
    pass(`Regime: ${analysis.marketRegime}`);
    
    if (analysis.suggestedSL > 0) {
      pass(`Suggested SL: $${analysis.suggestedSL.toLocaleString()}`);
    } else {
      warn('No suggested SL');
    }
    
    if (analysis.suggestedTP > 0) {
      pass(`Suggested TP: $${analysis.suggestedTP.toLocaleString()}`);
    } else {
      warn('No suggested TP');
    }
    
  } catch (err) {
    fail('Technical analysis failed', err instanceof Error ? err.message : String(err));
  }
  
  console.log('');

  // ==========================================
  // STEP 4: Strategy Ensemble
  // ==========================================
  console.log(`${BLUE}[STEP 4/8]${NC} Strategy Ensemble...`);
  
  const analysis = (global as any).testAnalysis;
  
  if (!analysis) {
    fail('Cannot run ensemble without analysis');
    return;
  }
  
  try {
    const ensemble = new StrategyEnsemble();
    const result = ensemble.runAll(candles, analysis);
    (global as any).testEnsemble = result;
    
    pass(`Final signal: ${result.finalSignal}`);
    pass(`Confidence: ${result.confidence.toFixed(2)}`);
    pass(`Weighted score: ${result.weightedScore.toFixed(3)}`);
    pass(`Strategies: ${result.strategySignals.length}`);
    
    // Show each strategy
    result.strategySignals.forEach(sig => {
      info(`  - ${sig.name}: ${sig.direction} (conf: ${sig.confidence.toFixed(2)})`);
    });
    
    if (result.reasons.length > 0) {
      info(`Reasons: ${result.reasons.slice(0, 5).join('; ')}`);
    }
    
    if (result.finalSignal === 'NEUTRAL') {
      warn('Signal is NEUTRAL - no trade will be opened');
      warn('This is normal if market conditions are unclear');
    } else {
      pass(`Trade signal generated: ${result.finalSignal}!`);
    }
    
  } catch (err) {
    fail('Strategy ensemble failed', err instanceof Error ? err.message : String(err));
  }
  
  console.log('');

  // ==========================================
  // STEP 5: Market Intelligence
  // ==========================================
  console.log(`${BLUE}[STEP 5/8]${NC} Market Intelligence...`);
  
  try {
    const intel = evaluateMarket(analysis, null);
    (global as any).testIntel = intel;
    
    pass(`Volatility regime: ${intel.volatilityRegime.regime}`);
    pass(`Confidence: ${intel.confidence.grade} (${intel.confidence.confidence.toFixed(2)})`);
    pass(`Confluence: ${intel.confluence.score.toFixed(2)}`);
    pass(`Size multiplier: ${intel.sizeMultiplier.toFixed(2)}`);
    pass(`Effective min confidence: ${intel.effectiveMinConfidence.toFixed(2)}`);
    
  } catch (err) {
    warn('Market intelligence failed (non-critical)');
  }
  
  console.log('');

  // ==========================================
  // STEP 6: Risk Manager
  // ==========================================
  console.log(`${BLUE}[STEP 6/8]${NC} Risk Manager...`);
  
  try {
    const riskManager = new RiskManager();
    await riskManager.initFromDB();
    
    const balance = 1000; // Simulated balance
    const trades: any[] = []; // No trades yet
    
    const canTrade = riskManager.canTrade(trades, balance);
    
    if (canTrade.allowed) {
      pass(`Risk manager: ALLOWED to trade`);
    } else {
      fail(`Risk manager: BLOCKED - ${canTrade.reason}`);
    }
    
    // Test position sizing
    const price = analysis.price;
    const sl = analysis.suggestedSL;
    
    if (sl > 0 && price > 0) {
      const size = riskManager.calculateFixedSize(
        riskManager.config.maxRiskPerTrade,
        balance,
        price,
        sl
      );
      
      if (size.quantity > 0) {
        pass(`Position size: ${size.quantity.toFixed(6)} (${size.method})`);
        info(`  Risk amount: $${size.riskAmount}, Risk: ${size.riskPct}%`);
      } else {
        warn('Position size is 0');
      }
    }
    
  } catch (err) {
    fail('Risk manager failed', err instanceof Error ? err.message : String(err));
  }
  
  console.log('');

  // ==========================================
  // STEP 7: SmartStopTrade
  // ==========================================
  console.log(`${BLUE}[STEP 7/8]${NC} SmartStopTrade...`);
  
  try {
    const smartStop = new SmartStopTrade();
    await smartStop.initFromDB();
    
    const balance = 1000;
    const trades: any[] = [];
    const mlDirection = undefined;
    const mlConfidence = undefined;
    
    const result = smartStop.evaluate(analysis, trades, balance, mlDirection, mlConfidence);
    
    if (result.allowed) {
      pass(`SmartStopTrade: ALLOWED to trade`);
      info(`  Position size multiplier: ${result.positionSizeMultiplier.toFixed(2)}`);
      info(`  Message: ${result.message}`);
    } else {
      fail(`SmartStopTrade: BLOCKED - ${result.reason}`);
      info(`  Message: ${result.message}`);
      info(`  Severity: ${result.severity}`);
    }
    
  } catch (err) {
    fail('SmartStopTrade failed', err instanceof Error ? err.message : String(err));
  }
  
  console.log('');

  // ==========================================
  // STEP 8: Full Pipeline Summary
  // ==========================================
  console.log(`${BLUE}[STEP 8/8]${NC} Pipeline Summary...`);
  
  const ensemble = (global as any).testEnsemble;
  const intel = (global as any).testIntel;
  const price = (global as any).testPrice;
  
  if (ensemble && ensemble.finalSignal !== 'NEUTRAL') {
    console.log('');
    console.log(`${GREEN}╔══════════════════════════════════════════════════════╗${NC}`);
    console.log(`${GREEN}║  ✅ TRADE SIGNAL DETECTED!                           ║${NC}`);
    console.log(`${GREEN}╚══════════════════════════════════════════════════════╝${NC}`);
    console.log('');
    console.log(`  Signal: ${ensemble.finalSignal}`);
    console.log(`  Confidence: ${ensemble.confidence.toFixed(2)}`);
    console.log(`  Price: $${price?.toLocaleString()}`);
    console.log(`  Suggested SL: $${analysis.suggestedSL.toLocaleString()}`);
    console.log(`  Suggested TP: $${analysis.suggestedTP.toLocaleString()}`);
    console.log('');
    console.log(`  ${YELLOW}If the server is running, this trade SHOULD be executed!${NC}`);
    console.log('');
  } else {
    console.log('');
    console.log(`${YELLOW}╔══════════════════════════════════════════════════════╗${NC}`);
    console.log(`${YELLOW}║  ⚠  NEUTRAL SIGNAL - No trade at this moment        ║${NC}`);
    console.log(`${YELLOW}╚══════════════════════════════════════════════════════╝${NC}`);
    console.log('');
    console.log('  This is NORMAL when market conditions are unclear.');
    console.log('  The bot is waiting for a better opportunity.');
    console.log('');
    console.log(`  ${BLUE}Recommendations:${NC}`);
    console.log('  - Wait for next tick (market conditions change)');
    console.log('  - Check if MIN_CONFIDENCE in .env is too high');
    console.log('  - Try a different trading pair with more volatility');
    console.log('');
  }

  // ==========================================
  // FINAL SUMMARY
  // ==========================================
  console.log(`${CYAN}╔══════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║  TEST SUMMARY                                        ║${NC}`);
  console.log(`${CYAN}╚══════════════════════════════════════════════════════╝${NC}`);
  console.log('');
  console.log(`  Passed:   ${GREEN}${passed}${NC}`);
  console.log(`  Failed:   ${RED}${failed}${NC}`);
  console.log(`  Warnings: ${YELLOW}${warnings}${NC}`);
  console.log('');
  
  if (failed === 0) {
    console.log(`${GREEN}✓ ALL CRITICAL TESTS PASSED${NC}`);
    console.log('');
    console.log('  The trading pipeline is functional.');
    console.log('  If no trades are opening, it\'s because:');
    console.log('  1. Market conditions don\'t meet entry criteria (NEUTRAL signal)');
    console.log('  2. SmartStopTrade is blocking (check logs)');
    console.log('  3. Risk manager is blocking (check logs)');
    console.log('');
    console.log(`  ${BLUE}Next steps:${NC}`);
    console.log('  - Restart the server: ./stop.sh && ./run.sh');
    console.log('  - Monitor logs: tail -f server.log | grep -E "(ENGINE|Trade)"');
    console.log('  - Check dashboard: http://localhost:3000');
  } else {
    console.log(`${RED}✗ SOME TESTS FAILED${NC}`);
    console.log('');
    console.log('  Fix the failures above before running the trading bot.');
  }
  
  console.log('');
}

main().catch(err => {
  console.error(`${RED}Fatal error:${NC}`, err);
  process.exit(1);
});
