import React, { useMemo, useState } from 'react';
import {
  Table,
  Input,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Select,
  DatePicker,
  Row,
  Col,
  Avatar,
  List,
  message
} from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import { addCustomer, deleteCustomer } from '../../store';
import type { Customer } from '../../types';
import { formatDate, getStatusText, generateId, generateAvatar } from '../../utils/format';
import {
  getSkinAlert,
  FOLLOW_UP_DECLINE_THRESHOLD,
  type SkinAlert
} from '../../utils/skinAnalysis';
import dayjs from 'dayjs';

const CustomerList: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const state = useSelector((state: RootState) => state.app);
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // 每位顾客的皮肤预警均由检测数据实时派生，记录被修改后自动重算
  const skinAlerts = useMemo(() => {
    const map = new Map<string, SkinAlert>();
    state.customers.forEach((customer) => {
      const alert = getSkinAlert(
        state.skinAnalyses.filter((s) => s.customerId === customer.id)
      );
      if (alert) map.set(customer.id, alert);
    });
    return map;
  }, [state.customers, state.skinAnalyses]);

  // 连续变差达到阈值的顾客单独归入跟进名单
  const followUpCustomers = useMemo(
    () =>
      state.customers.filter(
        (c) =>
          (skinAlerts.get(c.id)?.consecutiveDeclines ?? 0) >= FOLLOW_UP_DECLINE_THRESHOLD
      ),
    [state.customers, skinAlerts]
  );

  const filteredCustomers = state.customers.filter(
    (c) =>
      c.name.includes(searchText) ||
      c.phone.includes(searchText)
  );

  const handleAdd = () => {
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const newCustomer: Customer = {
        id: generateId(),
        name: values.name,
        phone: values.phone,
        birthday: values.birthday ? dayjs(values.birthday).format('YYYY-MM-DD') : '',
        gender: values.gender,
        avatar: generateAvatar(values.name),
        address: values.address || '',
        skinType: values.skinType || '中性',
        notes: values.notes || '',
        createdAt: new Date().toISOString(),
      };
      dispatch(addCustomer(newCustomer));
      message.success('添加顾客成功');
      setIsModalOpen(false);
    } catch {
      // validation error
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该顾客吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        dispatch(deleteCustomer(id));
        message.success('删除成功');
      },
    });
  };

  const columns = [
    {
      title: '顾客',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, record: Customer) => {
        const alert = skinAlerts.get(record.id);
        const consecutiveDeclines = alert?.consecutiveDeclines ?? 0;
        return (
          <Space size={8} wrap>
            <Avatar src={record.avatar} />
            <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${record.id}`)}>
              {record.name}
            </span>
            {alert?.flagged &&
              (consecutiveDeclines >= FOLLOW_UP_DECLINE_THRESHOLD ? (
                <Tag color="red" icon={<WarningOutlined />}>
                  连续变差{consecutiveDeclines}次
                </Tag>
              ) : (
                <Tag color="orange">需关注</Tag>
              ))}
          </Space>
        );
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '肤质',
      dataIndex: 'skinType',
      key: 'skinType',
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '会员等级',
      key: 'membership',
      render: (_: unknown, record: Customer) => {
        const membership = state.memberships.find((m) => m.customerId === record.id);
        if (!membership) return <Tag>普通</Tag>;
        const levelColors: Record<string, string> = {
          bronze: 'orange',
          silver: 'default',
          gold: 'gold',
          platinum: 'cyan',
          diamond: 'geekblue',
        };
        return (
          <span className={`membership-badge ${membership.level}`}>
            {getStatusText(membership.level)}
          </span>
        );
      },
    },
    {
      title: '累计消费',
      key: 'totalSpent',
      render: (_: unknown, record: Customer) => {
        const membership = state.memberships.find((m) => m.customerId === record.id);
        return membership ? `¥${membership.totalSpent.toLocaleString()}` : '¥0';
      },
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => formatDate(date),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: Customer) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/customers/${record.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">顾客管理</h1>
          <p className="page-header-subtitle">共 {state.customers.length} 位顾客</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加顾客
        </Button>
      </div>

      {followUpCustomers.length > 0 && (
        <div className="card-wrapper" style={{ marginBottom: 16, borderLeft: '4px solid #ff4d4f' }}>
          <Space align="center" style={{ marginBottom: 8 }}>
            <WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>皮肤状况跟进名单</span>
            <Tag color="red">{followUpCustomers.length} 人</Tag>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              连续 {FOLLOW_UP_DECLINE_THRESHOLD} 次及以上检测变差，请优先跟进
            </span>
          </Space>
          <List
            dataSource={followUpCustomers}
            renderItem={(customer) => {
              const alert = skinAlerts.get(customer.id);
              return (
                <List.Item
                  key={customer.id}
                  style={{ padding: '8px 0' }}
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      onClick={() => navigate(`/customers/${customer.id}`)}
                    >
                      查看详情
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar src={customer.avatar} />}
                    title={
                      <Space size={8}>
                        <span>{customer.name}</span>
                        <Tag color="red">连续变差{alert?.consecutiveDeclines}次</Tag>
                      </Space>
                    }
                    description={
                      <span>
                        最近检测: {alert ? formatDate(alert.latest.analysis.analysisDate) : '-'}
                        {alert?.latest.sensitivityObvious && ' · 敏感度明显'}
                        {alert?.latest.conditionWorsened && ' · 整体状况变差'}
                        {' · '}电话 {customer.phone}
                      </span>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </div>
      )}

      <div className="search-bar">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Input
              placeholder="搜索顾客姓名或手机号"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              placeholder="会员等级"
              style={{ width: '100%' }}
              allowClear
              options={[
                { value: 'bronze', label: '青铜' },
                { value: 'silver', label: '白银' },
                { value: 'gold', label: '黄金' },
                { value: 'platinum', label: '铂金' },
                { value: 'diamond', label: '钻石' },
              ]}
            />
          </Col>
        </Row>
      </div>

      <div className="card-wrapper" style={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredCustomers}
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </div>

      <Modal
        title="添加顾客"
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        okText="确认"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="姓名"
                rules={[{ required: true, message: '请输入姓名' }]}
              >
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[{ required: true, message: '请输入手机号' }]}
              >
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="birthday" label="生日">
                <DatePicker style={{ width: '100%' }} placeholder="请选择生日" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="gender"
                label="性别"
                initialValue="female"
              >
                <Select
                  options={[
                    { value: 'female', label: '女' },
                    { value: 'male', label: '男' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="skinType" label="肤质" initialValue="中性">
                <Select
                  options={[
                    { value: '干性', label: '干性' },
                    { value: '油性', label: '油性' },
                    { value: '混合性', label: '混合性' },
                    { value: '中性', label: '中性' },
                    { value: '敏感肌', label: '敏感肌' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="address" label="地址">
                <Input placeholder="请输入地址" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerList;
