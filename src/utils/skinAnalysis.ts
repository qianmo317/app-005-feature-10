import type { SkinAnalysis } from '../types';

/** 变化方向：好转 / 变差 / 持平 */
export type ChangeDirection = 'improved' | 'worsened' | 'same';

export type MetricKey = 'oiliness' | 'moisture' | 'elasticity' | 'sensitivity';

export interface MetricComparison {
  key: MetricKey;
  label: string;
  current: string;
  previous?: string;
  direction: ChangeDirection;
}

export interface AnalysisComparison {
  analysis: SkinAnalysis;
  previous?: SkinAnalysis;
  /** 是否为该顾客的初次建档记录 */
  isFirst: boolean;
  /** 油脂 / 水分 / 弹性 / 敏感 四项对比 */
  metrics: MetricComparison[];
  /** 整体状况对比方向 */
  conditionDirection: ChangeDirection;
  conditionWorsened: boolean;
  /** 敏感度较上次加重 */
  sensitivityWorsened: boolean;
  /** 本次敏感度为「明显」 */
  sensitivityObvious: boolean;
  /** 本次是否属于变差记录（整体状况变差或敏感度加重） */
  isDecline: boolean;
}

export interface SkinAlert {
  /** 顾客列表是否打标：最近一次整体状况变差或敏感度变明显 */
  flagged: boolean;
  /** 从最近一次起连续变差的次数 */
  consecutiveDeclines: number;
  latest: AnalysisComparison;
}

/** 连续变差达到该次数即进入跟进名单 */
export const FOLLOW_UP_DECLINE_THRESHOLD = 2;

export const METRIC_LABELS: Record<MetricKey, string> = {
  oiliness: '油脂',
  moisture: '水分',
  elasticity: '弹性',
  sensitivity: '敏感',
};

/**
 * 各指标取值 -> 健康得分，分数越高越健康。
 * 油脂以「正常」为最佳，偏离即扣分；水分越高越好；
 * 弹性「良好」最佳；敏感度「无」最佳。
 */
const METRIC_SCORES: Record<MetricKey, Record<string, number>> = {
  oiliness: { 偏低: 1, 正常: 2, 偏高: 1 },
  moisture: { 偏低: 1, 正常: 2, 偏高: 3 },
  elasticity: { 需改善: 1, 一般: 2, 良好: 3 },
  sensitivity: { 明显: 1, 轻微: 2, 无: 3 },
};

/** 整体状况得分，分数越高越好 */
const CONDITION_SCORES: Record<string, number> = {
  较差: 1,
  需改善: 2,
  一般: 3,
  良好: 4,
};

const METRIC_KEYS: MetricKey[] = ['oiliness', 'moisture', 'elasticity', 'sensitivity'];

const compareScore = (current?: number, previous?: number): ChangeDirection => {
  if (current === undefined || previous === undefined || current === previous) {
    return 'same';
  }
  return current > previous ? 'improved' : 'worsened';
};

/** 按检测日期升序（同日按 id 稳定排序），用于确定「上一次」记录 */
const sortAsc = (analyses: SkinAnalysis[]): SkinAnalysis[] =>
  [...analyses].sort((a, b) => {
    const byDate = new Date(a.analysisDate).getTime() - new Date(b.analysisDate).getTime();
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });

const compareWithPrevious = (
  current: SkinAnalysis,
  previous?: SkinAnalysis
): AnalysisComparison => {
  const metrics: MetricComparison[] = METRIC_KEYS.map((key) => ({
    key,
    label: METRIC_LABELS[key],
    current: current[key],
    previous: previous?.[key],
    direction: compareScore(
      METRIC_SCORES[key][current[key]],
      previous ? METRIC_SCORES[key][previous[key]] : undefined
    ),
  }));

  const conditionDirection = compareScore(
    CONDITION_SCORES[current.skinCondition],
    previous ? CONDITION_SCORES[previous.skinCondition] : undefined
  );
  const conditionWorsened = conditionDirection === 'worsened';
  const sensitivityWorsened =
    metrics.find((m) => m.key === 'sensitivity')?.direction === 'worsened';
  const sensitivityObvious = current.sensitivity === '明显';

  return {
    analysis: current,
    previous,
    isFirst: !previous,
    metrics,
    conditionDirection,
    conditionWorsened,
    sensitivityWorsened,
    sensitivityObvious,
    isDecline: Boolean(previous) && (conditionWorsened || sensitivityWorsened),
  };
};

/**
 * 将某位顾客的皮肤分析记录与各自的上一次记录逐条对比，
 * 返回按日期倒序（最新在前）的对比结果。
 * 结果完全由传入数据派生，数据修改后重新调用即可得到最新对比。
 */
export const buildAnalysisComparisons = (
  analyses: SkinAnalysis[]
): AnalysisComparison[] => {
  const asc = sortAsc(analyses);
  return asc
    .map((analysis, index) =>
      compareWithPrevious(analysis, index > 0 ? asc[index - 1] : undefined)
    )
    .reverse();
};

/**
 * 计算某位顾客的皮肤预警信息：
 * - flagged：最近一次检测整体状况变差，或敏感度变明显（用于顾客列表打标）
 * - consecutiveDeclines：从最近一次起连续变差的次数（用于跟进名单）
 * 无检测记录时返回 null。
 */
export const getSkinAlert = (analyses: SkinAnalysis[]): SkinAlert | null => {
  if (analyses.length === 0) return null;

  const comparisons = buildAnalysisComparisons(analyses);
  const latest = comparisons[0];

  let consecutiveDeclines = 0;
  for (const comparison of comparisons) {
    if (!comparison.isDecline) break;
    consecutiveDeclines += 1;
  }

  return {
    flagged:
      latest.conditionWorsened ||
      latest.sensitivityWorsened ||
      latest.sensitivityObvious,
    consecutiveDeclines,
    latest,
  };
};
