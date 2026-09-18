import React from 'react';
import { Tag, Tooltip } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  WarningOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import type { MetricTrend, TrendDirection } from '../utils/skinTrend';

/**
 * 皮肤检测趋势相关的展示组件。
 * 只接收 skinTrend.ts 现算出的数据，本身不做任何持久化。
 */

const DIRECTION_TEXT: Record<TrendDirection, string> = {
  better: '变好',
  worse: '变差',
  same: '持平',
};

const OverallTrendTag: React.FC<{ direction: TrendDirection | null }> = ({ direction }) => {
  if (direction === null) {
    return <Tag color="purple">初次建档</Tag>;
  }
  if (direction === 'better') {
    return (
      <Tag color="green" icon={<ArrowUpOutlined />}>
        整体变好
      </Tag>
    );
  }
  if (direction === 'worse') {
    return (
      <Tag color="red" icon={<ArrowDownOutlined />}>
        整体变差
      </Tag>
    );
  }
  return (
    <Tag icon={<MinusOutlined />}>整体持平</Tag>
  );
};

const MetricCell: React.FC<{ metric: MetricTrend }> = ({ metric }) => {
  // 头一回检测：没有上次数值，只标明初次建档
  if (metric.previous === null) {
    return (
      <div className="skin-metric">
        <span className="skin-metric-label">{metric.label}</span>
        <span className="skin-metric-value">{metric.current}</span>
        <Tooltip title="初次建档，暂无上次检测可对比">
          <span className="skin-metric-trend skin-metric-first">初次建档</span>
        </Tooltip>
      </div>
    );
  }

  const config = {
    better: { color: '#52c41a', icon: <ArrowUpOutlined />, className: 'better' },
    worse: { color: '#ff4d4f', icon: <ArrowDownOutlined />, className: 'worse' },
    same: { color: '#8c8c8c', icon: <MinusOutlined />, className: 'same' },
  }[metric.direction];

  return (
    <div className="skin-metric">
      <span className="skin-metric-label">{metric.label}</span>
      <span className="skin-metric-value">{metric.current}</span>
      <Tooltip
        title={`上次：${metric.previous} · ${DIRECTION_TEXT[metric.direction]}`}
      >
        <span className={`skin-metric-trend ${config.className}`} style={{ color: config.color }}>
          {config.icon}
          <span className="skin-metric-prev">{metric.previous}</span>
        </span>
      </Tooltip>
    </div>
  );
};

/** 顾客列表 / 跟进专区共用的警示标记 */
export const WarningTags: React.FC<{
  conditionWorse: boolean;
  sensitivityWorseToObvious: boolean;
}> = ({ conditionWorse, sensitivityWorseToObvious }) => (
  <>
    {conditionWorse && (
      <Tag color="volcano" icon={<WarningOutlined />}>
        状况变差
      </Tag>
    )}
    {sensitivityWorseToObvious && (
      <Tag color="red" icon={<AlertOutlined />}>
        敏感明显
      </Tag>
    )}
  </>
);

export { OverallTrendTag, MetricCell };
