export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥',
  CNY: '¥', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'AED ',
  BRL: 'R$', ZAR: 'R', MXN: 'MX$', NGN: '₦', KES: 'KSh',
  PKR: '₨', BDT: '৳', LKR: 'Rs', NPR: '₨', IDR: 'Rp',
  MYR: 'RM', THB: '฿', PHP: '₱', VND: '₫', CHF: 'CHF ',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', TRY: '₺',
  RUB: '₽', SAR: 'SAR ', EGP: 'E£', GHS: 'GH₵',
};

export const POPULAR_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'SGD', 'AED', 'BRL', 'ZAR', 'MXN'];
export const ALL_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);

// Approximate FX rates. Base = USD. Rate = how many <CUR> per 1 USD.
export const FX_RATES_PER_USD: Record<string, number> = {
  USD: 1, INR: 83, EUR: 0.92, GBP: 0.78, JPY: 150,
  CNY: 7.2, AUD: 1.53, CAD: 1.35, SGD: 1.34, AED: 3.67,
  BRL: 5, ZAR: 18.5, MXN: 17, NGN: 1500, KES: 130,
  PKR: 280, BDT: 110, LKR: 300, NPR: 133, IDR: 15700,
  MYR: 4.7, THB: 35, PHP: 56, VND: 24500, CHF: 0.88,
  SEK: 10.5, NOK: 10.7, DKK: 6.85, PLN: 4, TRY: 32,
  RUB: 90, SAR: 3.75, EGP: 48, GHS: 12,
};

const LOCATION_MAP: [string[], string][] = [
  [['india','delhi','mumbai','bangalore','bengaluru','kolkata','chennai','hyderabad','pune','ahmedabad','punjab','haryana','kerala','karnataka','maharashtra','gujarat','rajasthan','uttar pradesh','bihar','west bengal','tamil nadu','andhra'], 'INR'],
  [['usa','united states','america','us ','u.s.','new york','california','texas','florida','washington','chicago','boston','seattle','los angeles'], 'USD'],
  [['uk','united kingdom','england','britain','london','manchester','scotland','wales'], 'GBP'],
  [['germany','france','spain','italy','netherlands','belgium','portugal','ireland','austria','greece','finland','berlin','paris','madrid','rome','euro'], 'EUR'],
  [['japan','tokyo','osaka'], 'JPY'],
  [['china','shanghai','beijing','shenzhen','guangzhou'], 'CNY'],
  [['australia','sydney','melbourne','brisbane'], 'AUD'],
  [['canada','toronto','vancouver','montreal','ottawa'], 'CAD'],
  [['singapore'], 'SGD'],
  [['uae','dubai','abu dhabi','emirates'], 'AED'],
  [['brazil','sao paulo','rio'], 'BRL'],
  [['south africa','johannesburg','cape town'], 'ZAR'],
  [['mexico','mexico city'], 'MXN'],
  [['nigeria','lagos','abuja'], 'NGN'],
  [['kenya','nairobi'], 'KES'],
  [['pakistan','karachi','lahore','islamabad'], 'PKR'],
  [['bangladesh','dhaka'], 'BDT'],
  [['sri lanka','colombo'], 'LKR'],
  [['nepal','kathmandu'], 'NPR'],
  [['indonesia','jakarta'], 'IDR'],
  [['malaysia','kuala lumpur'], 'MYR'],
  [['thailand','bangkok'], 'THB'],
  [['philippines','manila'], 'PHP'],
  [['vietnam','hanoi','ho chi minh'], 'VND'],
  [['switzerland','zurich','geneva'], 'CHF'],
];

export function detectCurrency(location?: string | null): string | null {
  if (!location) return null;
  const low = location.toLowerCase();
  for (const [keys, code] of LOCATION_MAP) {
    for (const k of keys) if (low.includes(k)) return code;
  }
  return null;
}

export const UNITS = ['kg', 'g', 'tonne', 'quintal', 'lb', 'oz', 'bushel', 'crate', 'bag', 'liter', 'piece'];

// Currency implies default unit (US → lb, else kg)
export function detectUnit(location?: string | null, currency?: string | null): string {
  if (currency === 'USD') return 'lb';
  return 'kg';
}

export function symbol(code?: string | null): string {
  if (!code) return '$';
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

export function fmt(amount: number | undefined | null, code?: string | null): string {
  const n = typeof amount === 'number' ? amount : 0;
  const s = symbol(code);
  return `${s}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function convert(amount: number | undefined | null, from?: string | null, to?: string | null): number {
  if (!amount) return 0;
  const f = (from || 'USD').toUpperCase();
  const t = (to || 'USD').toUpperCase();
  if (f === t) return Math.round(amount * 100) / 100;
  const fr = FX_RATES_PER_USD[f];
  const tr = FX_RATES_PER_USD[t];
  if (!fr || !tr) return Math.round(amount * 100) / 100;
  return Math.round((amount / fr) * tr * 100) / 100;
}
