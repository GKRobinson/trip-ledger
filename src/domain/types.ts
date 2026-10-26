import type { IsoDate } from './dates';
import type { Cents } from './money';

/**
 * How a trip records spending. Chosen when the trip is created and fixed once
 * it has entries. Every method reduces to "total spent by this date" — see
 * `spendSeries` in stats.ts.
 *
 * - runningTotal: each entry is the total spent so far.
 * - moneyLeft:    each entry is how much money is left.
 * - dailySpend:   each entry is what was spent on that day.
 */
export type Method = 'runningTotal' | 'moneyLeft' | 'dailySpend';
export const METHODS: readonly Method[] = ['runningTotal', 'moneyLeft', 'dailySpend'];

/** One typed amount. `note` is '' when there isn't one. */
export interface Amount {
  cents: Cents;
  note: string;
}

/** Where money sits (cash, a card...). Pools add up to one budget. */
export interface Pool {
  id: string;
  name: string;
}

/**
 * One day's record, exactly as typed: for each pool, the amounts that add up
 * to that pool's figure. Pools with nothing typed are left out.
 */
export interface DayEntry {
  date: IsoDate;
  amounts: Record<string, Amount[]>;
}

/** Money added to (positive) or taken from (negative) the budget on a date. */
export interface BudgetChange {
  id: string;
  date: IsoDate;
  cents: Cents;
  note: string;
}

/**
 * Everything that travels in a trip file. The `id` is permanent: importing a
 * file whose trip id you already have replaces your copy of that trip.
 */
export interface Trip {
  id: string;
  name: string;
  /** Display label only, e.g. "USD". No conversion. */
  currency: string;
  startDate: IsoDate;
  endDate: IsoDate;
  method: Method;
  startingBudget: Cents;
  /** At least one. */
  pools: Pool[];
  /** Sorted by date. */
  budgetChanges: BudgetChange[];
  /** Sorted by date, at most one per date. */
  entries: DayEntry[];
  /** The install allowed to edit this trip; everyone else sees it read-only. */
  editorInstallId: string;
  /** When the trip content last changed (ms since epoch). */
  updatedAt: number;
  /** Name of whoever changed it last; '' when they hadn't set a name. */
  updatedBy: string;
}

export type VersionKind =
  | 'created'
  | 'exported'
  | 'imported'
  | 'beforeImport'
  | 'beforeSwitch'
  | 'beforeDelete'
  | 'beforeEdit'
  | 'beforeSettings';

/** A frozen copy of a trip, saved locally. Never part of an exported file. */
export interface Version {
  id: string;
  kind: VersionKind;
  at: number;
  /** Context for the label: who a file came from, which day was deleted... */
  detail: string;
  trip: Trip;
}

/** What this device stores for one trip: its current state plus history. */
export interface TripRecord {
  trip: Trip;
  /** Oldest first. */
  versions: Version[];
  /** The version the current state was last saved as or switched to. */
  currentVersionId: string | null;
}

/** Per-install settings; never exported. */
export interface AppSettings {
  installId: string;
  userName: string;
}

/** Context every edit is stamped with. */
export interface EditMeta {
  now: number;
  userName: string;
}
