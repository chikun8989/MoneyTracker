import { Account, listAccounts, listTransactions, NewTransaction, replaceAllData } from '@/lib/database';

type AccountBackup = Omit<Account, 'currentBalanceMinor'>;
export type MoneyBackup = { format: 'pocket-ledger-backup'; version: 2; exportedAt: string; accounts: AccountBackup[]; transactions: NewTransaction[] };

export async function makeLocalBackup(): Promise<MoneyBackup> {
  const [accounts, transactions] = await Promise.all([listAccounts(true), listTransactions()]);
  return {
    format: 'pocket-ledger-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts: accounts.map(({ id, name, institution, type, currency, openingBalanceMinor, openingDate, archived }) => ({ id, name, institution, type, currency, openingBalanceMinor, openingDate, archived })),
    transactions: transactions.map(({ kind, amountMinor, category, note, occurredAt, accountId, destinationAccountId }) => ({ kind, amountMinor, category, note, occurredAt, accountId, destinationAccountId })),
  };
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export async function restoreBackupData(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new Error('The selected backup file is not valid.');
  const backup = raw as Partial<MoneyBackup>;
  if (backup.format !== 'pocket-ledger-backup' || backup.version !== 2 || !Array.isArray(backup.accounts) || backup.accounts.length === 0 || !Array.isArray(backup.transactions) || backup.transactions.length > 100000) throw new Error('Unsupported or incomplete backup format.');
  const accountIds = new Set<number>();
  for (const account of backup.accounts) {
    if (!Number.isSafeInteger(account.id) || account.id < 1 || accountIds.has(account.id) || typeof account.name !== 'string' || typeof account.institution !== 'string' || !['cash', 'bank', 'wallet', 'credit', 'loan', 'other'].includes(account.type) || typeof account.currency !== 'string' || !Number.isSafeInteger(account.openingBalanceMinor) || !isDate(account.openingDate) || ![0, 1].includes(account.archived)) throw new Error('A saved account in the backup file is invalid.');
    accountIds.add(account.id);
  }
  for (const item of backup.transactions) {
    if (!['expense', 'income', 'transfer'].includes(item.kind) || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || typeof item.category !== 'string' || typeof item.note !== 'string' || !isDate(item.occurredAt) || !Number.isSafeInteger(item.accountId) || !accountIds.has(item.accountId)) throw new Error('A saved transaction in the backup file is invalid.');
    if (item.kind === 'transfer' && (!item.destinationAccountId || !accountIds.has(item.destinationAccountId) || item.destinationAccountId === item.accountId)) throw new Error('A saved transfer in the backup file is invalid.');
    if (item.kind !== 'transfer' && item.destinationAccountId !== null) throw new Error('A saved transaction contains an unexpected destination account.');
  }
  await replaceAllData(backup.accounts, backup.transactions);
}
