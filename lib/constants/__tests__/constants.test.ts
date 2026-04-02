import {
  PLAN_TYPE,
  ORDER_TYPE,
  ORDER_SIDE,
  ORDER_STATUS,
  ADMIN_ROLE,
  SESSION_TYPE,
  INVESTOR_PROFILE,
  LEAGUE_TYPE,
  NOTIFICATION_TYPE,
  IMPACT_CATEGORY,
  SENTIMENT,
  DIVISION,
  PAYMENT_STATUS,
} from '@/lib/enums';
import {
  ROUTES,
  API_ROUTES,
  OPERATIONAL_FEES,
  calculateFee,
  SESSION_COLORS,
  ERROR_CODES,
  ERROR_MESSAGES,
  PLAN_PRICES,
  ORDER_LIMITS_BY_PLAN,
  MAX_ACTIVE_ORDERS_BY_PLAN,
  DELAY_BY_PLAN,
  PAGE_SIZE,
  INITIAL_FS_BALANCE,
  CIRCUIT_BREAKER_THRESHOLD,
  DEBOUNCE_MS,
  MOTOR_TICK_MS,
  SESSION_HOURS,
  TRADING_DAYS,
  MESSAGES,
  PLAN_LABELS,
  ORDER_TYPE_LABELS,
  ORDER_SIDE_LABELS,
  SESSION_TYPE_LABELS,
  INVESTOR_PROFILE_LABELS,
  NAV_LABELS,
} from '@/lib/constants';

// ---- Enums ----

describe('Enums', () => {
  test('PLAN_TYPE tem 3 valores', () => {
    expect(Object.keys(PLAN_TYPE)).toHaveLength(3);
  });

  test('ORDER_TYPE tem 5 valores', () => {
    expect(Object.keys(ORDER_TYPE)).toHaveLength(5);
  });

  test('ORDER_SIDE tem 2 valores', () => {
    expect(Object.keys(ORDER_SIDE)).toHaveLength(2);
  });

  test('ORDER_STATUS tem 5 valores', () => {
    expect(Object.keys(ORDER_STATUS)).toHaveLength(5);
  });

  test('ADMIN_ROLE tem 6 valores', () => {
    expect(Object.keys(ADMIN_ROLE)).toHaveLength(6);
  });

  test('SESSION_TYPE tem 5 valores', () => {
    expect(Object.keys(SESSION_TYPE)).toHaveLength(5);
  });

  test('INVESTOR_PROFILE tem 4 valores', () => {
    expect(Object.keys(INVESTOR_PROFILE)).toHaveLength(4);
  });

  test('LEAGUE_TYPE tem 3 valores', () => {
    expect(Object.keys(LEAGUE_TYPE)).toHaveLength(3);
  });

  // NOTIFICATION_TYPE v2 — 16 valores:
  // ORDER_EXECUTED, ORDER_CANCELLED, MARGIN_CALL_ALERT, CIRCUIT_BREAKER,
  // PAYMENT_CONFIRMED, PAYMENT_FAILED, PLAN_CANCEL_ALERT, DIVIDEND_CREDITED,
  // BONUS_CREDITED, LEAGUE_RESULT, NEWS_FAVORITE_CLUB, ADMIN_BROADCAST,
  // AFFILIATE_COMMISSION_EARNED, AFFILIATE_INVITE_JOINED,
  // CANCELLATION_LOCK_ACTIVE, CANCELLATION_LOCK_LIQUIDATED
  test('NOTIFICATION_TYPE tem 16 valores', () => {
    expect(Object.keys(NOTIFICATION_TYPE)).toHaveLength(16);
  });

  test('IMPACT_CATEGORY tem 15 valores', () => {
    expect(Object.keys(IMPACT_CATEGORY)).toHaveLength(15);
  });

  test('SENTIMENT tem 5 valores', () => {
    expect(Object.keys(SENTIMENT)).toHaveLength(5);
  });

  test('DIVISION tem 2 valores', () => {
    expect(Object.keys(DIVISION)).toHaveLength(2);
  });

  test('PAYMENT_STATUS tem 4 valores', () => {
    expect(Object.keys(PAYMENT_STATUS)).toHaveLength(4);
  });
});

// ---- Constants ----

describe('Constants', () => {
  test('OPERATIONAL_FEES tem 3 faixas (INTAKE canônico)', () => {
    expect(OPERATIONAL_FEES).toHaveLength(3);
    expect(calculateFee(400)).toBe(0.25);   // ≤ FS$ 500
    expect(calculateFee(800)).toBe(0.35);   // FS$ 500-1000
    expect(calculateFee(1500)).toBe(0.45);  // > FS$ 1000
  });

  test('SESSION_COLORS NEGOCIACAO é roxo primário', () => {
    expect(SESSION_COLORS.NEGOCIACAO).toBe('#F0B90B');
  });

  test('PAGE_SIZE é 20', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  test('INITIAL_FS_BALANCE é 2.000', () => {
    expect(INITIAL_FS_BALANCE).toBe(2_000);
  });

  test('CIRCUIT_BREAKER_THRESHOLD é 0.08 (INTAKE canônico)', () => {
    expect(CIRCUIT_BREAKER_THRESHOLD).toBe(0.08);
  });

  test('DEBOUNCE_MS é 300', () => {
    expect(DEBOUNCE_MS).toBe(300);
  });

  test('MOTOR_TICK_MS é 2000', () => {
    expect(MOTOR_TICK_MS).toBe(2_000);
  });

  test('TRADING_DAYS são segunda a sexta', () => {
    expect(TRADING_DAYS).toEqual([1, 2, 3, 4, 5]);
  });

  test('PLAN_PRICES JOGADOR é gratuito', () => {
    expect(PLAN_PRICES.JOGADOR).toBe(0);
  });

  test('DELAY_BY_PLAN LENDA é 0 (tempo real)', () => {
    expect(DELAY_BY_PLAN.LENDA).toBe(0);
  });

  test('ORDER_LIMITS_BY_PLAN tem valores para 3 planos', () => {
    expect(Object.keys(ORDER_LIMITS_BY_PLAN)).toHaveLength(3);
  });

  test('MAX_ACTIVE_ORDERS_BY_PLAN LENDA é 200', () => {
    expect(MAX_ACTIVE_ORDERS_BY_PLAN.LENDA).toBe(200);
  });
});

// ---- Routes ----

describe('Routes', () => {
  test('ROUTES.HOME é /', () => {
    expect(ROUTES.HOME).toBe('/');
  });

  test('ROUTES.MERCADO_TICKER gera rota dinâmica', () => {
    expect(ROUTES.MERCADO_TICKER('FLA4')).toBe('/mercado/FLA4');
  });

  test('API_ROUTES.BASE é /api/v1', () => {
    expect(API_ROUTES.BASE).toBe('/api/v1');
  });

  test('API_ROUTES.ASSETS.DETAIL gera rota dinâmica', () => {
    expect(API_ROUTES.ASSETS.DETAIL('COR3')).toBe('/api/v1/assets/COR3');
  });
});

// ---- Errors ----

describe('Error Codes', () => {
  test('ERROR_CODES tem 53 códigos', () => {
    expect(Object.keys(ERROR_CODES)).toHaveLength(53);
  });

  test('ERROR_MESSAGES cobre todos os códigos', () => {
    const codes = Object.values(ERROR_CODES);
    const messageKeys = Object.keys(ERROR_MESSAGES);
    expect(messageKeys).toHaveLength(codes.length);
    codes.forEach((code) => {
      expect(ERROR_MESSAGES[code]).toBeDefined();
    });
  });
});

// ---- Messages ----

describe('Messages', () => {
  test('MESSAGES.AUTH tem 10 mensagens', () => {
    expect(Object.keys(MESSAGES.AUTH)).toHaveLength(10);
  });

  test('MESSAGES.ORDERS tem 10 mensagens', () => {
    expect(Object.keys(MESSAGES.ORDERS)).toHaveLength(10);
  });

  test('MESSAGES.GENERIC.LOADING é "Carregando..."', () => {
    expect(MESSAGES.GENERIC.LOADING).toBe('Carregando...');
  });
});

// ---- Labels ----

describe('Labels', () => {
  test('PLAN_LABELS cobre todos os planos', () => {
    expect(Object.keys(PLAN_LABELS)).toHaveLength(3);
  });

  test('ORDER_TYPE_LABELS cobre todos os tipos', () => {
    expect(Object.keys(ORDER_TYPE_LABELS)).toHaveLength(5);
  });

  test('ORDER_SIDE_LABELS cobre BUY e SELL', () => {
    expect(ORDER_SIDE_LABELS.BUY).toBe('Compra');
    expect(ORDER_SIDE_LABELS.SELL).toBe('Venda');
  });

  test('SESSION_TYPE_LABELS cobre todas as sessões', () => {
    expect(Object.keys(SESSION_TYPE_LABELS)).toHaveLength(5);
  });

  test('INVESTOR_PROFILE_LABELS cobre todos os perfis', () => {
    expect(Object.keys(INVESTOR_PROFILE_LABELS)).toHaveLength(4);
  });

  test('NAV_LABELS tem labels de navegação', () => {
    expect(NAV_LABELS.HOME).toBe('Início');
    expect(NAV_LABELS.MERCADO).toBe('Mercado');
  });

  test('SESSION_HOURS cobre todas as sessões', () => {
    expect(Object.keys(SESSION_HOURS)).toHaveLength(5);
    expect(SESSION_HOURS.NEGOCIACAO.start).toBe('11:00');
  });
});
