# 更新日志 / Changelog

本文档记录了 PVE Manager 项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布] / [Unreleased]

### 新增 / Added
- 一键启动脚本（start.sh）
- 交互式项目配置向导
- 自动IP检测和配置
- 全局环境变量管理系统

### 变更 / Changed
- 改进的CORS配置支持动态IP
- 优化的构建和部署流程

### 修复 / Fixed
- 修复跨机器部署的网络配置问题
- 修复TypeScript编译错误
- 修复前端配置文件生成问题

## [1.0.0] - 2025-01-XX

### 新增 / Added
- **核心功能**
  - 多PVE连接管理
  - 虚拟机状态监控和控制
  - 实时系统资源监控
  - WebSocket实时通信

- **告警系统**
  - 多级别告警支持（严重/警告/信息）
  - 多类型告警（系统/性能/网络/服务）
  - 告警状态管理
  - 自动告警解决机制

- **流量监控**
  - 实时流量统计
  - 历史流量记录
  - 流量图表展示
  - 高级流量分析

- **用户界面**
  - 现代化React界面
  - 响应式设计
  - 暗黑/明亮主题切换
  - 国际化支持

- **部署支持**
  - Docker容器部署
  - 传统服务器部署
  - 详细的部署文档

### 技术特性 / Technical Features
- **前端**: React 18 + TypeScript + Ant Design
- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite
- **实时通信**: Socket.IO
- **构建工具**: Vite + TSC

### 文档 / Documentation
- 完整的README文档
- 部署指南
- Docker使用指南
- 安全部署指南
- API文档

---

## 版本说明 / Version Notes

### 版本格式
- **主版本号**：不兼容的API修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 变更类型
- **新增（Added）**：新功能
- **变更（Changed）**：对现有功能的变更
- **弃用（Deprecated）**：不久将移除的功能
- **移除（Removed）**：已移除的功能
- **修复（Fixed）**：任何bug修复
- **安全（Security）**：安全相关的修复