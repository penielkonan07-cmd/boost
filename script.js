//+------------------------------------------------------------------+
//|                                                  EA_Boost_Gainz.mq5 |
//|                                    Copyright 2026, EA Boost Team   |
//|                                             https://www.eaboost.io |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, EA Boost Team"
#property link      "https://www.eaboost.io"
#property version   "1.00"

//+------------------------------------------------------------------+
//| Paramètres d'entrée (inputs)                                      |
//+------------------------------------------------------------------+
input bool     InpEnableTrading    = true;         // Activer le trading automatique
input double   InpRiskPercent      = 1.0;          // Risque en % du capital par trade
input int      InpSlippage         = 30;           // Slippage en points
input int      InpMagicNumber      = 20260513;     // Identifiant unique de l'EA

// Paramètres de l'indicateur GainzAlgo V2
input int      InpGainzPeriod      = 14;           // Période pour le calcul du momentum
input double   InpGainzThreshold   = 15.0;         // Seuil de signal (>=15 bullish, <=-15 bearish)

// Liste des symboles à trader (séparés par des virgules)
input string   InpSymbols          = "EURUSD,GBPJPY,BTCUSD,ETHUSD,XAUUSD,AAPL"; // Actifs

//+------------------------------------------------------------------+
//| Variables globales                                               |
//+------------------------------------------------------------------+
string   SymbolsArray[];
int      SymbolsCount;
double   Leverage;
double   AccountBalance;
datetime LastTickTime = 0;

// Structure pour stocker les données de chaque symbole
struct SymbolData
{
   string   name;
   double   price;
   double   basePrice;       // prix de référence (dernier prix au lancement)
   double   momentum;        // momentum calculé
   double   signal;          // signal GainzAlgo V2
   string   direction;       // "BULLISH", "BEARISH", "NEUTRAL"
   double   strength;        // force du signal (0 à 1)
   double   lotSize;         // lot calculé
};

SymbolData   data[];

//+------------------------------------------------------------------+
//| Initialisation                                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Récupération du levier du compte
   Leverage = AccountInfoInteger(ACCOUNT_LEVERAGE);
   Print("Levier du compte : ", Leverage);

   // Séparer la liste des symboles
   string symbols_str = InpSymbols;
   ushort sep = StringGetCharacter(",",0);
   int count = 0;
   for(int i=0; i<StringLen(symbols_str); i++)
   {
      if(StringGetCharacter(symbols_str,i) == sep) count++;
   }
   count++;
   ArrayResize(SymbolsArray, count);
   int start = 0, idx = 0;
   for(int i=0; i<count; i++)
   {
      int end = StringFind(symbols_str, ",", start);
      if(end == -1) end = StringLen(symbols_str);
      SymbolsArray[i] = StringSubstr(symbols_str, start, end-start);
      start = end+1;
      Print("Symbole ", i, " : ", SymbolsArray[i]);
   }
   SymbolsCount = count;

   // Initialiser les données
   ArrayResize(data, SymbolsCount);
   for(int i=0; i<SymbolsCount; i++)
   {
      data[i].name = SymbolsArray[i];
      data[i].price = SymbolInfoDouble(data[i].name, SYMBOL_BID);
      data[i].basePrice = data[i].price;
      data[i].momentum = 0;
      data[i].signal = 0;
      data[i].direction = "NEUTRAL";
      data[i].strength = 0;
      data[i].lotSize = 0;
   }

   // Vérifier que les symboles sont disponibles
   for(int i=0; i<SymbolsCount; i++)
   {
      if(!SymbolSelect(data[i].name, true))
         Print("Erreur : symbole ", data[i].name, " non trouvé");
   }

   // Création d'un timer pour mise à jour périodique (optionnel)
   EventSetTimer(1);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Desinitialisation                                                |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("EA Boost déchargé.");
}

//+------------------------------------------------------------------+
//| Fonction Tick (appelée à chaque nouveau tick)                    |
//+------------------------------------------------------------------+
void OnTick()
{
   // Vérifier si le trading est activé
   if(!InpEnableTrading) return;

   // Mettre à jour les données de prix
   RefreshSymbols();

   // Calculer l'indicateur GainzAlgo V2 pour chaque symbole
   CalculateGainzSignals();

   // Mettre à jour les lots en fonction du levier et des signaux
   UpdateLots();

   // Exécuter les ordres en fonction des signaux
   ExecuteTrades();
}

//+------------------------------------------------------------------+
//| Mise à jour des prix des symboles                                |
//+------------------------------------------------------------------+
void RefreshSymbols()
{
   for(int i=0; i<SymbolsCount; i++)
   {
      double bid = SymbolInfoDouble(data[i].name, SYMBOL_BID);
      if(bid > 0)
      {
         data[i].price = bid;
      }
   }
}

//+------------------------------------------------------------------+
//| Calcul de l'indicateur GainzAlgo V2                              |
//+------------------------------------------------------------------+
void CalculateGainzSignals()
{
   for(int i=0; i<SymbolsCount; i++)
   {
      string sym = data[i].name;
      double currentPrice = data[i].price;
      double basePrice = data[i].basePrice;

      // Calcul du momentum (variation en pourcentage)
      double momentum = (currentPrice - basePrice) / basePrice * 100.0;
      data[i].momentum = momentum;

      // Volatilité simulée : écart-type des dernières variations (simplifié)
      // On utilise un écart type approximé sur 14 périodes (si disponibles)
      double volatility = 0.0;
      MqlTick ticks[];
      int ticks_copied = CopyTicks(sym, ticks, 0, 14);
      if(ticks_copied > 1)
      {
         double sum = 0;
         for(int t=1; t<ticks_copied; t++)
         {
            double change = (ticks[t].bid - ticks[t-1].bid) / ticks[t-1].bid;
            sum += change * change;
         }
         volatility = MathSqrt(sum / (ticks_copied-1)) * 100.0; // en pourcentage
      }
      else
      {
         volatility = 0.5; // valeur par défaut
      }

      // Signal GainzAlgo V2 : combine momentum et volatilité
      double rawSignal = momentum * 1.2 + (volatility * 0.3);
      if(MathRand() % 100 < 20) rawSignal += (MathRand()/32768.0 - 0.5) * 2.0; // bruit aléatoire

      // Limitation
      rawSignal = MathMin(90, MathMax(-90, rawSignal));

      data[i].signal = rawSignal;

      // Détermination de la direction
      if(rawSignal > InpGainzThreshold)
         data[i].direction = "BULLISH";
      else if(rawSignal < -InpGainzThreshold)
         data[i].direction = "BEARISH";
      else
         data[i].direction = "NEUTRAL";

      data[i].strength = MathAbs(rawSignal) / 100.0;
      if(data[i].strength > 0.95) data[i].strength = 0.95;
   }
}

//+------------------------------------------------------------------+
//| Mise à jour des lots automatiques                                |
//+------------------------------------------------------------------+
void UpdateLots()
{
   AccountBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = AccountBalance * (InpRiskPercent / 100.0);
   double lotStep = SymbolInfoDouble(SymbolsArray[0], SYMBOL_VOLUME_STEP);
   double minLot = SymbolInfoDouble(SymbolsArray[0], SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(SymbolsArray[0], SYMBOL_VOLUME_MAX);

   for(int i=0; i<SymbolsCount; i++)
   {
      string sym = data[i].name;
      double tickSize = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      double stopLevel = SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) * SymbolInfoDouble(sym, SYMBOL_POINT);

      // Calcul du lot basé sur le risque, le levier et la force du signal
      double baseLot = riskAmount / (tickValue * 1.0); // valeur approximative

      // Ajustement selon le levier : plus le levier est élevé, plus le lot peut être important
      double leverageFactor = MathMin(3.5, Leverage / 50.0);
      if(leverageFactor < 0.8) leverageFactor = 0.8;

      // Ajustement selon la force du signal
      double signalBoost = 0.7 + (data[i].strength * 1.2);
      if(data[i].direction == "BULLISH") signalBoost *= 1.3;
      else if(data[i].direction == "BEARISH") signalBoost *= 0.9;

      // Volatilité (simulée) : on peut ajouter un facteur variable
      double volatilityFactor = 0.8 + (MathRand() / 32768.0) * 0.6;

      double lot = baseLot * leverageFactor * signalBoost * volatilityFactor;

      // Spécificités pour certains actifs
      if(StringFind(sym, "BTC") != -1) lot *= 1.6;
      if(StringFind(sym, "XAU") != -1) lot *= 1.3;

      // Arrondi au step et bornes
      if(lotStep > 0)
      {
         lot = MathRound(lot / lotStep) * lotStep;
      }
      lot = MathMin(maxLot, MathMax(minLot, lot));

      data[i].lotSize = lot;
   }
}

//+------------------------------------------------------------------+
//| Exécution des trades                                             |
//+------------------------------------------------------------------+
void ExecuteTrades()
{
   for(int i=0; i<SymbolsCount; i++)
   {
      string sym = data[i].name;
      double lot = data[i].lotSize;
      string direction = data[i].direction;

      // Vérifier si le lot est significatif
      if(lot < SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN)) continue;

      // Compter les positions ouvertes pour ce symbole
      int positions = CountOpenPositions(sym);

      // Si pas de position et signal fort, ouvrir
      if(positions == 0)
      {
         if(direction == "BULLISH")
         {
            OpenOrder(sym, ORDER_TYPE_BUY, lot);
            Print("Ordre BUY ouvert sur ", sym, " lot ", lot);
         }
         else if(direction == "BEARISH")
         {
            OpenOrder(sym, ORDER_TYPE_SELL, lot);
            Print("Ordre SELL ouvert sur ", sym, " lot ", lot);
         }
      }
      else
      {
         // Si position ouverte, on peut la gérer (ex: trailing stop, take profit, etc.)
         // Ici on ne fait rien, mais on pourrait clôturer selon les signaux inverses.
         // Pour simplifier, on laisse les positions ouvertes.
      }
   }
}

//+------------------------------------------------------------------+
//| Ouvrir un ordre                                                  |
//+------------------------------------------------------------------+
bool OpenOrder(string symbol, ENUM_ORDER_TYPE type, double volume)
{
   MqlTick tick;
   SymbolInfoTick(symbol, tick);

   double price = (type == ORDER_TYPE_BUY) ? tick.ask : tick.bid;
   double sl = 0, tp = 0;
   // On peut définir un stop loss basé sur ATR ou autre, ici aucun pour l'exemple

   // Préparation de la requête
   MqlTradeRequest request = {};
   request.action = TRADE_ACTION_DEAL;
   request.symbol = symbol;
   request.volume = volume;
   request.type = type;
   request.price = price;
   request.deviation = InpSlippage;
   request.magic = InpMagicNumber;

   MqlTradeResult result = {};
   if(OrderSend(request, result))
   {
      if(result.retcode == TRADE_RETCODE_DONE)
      {
         Print("Ordre réussi : ", result.order);
         return true;
      }
      else
      {
         Print("Erreur ordre : ", result.retcode, " - ", result.comment);
         return false;
      }
   }
   else
   {
      Print("Échec de l'envoi de l'ordre");
      return false;
   }
}

//+------------------------------------------------------------------+
//| Compter les positions ouvertes pour un symbole                   |
//+------------------------------------------------------------------+
int CountOpenPositions(string symbol)
{
   int count = 0;
   for(int i=PositionsTotal()-1; i>=0; i--)
   {
      if(PositionSelectByTicket(PositionGetTicket(i)))
      {
         if(PositionGetString(POSITION_SYMBOL) == symbol && PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
            count++;
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Fonction Timer (mise à jour périodique)                          |
//+------------------------------------------------------------------+
void OnTimer()
{
   // Mise à jour périodique des données, si nécessaire
   // Par exemple, mettre à jour les prix de base pour le calcul de momentum
   // On pourrait recalculer la basePrice tous les jours, mais on le fait sur chaque tick.
}

//+------------------------------------------------------------------+
//| Fonction de gestion des erreurs                                  |
//+------------------------------------------------------------------+
void OnError()
{
   // Gestion des erreurs (optionnelle)
}
//+------------------------------------------------------------------+