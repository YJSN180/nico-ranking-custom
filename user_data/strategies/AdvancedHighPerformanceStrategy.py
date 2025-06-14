# --- Do not remove these libs ---
from freqtrade.strategy import IStrategy, merge_informative_pair
from pandas import DataFrame
import talib.abstract as ta
import numpy as np
import freqtrade.vendor.qtpylib.indicators as qtpylib

class AdvancedHighPerformanceStrategy(IStrategy):
    """
    Advanced High-Performance Strategy
    
    This strategy aims for high returns with controlled drawdown by combining
    trend-following indicators with oscillators and a dynamic stoploss mechanism.

    Strategy Concept:
    - Trend Identification: Uses a combination of EMAs and ADX to identify the main trend direction and strength.
    - Entry Signals: Enters trades on pullbacks/throwbacks within an established trend, timed with RSI and MACD.
    - Exit Logic (Risk Management): Utilizes the Chandelier Exit (based on ATR) as a dynamic trailing stoploss to protect profits and limit losses.
    - Profit Taking: Primarily relies on the trailing stoploss, but also includes a basic ROI and an option for an exit signal based on trend reversal.
    """
    
    # Strategy interface version - attribute needed so Freqtrade doesn't break.
    INTERFACE_VERSION = 3

    # Timeframe: 1-hour candles are a good balance for this type of strategy.
    timeframe = '1h'
    
    # Can this strategy go short?
    can_short: bool = True

    # Minimal ROI table: A safety net for taking profits.
    minimal_roi = {
        "60": 0.01,
        "30": 0.02,
        "0": 0.04
    }

    # Stoploss: A large static stoploss is used, as the primary stoploss mechanism is the custom Chandelier Exit.
    stoploss = -0.99

    # Trailing stop: Disabled in favor of the custom Chandelier Exit.
    trailing_stop = False

    # --- Hyperoptable Parameters ---
    
    # Entry parameters
    buy_adx_threshold = 30
    buy_rsi_threshold = 40
    
    sell_adx_threshold = 30
    sell_rsi_threshold = 60

    # Chandelier Exit parameters
    ce_atr_period = 22
    ce_atr_multiplier = 3.0
    
    # --- Indicator-based logic ---

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Adds several different TA indicators to the given DataFrame
        """
        # Exponential Moving Averages for trend direction
        dataframe['ema_fast'] = ta.EMA(dataframe, timeperiod=20)
        dataframe['ema_slow'] = ta.EMA(dataframe, timeperiod=50)

        # ADX for trend strength
        dataframe['adx'] = ta.ADX(dataframe, timeperiod=14)

        # RSI for entry timing (pullbacks)
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)

        # MACD for momentum confirmation
        macd = ta.MACD(dataframe, fastperiod=12, slowperiod=26, signalperiod=9)
        dataframe['macd'] = macd['macd']
        dataframe['macdsignal'] = macd['macdsignal']
        dataframe['macdhist'] = macd['macdhist']

        # Average True Range (ATR) for Chandelier Exit
        dataframe['atr'] = ta.ATR(dataframe, timeperiod=self.ce_atr_period)

        # --- Chandelier Exit Calculation ---
        # Long exit line
        chandelier_long_max_high = dataframe['high'].rolling(self.ce_atr_period).max()
        dataframe['chandelier_exit_long'] = chandelier_long_max_high - (dataframe['atr'] * self.ce_atr_multiplier)
        
        # Short exit line
        chandelier_short_min_low = dataframe['low'].rolling(self.ce_atr_period).min()
        dataframe['chandelier_exit_short'] = chandelier_short_min_low + (dataframe['atr'] * self.ce_atr_multiplier)
        
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Based on TA indicators, populates the entry signal for the given dataframe
        """
        # --- Long Entry Conditions ---
        dataframe.loc[
            (
                # Trend is up
                (dataframe['ema_fast'] > dataframe['ema_slow']) &
                (dataframe['adx'] > self.buy_adx_threshold) &
                
                # Pullback confirmed by RSI
                (dataframe['rsi'] < self.buy_rsi_threshold) &
                
                # MACD confirms upward momentum
                (dataframe['macd'] > dataframe['macdsignal']) &
                
                # Volume is not zero
                (dataframe['volume'] > 0)
            ),
            'enter_long'] = 1

        # --- Short Entry Conditions ---
        dataframe.loc[
            (
                # Trend is down
                (dataframe['ema_fast'] < dataframe['ema_slow']) &
                (dataframe['adx'] > self.sell_adx_threshold) &
                
                # Throwback confirmed by RSI
                (dataframe['rsi'] > self.sell_rsi_threshold) &
                
                # MACD confirms downward momentum
                (dataframe['macd'] < dataframe['macdsignal']) &
                
                # Volume is not zero
                (dataframe['volume'] > 0)
            ),
            'enter_short'] = 1
            
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Based on TA indicators, populates the exit signal for the given dataframe
        """
        # This basic version relies on the custom stoploss.
        # An advanced version could include exits based on trend reversal signals.
        dataframe.loc[
            (dataframe['volume'] > 0), # Dummy condition to avoid empty dataframe
            ['exit_long', 'exit_short']] = 0

        return dataframe

    def custom_stoploss(self, pair: str, trade: 'Trade', current_time: 'datetime',
                        current_rate: float, current_profit: float, **kwargs) -> float:
        """
        Custom stoploss logic, implementing Chandelier Exit
        """
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        last_candle = dataframe.iloc[-1].squeeze()

        if trade.is_short:
            # For short trades, we exit if the price goes ABOVE the Chandelier Exit line
            if current_rate > last_candle['chandelier_exit_short']:
                return 0.01 # A small positive value to trigger market sell
        else:
            # For long trades, we exit if the price goes BELOW the Chandelier Exit line
            if current_rate < last_candle['chandelier_exit_long']:
                return -0.01 # A small negative value to trigger market sell

        return self.stoploss 