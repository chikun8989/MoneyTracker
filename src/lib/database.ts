import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export type EntryKind = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'wallet' | 'credit' | 'loan' | 'other';
export type Account = {
  id: number;
  name: string;
  institution: string;
  type: AccountType;
  currency: string;
  openingBalanceMinor: number;
  openingDate: string;
  archived: number;
  currentBalanceMinor: number;
};
export type Transaction = {
  id: number;
  kind: EntryKind;
  amountMinor: number;
  category: string;
  note: string;
  occurredAt: string;
  accountId: number;
  destinationAccountId: number | null;
  accountName?: string;
  destinationAccountName?: string;
};
export type NewTransaction = Omit<Transaction, 'id' | 'accountName' | 'destinationAccountName'>;

const DATABASE_VERSION = 2;
let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.execAsync('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) >= DATABASE_VERSION) return;

  const migrateData = async () => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL CHECK(type IN ('cash','bank','wallet','credit','loan','other')),
      currency TEXT NOT NULL DEFAULT 'INR',
      opening_balance_minor INTEGER NOT NULL DEFAULT 0,
      opening_date TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    await db.runAsync("INSERT OR IGNORE INTO accounts (id, name, institution, type, currency, opening_balance_minor, opening_date) VALUES (1, 'Cash', '', 'cash', 'INR', 0, date('now'))");

    const oldTable = await db.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'");
    const oldColumns = oldTable ? await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)') : [];
    const hasMinorUnits = oldColumns.some((column) => column.name === 'amount_minor');
    if (oldTable && !hasMinorUnits) {
      await db.execAsync('ALTER TABLE transactions RENAME TO transactions_legacy_v1;');
    }

    await db.execAsync(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer')),
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      category TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      destination_account_id INTEGER REFERENCES accounts(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK((kind = 'transfer' AND destination_account_id IS NOT NULL AND destination_account_id != account_id) OR (kind != 'transfer' AND destination_account_id IS NULL))
    );
    CREATE INDEX IF NOT EXISTS transactions_occurred_at_idx ON transactions(occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(account_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS transactions_destination_idx ON transactions(destination_account_id, occurred_at DESC);`);

    if (oldTable && !hasMinorUnits) {
      await db.execAsync(`INSERT INTO transactions (id, kind, amount_minor, category, note, occurred_at, account_id, created_at)
        SELECT id, kind, CAST(ROUND(amount * 100) AS INTEGER), category, note, occurredAt, 1, createdAt
        FROM transactions_legacy_v1 WHERE kind IN ('income','expense') AND amount > 0;
        DROP TABLE transactions_legacy_v1;`);
    }
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  };

  await db.withTransactionAsync(migrateData);
}

export async function getAppSetting(key: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string | null) {
  const db = await getDatabase();
  if (value === null) await db.runAsync('DELETE FROM app_settings WHERE key = ?', key);
  else await db.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP', key, value);
}

export function getDatabase() {
  if (!database) {
    database = (async () => {
      const db = await SQLite.openDatabaseAsync('pocket-ledger.db');
      try {
        await migrate(db);
        return db;
      } catch (error) {
        database = null;
        throw error;
      }
    })();
  }
  return database;
}

export async function listAccounts(includeArchived = false) {
  const db = await getDatabase();
  return db.getAllAsync<Account>(`SELECT a.id, a.name, a.institution, a.type, a.currency,
    a.opening_balance_minor AS openingBalanceMinor, a.opening_date AS openingDate, a.archived,
    a.opening_balance_minor + COALESCE(SUM(CASE
      WHEN t.kind = 'income' AND t.account_id = a.id THEN CASE WHEN a.type IN ('credit','loan') THEN -t.amount_minor ELSE t.amount_minor END
      WHEN t.kind = 'expense' AND t.account_id = a.id THEN CASE WHEN a.type IN ('credit','loan') THEN t.amount_minor ELSE -t.amount_minor END
      WHEN t.kind = 'transfer' AND t.account_id = a.id THEN -t.amount_minor
      WHEN t.kind = 'transfer' AND t.destination_account_id = a.id THEN CASE WHEN a.type IN ('credit','loan') THEN -t.amount_minor ELSE t.amount_minor END
      ELSE 0 END), 0) AS currentBalanceMinor
    FROM accounts a LEFT JOIN transactions t ON (t.account_id = a.id OR t.destination_account_id = a.id) AND t.occurred_at <= date('now')
    ${includeArchived ? '' : 'WHERE a.archived = 0'} GROUP BY a.id ORDER BY a.archived, a.name`);
}

export async function addAccount(input: { name: string; institution: string; type: AccountType; openingBalanceMinor: number; openingDate: string }) {
  const db = await getDatabase();
  await db.runAsync('INSERT INTO accounts (name, institution, type, opening_balance_minor, opening_date) VALUES (?, ?, ?, ?, ?)', input.name.trim(), input.institution.trim(), input.type, input.openingBalanceMinor, input.openingDate);
}

export async function updateAccount(id: number, input: { name: string; institution: string; type: AccountType }) {
  const db = await getDatabase();
  await db.runAsync('UPDATE accounts SET name = ?, institution = ?, type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND archived = 0', input.name.trim(), input.institution.trim(), input.type, id);
}

export async function archiveAccount(id: number) {
  const db = await getDatabase();
  await db.runAsync('UPDATE accounts SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', id);
}

export async function listTransactions(filters: { kind?: EntryKind | 'all'; accountId?: number; startDate?: string; endDate?: string; search?: string } = {}) {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (filters.kind && filters.kind !== 'all') { conditions.push('t.kind = ?'); values.push(filters.kind); }
  if (filters.accountId !== undefined) { conditions.push('(t.account_id = ? OR t.destination_account_id = ?)'); values.push(filters.accountId, filters.accountId); }
  if (filters.startDate) { conditions.push('t.occurred_at >= ?'); values.push(filters.startDate); }
  if (filters.endDate) { conditions.push('t.occurred_at <= ?'); values.push(filters.endDate); }
  if (filters.search?.trim()) { conditions.push('(t.category LIKE ? OR t.note LIKE ? OR source.name LIKE ? OR destination.name LIKE ?)'); const query = `%${filters.search.trim()}%`; values.push(query, query, query, query); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.getAllAsync<Transaction>(`SELECT t.id, t.kind, t.amount_minor AS amountMinor, t.category, t.note,
    t.occurred_at AS occurredAt, t.account_id AS accountId, t.destination_account_id AS destinationAccountId,
    source.name AS accountName, destination.name AS destinationAccountName
    FROM transactions t JOIN accounts source ON source.id = t.account_id
    LEFT JOIN accounts destination ON destination.id = t.destination_account_id
    ${where} ORDER BY t.occurred_at DESC, t.id DESC`, ...values);
}

export async function addTransaction(input: NewTransaction) {
  const db = await getDatabase();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Amount must be a positive whole number of paise.');
  if (input.kind === 'transfer' && (!input.destinationAccountId || input.accountId === input.destinationAccountId)) throw new Error('Choose two different accounts for a transfer.');
  await db.runAsync('INSERT INTO transactions (kind, amount_minor, category, note, occurred_at, account_id, destination_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)', input.kind, input.amountMinor, input.category, input.note.trim(), input.occurredAt, input.accountId, input.kind === 'transfer' ? input.destinationAccountId : null);
}

export async function updateTransaction(id: number, input: NewTransaction) {
  const db = await getDatabase();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Amount must be a positive whole number of paise.');
  if (input.kind === 'transfer' && (!input.destinationAccountId || input.accountId === input.destinationAccountId)) throw new Error('Choose two different accounts for a transfer.');
  await db.runAsync('UPDATE transactions SET kind = ?, amount_minor = ?, category = ?, note = ?, occurred_at = ?, account_id = ?, destination_account_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', input.kind, input.amountMinor, input.category, input.note.trim(), input.occurredAt, input.accountId, input.kind === 'transfer' ? input.destinationAccountId : null, id);
}

export async function removeTransaction(id: number) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

/** Permanently removes all saved finance data and recreates the starter Cash account. */
export async function clearAllFinancialData() {
  const db = await getDatabase();
  const reset = async (tx: SQLite.SQLiteDatabase) => {
    await tx.runAsync('DELETE FROM transactions');
    await tx.runAsync('DELETE FROM accounts');
    await tx.runAsync("INSERT INTO accounts (id, name, institution, type, currency, opening_balance_minor, opening_date) VALUES (1, 'Cash', '', 'cash', 'INR', 0, date('now'))");
  };
  if (Platform.OS === 'web') await db.withTransactionAsync(() => reset(db));
  else await db.withExclusiveTransactionAsync(reset);
}

export async function replaceTransactions(items: NewTransaction[]) {
  const db = await getDatabase();
  const replace = async () => {
    await db.runAsync('DELETE FROM transactions');
    for (const item of items) await db.runAsync('INSERT INTO transactions (kind, amount_minor, category, note, occurred_at, account_id, destination_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)', item.kind, item.amountMinor, item.category, item.note, item.occurredAt, item.accountId, item.kind === 'transfer' ? item.destinationAccountId : null);
  };
  if (Platform.OS === 'web') await db.withTransactionAsync(replace);
  else await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM transactions');
    for (const item of items) await tx.runAsync('INSERT INTO transactions (kind, amount_minor, category, note, occurred_at, account_id, destination_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)', item.kind, item.amountMinor, item.category, item.note, item.occurredAt, item.accountId, item.kind === 'transfer' ? item.destinationAccountId : null);
  });
}

export async function replaceAllData(accounts: Omit<Account, 'currentBalanceMinor'>[], transactions: NewTransaction[]) {
  const db = await getDatabase();
  const run = async (tx: SQLite.SQLiteDatabase) => {
    await tx.runAsync('DELETE FROM transactions');
    await tx.runAsync('DELETE FROM accounts');
    for (const account of accounts) {
      await tx.runAsync('INSERT INTO accounts (id, name, institution, type, currency, opening_balance_minor, opening_date, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', account.id, account.name, account.institution, account.type, account.currency, account.openingBalanceMinor, account.openingDate, account.archived);
    }
    for (const item of transactions) {
      await tx.runAsync('INSERT INTO transactions (kind, amount_minor, category, note, occurred_at, account_id, destination_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)', item.kind, item.amountMinor, item.category, item.note, item.occurredAt, item.accountId, item.kind === 'transfer' ? item.destinationAccountId : null);
    }
  };
  if (Platform.OS === 'web') await db.withTransactionAsync(() => run(db));
  else await db.withExclusiveTransactionAsync(run);
}
