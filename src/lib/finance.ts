export const incomeCategories = ['Salary', 'Freelance', 'Business', 'Rental', 'Interest', 'Gift', 'Other'];
export const expenseCategories = ['Food', 'Rent', 'Utilities', 'Travel', 'Fuel', 'Shopping', 'Medical', 'Education', 'Entertainment', 'EMI', 'Insurance', 'Home', 'Other'];

function parseMinorUnits(value: string) {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= 99999999900 ? minor : null;
}

export function formatMoney(minorUnits: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minorUnits / 100);
}

export function parseAmountToMinor(value: string) {
  const minor = parseMinorUnits(value);
  return minor !== null && minor > 0 ? minor : null;
}

export function parseNonNegativeAmountToMinor(value: string) {
  return parseMinorUnits(value);
}

export function dateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}