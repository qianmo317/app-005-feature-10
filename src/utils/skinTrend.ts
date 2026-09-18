import type { SkinAnalysis } from '../types';

/**
 * 皮肤检测趋势对比引擎（纯函数）。
 *
 * 所有对比结果都在渲染时从 skinAnalyses 现算，不入库、不缓存：
 * 检测记录被新增 / 修改 / 删除后，引用的组件会重新执行本模块逻辑，
 * 变化方向、警示标记、连续变差跟进名单都会跟着重算。
 */

export type TrendDirection = 'better' | 'worse' | 'same';

export type SkinMetricKey =
  | 'oiliness'
  | 'moisture'
  | 'elasticity'
  | 'sensitivity'
  | 'skinCondition';

export interface MetricTrend {
  key: SkinMetricKey;
  label: string;
  /** 本次文案 */
  current: string;
  /** 上次文案（初次建档时为 null） */
  previous: string | null;
  direction: TrendDirection;
}

export interface RecordTrend {
  record: SkinAnalysis;
  /** 上一次检测记录（按日期升序的前一条），初次建档时为 null */
  previous: SkinAnalysis | null;
  isFirst: boolean;
  metrics: MetricTrend[];
  /** 本次油脂/水分/弹性/敏感度四项综合分（不含整体状况） */
  compositeScore: number;
  previousCompositeScore: number | null;
  /** 四项综合分相比上次的走向，初次建档时为 null */
  overall: TrendDirection | null;
  /** 本次“整体状况”相比上次变差 */
  conditionWorse: boolean;
  /** 本次敏感度变差，且本次已达到“明显” */
  sensitivityWorseToObvious: boolean;
}

export interface CustomerSkinStatus {
  customerId: string;
  /** 最近一次检测记录（按日期最新） */
  latest: SkinAnalysis | null;
  latestTrend: RecordTrend | null;
  /** 最近一次检测整体状况变差，或敏感度升至明显 */
  warning: boolean;
  /** 截至最近一次，检测综合分连续变差的次数（相邻两次算一次） */
  decliningStreak: number;
  /** 连续变差次数 >= 2，需要单独跟进 */
  followUp: boolean;
  conditionWorse: boolean;
  sensitivityWorseToObvious: boolean;
}

/**
 * 各检测项文案 -> 分值。分值越高代表皮肤状态越好。
 * 油脂以“正常”为最佳，偏低、偏高同为异常（同分，互相切换算持平）。
 */
const METRIC_LEVELS: Record<SkinMetricKey, { label: string; scores: Record<string, number> }> = {
  oiliness: { label: '油脂', scores: { 偏低: 1, 正常: 2, 偏高: 1 } },
  moisture: { label: '水分', scores: { 偏低: 0, 正常: 1, 偏高: 2 } },
  elasticity: { label: '弹性', scores: { 需改善: 0, 一般: 1, 良好: 2 } },
  sensitivity: { label: '敏感度', scores: { 明显: 0, 轻微: 1, 无: 2 } },
  skinCondition: { label: '整体状况', scores: { 较差: 0, 需改善: 1, 一般: 2, 良好: 3 } },
};

/** 计入综合分的四项检测指标（整体状况单独看，不计入综合分） */
const COMPOSITE_KEYS: SkinMetricKey[] = ['oiliness', 'moisture', 'elasticity', 'sensitivity'];

export const METRIC_KEYS = Object.keys(METRIC_LEVELS) as SkinMetricKey[];

export const getMetricLabel = (key: SkinMetricKey): string => METRIC_LEVELS[key].label;

const scoreOf = (key: SkinMetricKey, value: string): number =>
  METRIC_LEVELS[key].scores[value] ?? 0;

const compareDirection = (currentScore: number, previousScore: number): TrendDirection => {
  if (currentScore > previousScore) return 'better';
  if (currentScore < previousScore) return 'worse';
  return 'same';
};

/** 同一顾客的检测记录按检测日期升序排列（日期相同时按记录 id 兜底，保证顺序稳定） */
export const sortAnalysesChronologically = (analyses: SkinAnalysis[]): SkinAnalysis[] =>
  [...analyses].sort((a, b) => {
    const diff = new Date(a.analysisDate).getTime() - new Date(b.analysisDate).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

/** 油脂/水分/弹性/敏感度四项综合分（0 - 8） */
export const compositeScore = (record: SkinAnalysis): number =>
  COMPOSITE_KEYS.reduce((sum, key) => sum + scoreOf(key, record[key] as string), 0);

const buildMetricTrend = (
  key: SkinMetricKey,
  record: SkinAnalysis,
  previous: SkinAnalysis | null
): MetricTrend => {
  const current = record[key] as string;
  const previousValue = previous ? (previous[key] as string) : null;
  return {
    key,
    label: METRIC_LEVELS[key].label,
    current,
    previous: previousValue,
    direction: previousValue === null ? 'same' : compareDirection(scoreOf(key, current), scoreOf(key, previousValue)),
  };
};

/** 计算单条记录相对上一条的各项变化 */
export const buildRecordTrend = (
  record: SkinAnalysis,
  previous: SkinAnalysis | null
): RecordTrend => {
  const metrics = METRIC_KEYS.map((key) => buildMetricTrend(key, record, previous));
  const sensitivityMetric = metrics.find((m) => m.key === 'sensitivity')!;
  const conditionMetric = metrics.find((m) => m.key === 'skinCondition')!;
  const score = compositeScore(record);
  const previousScore = previous ? compositeScore(previous) : null;

  return {
    record,
    previous,
    isFirst: previous === null,
    metrics,
    compositeScore: score,
    previousCompositeScore: previousScore,
    overall: previousScore === null ? null : compareDirection(score, previousScore),
    conditionWorse: conditionMetric.direction === 'worse',
    sensitivityWorseToObvious:
      sensitivityMetric.direction === 'worse' && sensitivityMetric.current === '明显',
  };
};

/** 计算同一顾客全部记录的趋势（按日期升序返回，列表展示时自行倒序） */
export const buildCustomerTrends = (records: SkinAnalysis[]): RecordTrend[] => {
  const sorted = sortAnalysesChronologically(records);
  return sorted.map((record, index) => buildRecordTrend(record, index > 0 ? sorted[index - 1] : null));
};

/** 顾客级别的皮肤状态汇总：最近一次检测的警示标记 + 连续变差跟进判定 */
export const getCustomerSkinStatus = (records: SkinAnalysis[]): CustomerSkinStatus | null => {
  if (records.length === 0) return null;
  const trends = buildCustomerTrends(records);
  const latestTrend = trends[trends.length - 1];

  // 从最近一次往前数连续“综合分变差”的次数
  let decliningStreak = 0;
  for (let i = trends.length - 1; i > 0; i--) {
    if (trends[i].overall === 'worse') {
      decliningStreak += 1;
    } else {
      break;
    }
  }

  return {
    customerId: latestTrend.record.customerId,
    latest: latestTrend.record,
    latestTrend,
    warning: latestTrend.conditionWorse || latestTrend.sensitivityWorseToObvious,
    decliningStreak,
    followUp: decliningStreak >= 2,
    conditionWorse: latestTrend.conditionWorse,
    sensitivityWorseToObvious: latestTrend.sensitivityWorseToObvious,
  };
};

/** 批量计算所有顾客的皮肤状态，key 为 customerId */
export const getAllCustomerSkinStatuses = (
  analyses: SkinAnalysis[]
): Map<string, CustomerSkinStatus> => {
  const grouped = new Map<string, SkinAnalysis[]>();
  analyses.forEach((item) => {
    const list = grouped.get(item.customerId);
    if (list) {
      list.push(item);
    } else {
      grouped.set(item.customerId, [item]);
    }
  });

  const result = new Map<string, CustomerSkinStatus>();
  grouped.forEach((list, customerId) => {
    const status = getCustomerSkinStatus(list);
    if (status) result.set(customerId, status);
  });
  return result;
};
