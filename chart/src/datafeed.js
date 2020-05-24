import { makeApiRequest, parseFullSymbol, generateSymbol } from './helpers.js';
import { subscribeOnStream, unsubscribeFromStream } from './streaming.js';
// ...

const lastBarCache = new Map();

async function getAllSymbols() {
  const data = await makeApiRequest('data/v3/all/exchanges');
  let allSymbols = [];
  
  for (const exchange of configurationData.exchanges) {
    const pairs = data.Data[exchange.value].pairs;
    for (const leftPairPart of Object.keys(pairs)) {
      const symbols = pairs[leftPairPart].map(rightPairPart => {
        const symbol = generateSymbol(exchange.value, leftPairPart, rightPairPart);
        return {
          symbol: symbol.short,
          full_name: symbol.full,
          description: symbol.short,
          exchange: exchange.value,
          type: 'crypto',
        };
      });
      allSymbols = [...allSymbols, ...symbols];
      console.log(allSymbols);
    }
  }
  return allSymbols;
}

const configurationData = {
  supported_resolutions: ['1D'],
  exchanges: [
    {
      value: 'Bitfinex',
      name: 'Bitfinex',
      desc: 'Bitfinex',
    }
  ],
  symbols_types: [
    {
      name: 'crypto',
      // `symbolType` argument for the `searchSymbols` method, if a user selects this symbol type
      value: 'crypto',
    },
  ],
};

export default {
  onReady: (callback) => {
    console.log('[onReady]: Method call');
    setTimeout(() => callback(configurationData));
  },
  searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
    console.log('[searchSymbols]: Method call');
    const symbols = await getAllSymbols();
    const newSymbols = symbols.filter(symbol => {
      const isExchangeValid = exchange === '' || symbol.exchange === exchange;
      const isFullSymbolContainsInput = symbol.full_name.toLowerCase().indexOf(userInput.toLowerCase()) !== -1;
      return isExchangeValid && isFullSymbolContainsInput;
    });
    onResultReadyCallback(newSymbols);
  },
  resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback) => {
    console.log('[resolveSymbol]: Method call', symbolName);
    const symbols = await getAllSymbols();
    const symbolItem = symbols.find(({ full_name }) => full_name === symbolName);
    if (!symbolItem) {
      console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
      onResolveErrorCallback('cannot resolve symbol');
      return;
    }
    const symbolInfo = {
      name: symbolItem.symbol,
      description: symbolItem.description,
      type: symbolItem.type,
      session: '24x7',
      timezone: 'America/New_York',
      exchange: symbolItem.exchange,
      minmov: 1,
      pricescale: 100,
      has_intraday: false,
      has_no_volume: true,
      has_weekly_and_monthly: false,
      supported_resolutions: configurationData.supported_resolutions,
      volume_precision: 2,
      data_status: 'streaming',
    };
    console.log('[resolveSymbol]: Symbol resolved', symbolName);
    onSymbolResolvedCallback(symbolInfo);
  },
  getBars: async (symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback, firstDataRequest) => {
    console.log('[getBars]: Method call', symbolInfo, resolution, from, to);
    const parsedSymbol = parseFullSymbol(symbolInfo.full_name);
    const urlParameters = {
      e: parsedSymbol.exchange,
      fsym: parsedSymbol.fromSymbol,
      tsym: parsedSymbol.toSymbol,
      toTs: to,
      limit: 2000,
    };
    const query = Object.keys(urlParameters).map(name => `${name}=${encodeURIComponent(urlParameters[name])}`).join('&');
    try {
      const data = await makeApiRequest(`data/histoday?${query}`);
      if (data.Response && data.Response === 'Error' || data.Data.length === 0) {
        // "noData" should be set if there is no data in the requested period.
        onHistoryCallback([], { noData: true });
        return;
      }
      let bars = [];
      data.Data.forEach(bar => {
        if (bar.time >= from && bar.time < to) {
          bars = [...bars, {
            time: bar.time * 1000,
            low: bar.low,
            high: bar.high,
            open: bar.open,
            close: bar.close,
          }];
        }
      });
      /* data.Data.forEach( ... ); */

      if (firstDataRequest) {
        lastBarCache.set(symbolInfo.full_name, {...bars[bars.length - 1]});
      }
      console.log(`[getBars]: returned ${bars.length} bar(s)`);
      onHistoryCallback(bars, { noData: false });
    } catch (error) {
      console.log('[getBars]: Get error', error);
      onErrorCallback(error);
    }
  },
  subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
    console.log('[subscribeBars]: Method call with subscribeUID:', subscribeUID);
    subscribeOnStream(
      symbolInfo,
      resolution,
      onRealtimeCallback,
      subscribeUID,
      onResetCacheNeededCallback,
      lastBarCache.get(symbolInfo.full_name)
    );
  },
  unsubscribeBars: (subscriberUID) => {
    console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
    unsubscribeFromStream(subscriberUID);
  },
};
