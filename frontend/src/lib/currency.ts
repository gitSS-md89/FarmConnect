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

export function symbol(code?: string | null): string {
  if (!code) return '$';
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

export function fmt(amount: number | undefined | null, code?: string | null): string {
  const n = typeof amount === 'number' ? amount : 0;
  const s = symbol(code);
  return `${s}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
