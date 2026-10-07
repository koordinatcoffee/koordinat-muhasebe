/** Display order of category groups (matches supabase/schema.sql) */
export const INCOME_GROUPS = [
  'Kafe Satışları',
  'Perakende Satış',
  'Kanal ve Kurumsal Satış',
  'Diğer Gelirler',
];

export const EXPENSE_GROUPS = [
  'Ürün Maliyeti (Hammadde)',
  'Ambalaj ve Sarf Malzeme',
  'Personel',
  'Kira ve Mekân',
  'Faturalar',
  'Vergi, Resmi ve Muhasebe',
  'Bakım, Onarım ve Ekipman',
  'Temizlik ve Hijyen',
  'Pazarlama ve Reklam',
  'Finansal Giderler ve Komisyonlar',
  'Lojistik ve Ulaşım',
  'Yazılım ve Abonelikler',
  'Diğer Giderler',
];

export const FALLBACK_GROUP = { income: 'Diğer Gelirler', expense: 'Diğer Giderler' };

/** Group that register sales belong to in reports */
export const REGISTER_SALES_GROUP = 'Kafe Satışları';

/** Report label for register sales that were not split into categories */
export const UNALLOCATED_REGISTER_SALES = 'Kasa Satışı (dağıtılmamış)';

/** Income groups that never pass through the register (entered as separate income) */
export const NON_REGISTER_INCOME_GROUPS = ['Kanal ve Kurumsal Satış', 'Diğer Gelirler'];

/** Key cost ratios tracked by cafés, as a share of total income */
export const COST_RATIOS = [
  { group: 'Ürün Maliyeti (Hammadde)', label: 'Ürün maliyeti', benchmark: 'Genelde %25-35' },
  { group: 'Personel', label: 'Personel', benchmark: 'Genelde %25-35' },
  { group: 'Kira ve Mekân', label: 'Kira ve mekân', benchmark: 'Genelde %10-15' },
  { group: 'Ambalaj ve Sarf Malzeme', label: 'Ambalaj ve sarf', benchmark: 'Genelde %3-8' },
];

export const groupsForType = (type) => (type === 'income' ? INCOME_GROUPS : EXPENSE_GROUPS);

/** Transactions of type "payment" use expense categories */
export const categoryTypeFor = (transactionType) => (transactionType === 'income' ? 'income' : 'expense');

function groupRank(type, groupName) {
  const index = groupsForType(type).indexOf(groupName);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Splits categories of a type into ordered groups: [{ groupName, categories }] */
export function groupCategories(categories, type) {
  const groups = new Map();
  for (const category of categories) {
    if (category.type !== type) continue;
    const groupName = category.group_name || FALLBACK_GROUP[type];
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(category);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => groupRank(type, a) - groupRank(type, b) || a.localeCompare(b, 'tr'))
    .map(([groupName, items]) => ({
      groupName,
      categories: items.sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'tr'),
      ),
    }));
}

/** Builds category name → group name lookups per type */
export function buildGroupLookup(categories) {
  const lookup = { income: new Map(), expense: new Map() };
  for (const category of categories) {
    lookup[category.type]?.set(category.name, category.group_name || FALLBACK_GROUP[category.type]);
  }
  return lookup;
}
