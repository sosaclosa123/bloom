// Wallet: expenses, income, budgets, savings goals and accounts.
// Every item is private or shared (e.g. a shared "House" goal, a private "Car").
import { useMemo, useState, type ReactNode } from 'react';
import type { StringKey } from '../i18n/strings';
import { newMeta } from '../shared/db';
import { parseISODate, toISODate } from '../shared/dates';
import {
  accountBalance,
  accounts as accountsOf,
  budgetStatus,
  budgets as budgetsOf,
  categoryOf,
  EXPENSE_CATEGORIES,
  formatMoney,
  goalMonthly,
  goalSaved,
  goals as goalsOf,
  INCOME_CATEGORIES,
  inScope,
  monthSummary,
  txns as txnsOf,
  type Category,
  type Scope,
} from '../shared/money';
import type { ISODate, MoneyAccount, MoneyBudget, MoneyGoal, MoneyItem, MoneyTxn } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented } from './common';
import { ShareToggle } from './editors';
import { useAlive, useBloom } from './store';

type Sub = 'overview' | 'spending' | 'budgets' | 'goals' | 'accounts';
type Editing =
  | { kind: 'txn'; item: MoneyTxn; isNew: boolean }
  | { kind: 'budget'; item: MoneyBudget; isNew: boolean }
  | { kind: 'goal'; item: MoneyGoal; isNew: boolean }
  | { kind: 'account'; item: MoneyAccount; isNew: boolean }
  | null;

const today = () => toISODate(new Date());
const newTxn = (p: Partial<MoneyTxn> = {}): MoneyTxn => ({ ...newMeta(), kind: 'txn', type: 'expense', amount: 0, category: 'groceries', date: today(), note: '', accountId: null, goalId: null, ...p });

function useMoney() {
  const { settings, locale } = useBloom();
  const fmt = (n: number, compact = false) => formatMoney(n, settings.currency, locale, compact);
  const catName = (c: Category) => (settings.language === 'he' ? c.he : c.en);
  return { fmt, catName };
}

export function WalletPage() {
  const { t, locale } = useBloom();
  const all = useAlive('money') as MoneyItem[];
  const [sub, setSub] = useState<Sub>('overview');
  const [scope, setScope] = useState<Scope>('all');
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [editing, setEditing] = useState<Editing>(null);

  const items = useMemo(() => inScope(all, scope), [all, scope]);
  const shiftMonth = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const monthLabel = parseISODate(`${month}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const subs: { id: Sub; label: StringKey }[] = [
    { id: 'overview', label: 'wOverview' },
    { id: 'spending', label: 'wSpending' },
    { id: 'budgets', label: 'wBudgets' },
    { id: 'goals', label: 'wGoals' },
    { id: 'accounts', label: 'wAccounts' },
  ];

  return (
    <div className="page wallet">
      <div className="wallet-top">
        <div className="wallet-tabs" role="tablist">
          {subs.map((s) => (
            <button type="button" role="tab" aria-selected={sub === s.id} key={s.id} className={sub === s.id ? 'active' : ''} onClick={() => setSub(s.id)}>
              {t(s.label)}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <Segmented
          value={scope}
          onChange={setScope}
          label={t('wScope')}
          options={[
            { value: 'all', label: t('wAll') },
            { value: 'private', label: <><Icon name="lock" size={12} /> {t('private')}</> },
            { value: 'shared', label: <><Icon name="people" size={13} /> {t('shared')}</> },
          ]}
        />
        <Button variant="primary" icon="plus" onClick={() => setEditing({ kind: 'txn', item: newTxn({ visibility: scope === 'shared' ? 'shared' : 'private' }), isNew: true })}>
          {t('wAddTxn')}
        </Button>
      </div>

      {(sub === 'overview' || sub === 'spending' || sub === 'budgets') && (
        <div className="wallet-month">
          <IconButton icon="chevronLeft" className="flip-rtl" label={t('prev')} onClick={() => shiftMonth(-1)} />
          <span>{monthLabel}</span>
          <IconButton icon="chevronRight" className="flip-rtl" label={t('next')} onClick={() => shiftMonth(1)} />
        </div>
      )}

      <div className="page-scroll wallet-body">
        {sub === 'overview' && <Overview items={items} month={month} onGo={setSub} onEdit={setEditing} />}
        {sub === 'spending' && <Spending items={items} month={month} onEdit={setEditing} />}
        {sub === 'budgets' && <Budgets items={items} month={month} onEdit={setEditing} scope={scope} />}
        {sub === 'goals' && <Goals items={items} onEdit={setEditing} scope={scope} />}
        {sub === 'accounts' && <Accounts items={items} onEdit={setEditing} scope={scope} />}
      </div>

      {editing?.kind === 'txn' && <TxnEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.kind === 'budget' && <BudgetEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.kind === 'goal' && <GoalEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.kind === 'account' && <AccountEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- overview

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="w-tile">
      <span className="w-tile-label">{label}</span>
      <span className="w-tile-value" dir="ltr">
        {value}
      </span>
      {sub && <span className="w-tile-sub">{sub}</span>}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="w-card">
      <div className="w-card-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small hover tooltip shared by the charts. */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const bind = (lines: string[]) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, lines }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div className="w-tip" style={{ left: tip.x + 12, top: tip.y + 12 }} role="tooltip">
      {tip.lines.map((l, i) => (
        <div key={i} className={i === 0 ? 'w-tip-title' : ''}>
          {l}
        </div>
      ))}
    </div>
  ) : null;
  return { bind, node };
}

interface PaneProps {
  items: MoneyItem[];
  onEdit: (e: Editing) => void;
}

function Overview({ items, month, onGo, onEdit }: PaneProps & { month: string; onGo: (s: Sub) => void }) {
  const { t } = useBloom();
  const { fmt, catName } = useMoney();
  const tx = txnsOf(items);
  const sum = monthSummary(tx, month);
  const total = accountsOf(items).reduce((s, a) => s + accountBalance(a, tx), 0);
  const { bind, node } = useTip();

  const out = sum.needs + sum.wants + sum.saved;
  const split = [
    { key: 'needs', label: t('wNeeds'), value: sum.needs, guide: 50, cls: 'viz-1' },
    { key: 'wants', label: t('wWants'), value: sum.wants, guide: 30, cls: 'viz-2' },
    { key: 'savings', label: t('wSavings'), value: sum.saved, guide: 20, cls: 'viz-3' },
  ];
  const top = sum.byCategory.slice(0, 7);
  const rest = sum.byCategory.slice(7).reduce((s, c) => s + c.amount, 0);
  const bars = rest > 0 ? [...top, { id: 'other', amount: rest }] : top;
  const maxBar = Math.max(1, ...bars.map((b) => b.amount));
  const status = budgetStatus(budgetsOf(items), tx, month).sort((a, b) => b.ratio - a.ratio).slice(0, 4);
  const gl = goalsOf(items).slice(0, 3);

  return (
    <div className="w-overview">
      <div className="w-tiles">
        <Tile label={t('wHave')} value={fmt(total, true)} sub={t('wHaveSub')} />
        <Tile label={t('wIncome')} value={fmt(sum.income, true)} />
        <Tile label={t('wSpent')} value={fmt(sum.spent, true)} />
        <Tile label={t('wSaved')} value={fmt(sum.saved, true)} sub={sum.income > 0 ? t('wOfIncome', { p: Math.round((sum.saved / sum.income) * 100) }) : undefined} />
      </div>

      <Card title={t('wWhereGoes')}>
        {out === 0 ? (
          <p className="empty">{t('wNoData')}</p>
        ) : (
          <>
            <div className="w-split" role="img" aria-label={split.map((s) => `${s.label} ${Math.round((s.value / out) * 100)}%`).join(', ')}>
              {split
                .filter((s) => s.value > 0)
                .map((s) => (
                  <div key={s.key} className={`w-seg ${s.cls}`} style={{ flexGrow: s.value }} {...bind([s.label, fmt(s.value), `${Math.round((s.value / out) * 100)}% · ${t('wGuide')} ${s.guide}%`])} />
                ))}
            </div>
            <div className="w-legend">
              {split.map((s) => (
                <div key={s.key} className="w-legend-item">
                  <span className={`w-swatch ${s.cls}`} />
                  <span className="w-legend-name">{s.label}</span>
                  <span className="w-legend-val" dir="ltr">
                    {fmt(s.value, true)}
                  </span>
                  <span className="muted small">
                    {Math.round((s.value / out) * 100)}% <span className="w-guide">/ {s.guide}%</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="muted small">{t('wGuideNote')}</p>
          </>
        )}
      </Card>

      <div className="w-cols">
        <Card title={t('wByCategory')} action={<Button size="sm" variant="ghost" onClick={() => onGo('spending')}>{t('wSeeAll')}</Button>}>
          {bars.length === 0 ? (
            <p className="empty">{t('wNoData')}</p>
          ) : (
            <div className="w-bars">
              {bars.map((b) => {
                const c = categoryOf(b.id);
                return (
                  <div key={b.id} className="w-bar-row" {...bind([`${c.emoji} ${catName(c)}`, fmt(b.amount), `${Math.round((b.amount / sum.spent) * 100)}%`])}>
                    <span className="w-bar-label">
                      {c.emoji} {catName(c)}
                    </span>
                    <span className="w-bar-track">
                      <span className="w-bar viz-1" style={{ width: `${(b.amount / maxBar) * 100}%` }} />
                    </span>
                    <span className="w-bar-val" dir="ltr">
                      {fmt(b.amount, true)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="w-stack">
          <Card title={t('wBudgets')} action={<Button size="sm" variant="ghost" onClick={() => onGo('budgets')}>{t('wSeeAll')}</Button>}>
            {status.length === 0 ? <p className="empty">{t('wNoBudgets')}</p> : status.map((s) => <BudgetRow key={s.budget.id} s={s} onClick={() => onEdit({ kind: 'budget', item: s.budget, isNew: false })} />)}
          </Card>
          <Card title={t('wGoals')} action={<Button size="sm" variant="ghost" onClick={() => onGo('goals')}>{t('wSeeAll')}</Button>}>
            {gl.length === 0 ? (
              <p className="empty">{t('wNoGoals')}</p>
            ) : (
              gl.map((g) => {
                const saved = goalSaved(g, tx);
                return (
                  <button type="button" key={g.id} className="w-goal-mini" onClick={() => onEdit({ kind: 'goal', item: g, isNew: false })}>
                    <span>
                      {g.emoji} {g.name} {g.visibility === 'shared' && <Icon name="people" size={12} className="shared-ico" />}
                    </span>
                    <Progress ratio={saved / Math.max(1, g.target)} cls="viz-3" />
                    <span className="muted small" dir="ltr">
                      {fmt(saved, true)} / {fmt(g.target, true)}
                    </span>
                  </button>
                );
              })
            )}
          </Card>
        </div>
      </div>
      {node}
    </div>
  );
}

function Progress({ ratio, cls }: { ratio: number; cls: string }) {
  return (
    <span className="w-progress">
      <span className={`w-progress-fill ${cls}`} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </span>
  );
}

function BudgetRow({ s, onClick }: { s: ReturnType<typeof budgetStatus>[number]; onClick: () => void }) {
  const { t } = useBloom();
  const { fmt, catName } = useMoney();
  const c = categoryOf(s.budget.category);
  return (
    <button type="button" className={`w-budget ${s.state}`} onClick={onClick}>
      <span className="w-budget-top">
        <span>
          {c.emoji} {catName(c)} {s.budget.visibility === 'shared' && <Icon name="people" size={12} className="shared-ico" />}
        </span>
        <span className="small" dir="ltr">
          {fmt(s.spent, true)} / {fmt(s.budget.monthly, true)}
        </span>
      </span>
      <Progress ratio={s.ratio} cls={s.state === 'over' ? 'status-critical' : s.state === 'close' ? 'status-warning' : 'viz-1'} />
      <span className={`w-budget-left small ${s.state}`}>
        {s.state === 'over' ? `⚠ ${t('wOver', { a: fmt(-s.left, true) })}` : s.state === 'close' ? `● ${t('wLeft', { a: fmt(s.left, true) })}` : t('wLeft', { a: fmt(s.left, true) })}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- spending list

function Spending({ items, month, onEdit }: PaneProps & { month: string }) {
  const { t, locale } = useBloom();
  const { fmt, catName } = useMoney();
  const all = txnsOf(items);
  const goals = goalsOf(items);
  const accs = accountsOf(items);
  const list = all.filter((x) => x.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const byDay = new Map<ISODate, MoneyTxn[]>();
  for (const x of list) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
  if (list.length === 0) return <p className="empty center">{t('wNoTxns')}</p>;
  return (
    <div className="w-list">
      {[...byDay.entries()].map(([date, xs]) => (
        <section key={date}>
          <h4 className="w-day">{parseISODate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
          {xs.map((x) => {
            const c = categoryOf(x.category);
            const goal = goals.find((g) => g.id === x.goalId);
            const acc = accs.find((a) => a.id === x.accountId);
            const sign = x.type === 'income' ? '+' : '−';
            return (
              <button type="button" key={x.id} className="w-txn" onClick={() => onEdit({ kind: 'txn', item: x, isNew: false })}>
                <span className="w-txn-emoji">{x.type === 'saving' ? goal?.emoji ?? '🐷' : c.emoji}</span>
                <span className="w-txn-main">
                  <span className="w-txn-title" dir="auto">
                    {x.type === 'saving' ? t('wToGoal', { g: goal?.name ?? '—' }) : x.note || catName(c)}
                  </span>
                  <span className="muted small">
                    {x.type === 'saving' ? t('wSavings') : catName(c)}
                    {acc && ` · ${acc.name}`}
                  </span>
                </span>
                {x.visibility === 'shared' ? <Icon name="people" size={14} className="shared-ico" /> : <Icon name="lock" size={12} className="muted" />}
                <span className={`w-amount ${x.type}`} dir="ltr">
                  {sign}
                  {fmt(x.amount)}
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- budgets / goals / accounts

function Budgets({ items, month, onEdit, scope }: PaneProps & { month: string; scope: Scope }) {
  const { t } = useBloom();
  const status = budgetStatus(budgetsOf(items), txnsOf(items), month);
  return (
    <div className="w-narrow">
      <p className="muted small">{t('wBudgetsIntro')}</p>
      {status.map((s) => (
        <BudgetRow key={s.budget.id} s={s} onClick={() => onEdit({ kind: 'budget', item: s.budget, isNew: false })} />
      ))}
      <Button icon="plus" onClick={() => onEdit({ kind: 'budget', item: { ...newMeta(), visibility: scope === 'shared' ? 'shared' : 'private', kind: 'budget', category: 'groceries', monthly: 0 }, isNew: true })}>
        {t('wAddBudget')}
      </Button>
    </div>
  );
}

function Goals({ items, onEdit, scope }: PaneProps & { scope: Scope }) {
  const { t, locale } = useBloom();
  const { fmt } = useMoney();
  const tx = txnsOf(items);
  return (
    <div className="w-goals">
      {goalsOf(items).map((g) => {
        const saved = goalSaved(g, tx);
        const monthly = goalMonthly(g, saved, new Date());
        const done = saved >= g.target;
        return (
          <div key={g.id} className="w-goal">
            <button type="button" className="w-goal-head" onClick={() => onEdit({ kind: 'goal', item: g, isNew: false })}>
              <span className="w-goal-emoji">{g.emoji}</span>
              <span className="w-goal-name" dir="auto">
                {g.name}
              </span>
              {g.visibility === 'shared' ? <Icon name="people" size={15} className="shared-ico" /> : <Icon name="lock" size={13} className="muted" />}
            </button>
            <div className="w-goal-amount" dir="ltr">
              {fmt(saved, true)} <span className="muted">/ {fmt(g.target, true)}</span>
            </div>
            <Progress ratio={saved / Math.max(1, g.target)} cls="viz-3" />
            <div className="muted small">
              {done
                ? `🎉 ${t('wGoalDone')}`
                : g.targetDate
                  ? t('wGoalPlan', { a: fmt(monthly ?? 0, true), d: parseISODate(g.targetDate).toLocaleDateString(locale, { month: 'long', year: 'numeric' }) })
                  : `${Math.round((saved / Math.max(1, g.target)) * 100)}%`}
            </div>
            <Button size="sm" icon="plus" onClick={() => onEdit({ kind: 'txn', item: newTxn({ type: 'saving', goalId: g.id, visibility: g.visibility, category: 'other' }), isNew: true })}>
              {t('wAddToGoal')}
            </Button>
          </div>
        );
      })}
      <button
        type="button"
        className="w-goal w-goal-new"
        onClick={() => onEdit({ kind: 'goal', item: { ...newMeta(), visibility: scope === 'shared' ? 'shared' : 'private', kind: 'goal', name: '', emoji: '🏠', target: 0, startSaved: 0, targetDate: null }, isNew: true })}
      >
        <Icon name="plus" size={24} />
        {t('wAddGoal')}
      </button>
    </div>
  );
}

function Accounts({ items, onEdit, scope }: PaneProps & { scope: Scope }) {
  const { t } = useBloom();
  const { fmt } = useMoney();
  const tx = txnsOf(items);
  const accs = accountsOf(items);
  const total = accs.reduce((s, a) => s + accountBalance(a, tx), 0);
  return (
    <div className="w-narrow">
      <div className="w-total">
        <span className="muted">{t('wHave')}</span>
        <strong dir="ltr">{fmt(total)}</strong>
      </div>
      {accs.map((a) => (
        <button type="button" key={a.id} className="w-acc" onClick={() => onEdit({ kind: 'account', item: a, isNew: false })}>
          <span className="w-txn-emoji">{a.emoji}</span>
          <span className="w-txn-main">
            <span className="w-txn-title" dir="auto">
              {a.name}
            </span>
            <span className="muted small">{t(`wAcc_${a.type}` as StringKey)}</span>
          </span>
          {a.visibility === 'shared' ? <Icon name="people" size={14} className="shared-ico" /> : <Icon name="lock" size={12} className="muted" />}
          <span className="w-amount" dir="ltr">
            {fmt(accountBalance(a, tx))}
          </span>
        </button>
      ))}
      <Button icon="plus" onClick={() => onEdit({ kind: 'account', item: { ...newMeta(), visibility: scope === 'shared' ? 'shared' : 'private', kind: 'account', name: '', type: 'bank', startBalance: 0, emoji: '🏦' }, isNew: true })}>
        {t('wAddAccount')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- editors

function MoneyInput({ value, onChange, autoFocus }: { value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  const { settings, locale } = useBloom();
  const [text, setText] = useState(value ? String(value) : '');
  const symbol = useMemo(() => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: settings.currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
    } catch {
      return settings.currency;
    }
  }, [locale, settings.currency]);
  return (
    <div className="money-input" dir="ltr">
      <span>{symbol}</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        placeholder="0"
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
          setText(v);
          const n = Number(v);
          onChange(Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
        }}
      />
    </div>
  );
}

function EditorShell({ title, isNew, onClose, onSave, onDelete, canSave, children }: { title: string; isNew: boolean; onClose: () => void; onSave: () => void; onDelete: () => void; canSave: boolean; children: ReactNode }) {
  const { t } = useBloom();
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={480}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" icon="trash" onClick={onDelete}>
              {t('delete')}
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={onSave}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave();
        }}
      >
        {children}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CategoryGrid({ list, value, onChange }: { list: Category[]; value: string; onChange: (id: string) => void }) {
  const { catName } = useMoney();
  return (
    <div className="cat-grid">
      {list.map((c) => (
        <button type="button" key={c.id} className={`cat ${value === c.id ? 'active' : ''}`} onClick={() => onChange(c.id)}>
          <span className="cat-emoji">{c.emoji}</span>
          <span className="cat-name">{catName(c)}</span>
        </button>
      ))}
    </div>
  );
}

function useEditor<T extends MoneyItem>(init: T, onClose: () => void) {
  const { save, del } = useBloom();
  const [v, setV] = useState(init);
  const set = (p: Partial<T>) => setV((x) => ({ ...x, ...p }));
  return {
    v,
    set,
    commit: () => {
      save('money', v);
      onClose();
    },
    remove: () => {
      del('money', init);
      onClose();
    },
  };
}

function TxnEditor({ init, isNew, onClose }: { init: MoneyTxn; isNew: boolean; onClose: () => void }) {
  const { t } = useBloom();
  const all = useAlive('money') as MoneyItem[];
  const { v, set, commit, remove } = useEditor(init, onClose);
  const accs = accountsOf(all);
  const goals = goalsOf(all);
  return (
    <EditorShell title={isNew ? t('wNewTxn') : t('wEditTxn')} isNew={isNew} onClose={onClose} onSave={commit} onDelete={remove} canSave={v.amount > 0 && (v.type !== 'saving' || !!v.goalId)}>
      <Segmented
        value={v.type}
        onChange={(type) => set({ type, category: type === 'income' ? 'salary' : type === 'expense' ? 'groceries' : 'other', goalId: type === 'saving' ? v.goalId ?? goals[0]?.id ?? null : null })}
        options={[
          { value: 'expense', label: t('wExpense') },
          { value: 'income', label: t('wIncomeOne') },
          { value: 'saving', label: t('wSavingOne') },
        ]}
      />
      <Field label={t('amount')}>
        <MoneyInput value={v.amount} onChange={(amount) => set({ amount })} autoFocus />
      </Field>
      {v.type === 'saving' ? (
        <Field label={t('wGoal')}>
          {goals.length === 0 ? (
            <p className="muted small">{t('wNoGoals')}</p>
          ) : (
            <select value={v.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value })}>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <Field label={t('wCategory')}>
          <CategoryGrid list={v.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES} value={v.category} onChange={(category) => set({ category })} />
        </Field>
      )}
      <div className="grid-2">
        <Field label={t('date')}>
          <input type="date" value={v.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
        <Field label={t('wAccount')}>
          <select value={v.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || null })}>
            <option value="">{t('wNoAccount')}</option>
            {accs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('wNote')}>
        <input dir="auto" value={v.note} placeholder={t('wNotePh')} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
    </EditorShell>
  );
}

function BudgetEditor({ init, isNew, onClose }: { init: MoneyBudget; isNew: boolean; onClose: () => void }) {
  const { t } = useBloom();
  const { v, set, commit, remove } = useEditor(init, onClose);
  return (
    <EditorShell title={isNew ? t('wAddBudget') : t('wEditBudget')} isNew={isNew} onClose={onClose} onSave={commit} onDelete={remove} canSave={v.monthly > 0}>
      <Field label={t('wCategory')}>
        <CategoryGrid list={EXPENSE_CATEGORIES} value={v.category} onChange={(category) => set({ category })} />
      </Field>
      <Field label={t('wMonthlyLimit')}>
        <MoneyInput value={v.monthly} onChange={(monthly) => set({ monthly })} />
      </Field>
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
    </EditorShell>
  );
}

const GOAL_EMOJIS = ['🏠', '🚗', '✈️', '💍', '🎓', '💻', '🛋️', '👶', '🐶', '🏖️', '🎁', '🐷'];

function GoalEditor({ init, isNew, onClose }: { init: MoneyGoal; isNew: boolean; onClose: () => void }) {
  const { t } = useBloom();
  const { v, set, commit, remove } = useEditor(init, onClose);
  return (
    <EditorShell title={isNew ? t('wAddGoal') : t('wEditGoal')} isNew={isNew} onClose={onClose} onSave={commit} onDelete={remove} canSave={!!v.name.trim() && v.target > 0}>
      <input className="title-input" dir="auto" autoFocus value={v.name} placeholder={t('wGoalPh')} onChange={(e) => set({ name: e.target.value })} />
      <div className="emoji-grid">
        {GOAL_EMOJIS.map((e) => (
          <button type="button" key={e} className={e === v.emoji ? 'active' : ''} onClick={() => set({ emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Field label={t('wTarget')}>
          <MoneyInput value={v.target} onChange={(target) => set({ target })} />
        </Field>
        <Field label={t('wAlreadySaved')}>
          <MoneyInput value={v.startSaved} onChange={(startSaved) => set({ startSaved })} />
        </Field>
      </div>
      <Field label={t('wTargetDate')}>
        <input type="date" value={v.targetDate ?? ''} onChange={(e) => set({ targetDate: e.target.value || null })} />
      </Field>
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
    </EditorShell>
  );
}

const ACC_EMOJIS: Record<MoneyAccount['type'], string> = { bank: '🏦', cash: '💵', card: '💳', savings: '🐷' };

function AccountEditor({ init, isNew, onClose }: { init: MoneyAccount; isNew: boolean; onClose: () => void }) {
  const { t } = useBloom();
  const { v, set, commit, remove } = useEditor(init, onClose);
  return (
    <EditorShell title={isNew ? t('wAddAccount') : t('wEditAccount')} isNew={isNew} onClose={onClose} onSave={commit} onDelete={remove} canSave={!!v.name.trim()}>
      <input className="title-input" dir="auto" autoFocus value={v.name} placeholder={t('wAccountPh')} onChange={(e) => set({ name: e.target.value })} />
      <Segmented
        value={v.type}
        onChange={(type) => set({ type, emoji: ACC_EMOJIS[type] })}
        options={(['bank', 'cash', 'card', 'savings'] as const).map((x) => ({ value: x, label: `${ACC_EMOJIS[x]} ${t(`wAcc_${x}` as StringKey)}` }))}
      />
      <Field label={t('wStartBalance')}>
        <MoneyInput value={v.startBalance} onChange={(startBalance) => set({ startBalance })} />
      </Field>
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
    </EditorShell>
  );
}
