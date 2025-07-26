# 贡献指南 / Contributing Guide

感谢您对 PVE Manager 项目的关注！我们欢迎所有形式的贡献。

## 如何贡献

### 🐛 报告问题
- 使用 [GitHub Issues](../../issues) 报告bug
- 请提供详细的复现步骤
- 包含系统环境信息（OS、Node.js版本等）

### 💡 功能建议
- 通过 Issues 提交功能请求
- 清楚描述建议的功能和用例
- 欢迎提供设计思路或示例

### 🔧 代码贡献

#### 开发环境设置
```bash
# 克隆项目
git clone https://github.com/your-username/pve-manager.git
cd pve-manager

# 安装依赖并启动
./start.sh
```

#### 提交规范
- 遵循 [Conventional Commits](https://conventionalcommits.org/) 规范
- 格式：`type(scope): description`
- 示例：
  ```
  feat(ui): add dark mode support
  fix(api): resolve connection timeout issue
  docs(readme): update installation guide
  ```

#### Pull Request 流程
1. Fork 项目到您的账户
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m "feat: add your feature"`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

#### 代码规范
- 使用 TypeScript
- 遵循项目现有的代码风格
- 添加适当的注释
- 确保测试通过：`npm test`
- 运行lint检查：`npm run lint`

### 📖 文档贡献
- 改进README、API文档或其他文档
- 修正错别字或语法错误
- 翻译文档到其他语言

## 开发指南

### 项目结构
```
pve-manager/
├── client/          # React前端
├── server/          # Node.js后端  
├── docs/           # 项目文档
└── docker/         # Docker配置
```

### 技术栈
- **前端**: React + TypeScript + Ant Design
- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite
- **实时通信**: Socket.IO

### 测试
```bash
# 运行单元测试
npm test

# 运行集成测试
npm run test:integration

# 测试覆盖率
npm run test:coverage
```

## 社区准则

### 行为规范
- 保持友善和专业
- 尊重不同观点
- 建设性地提供反馈
- 帮助新手贡献者

### 支持渠道
- GitHub Issues：报告问题和功能请求
- GitHub Discussions：一般讨论和问答
- 项目文档：查看详细文档

## 许可证

通过贡献代码，您同意您的贡献将基于 [MIT License](LICENSE) 许可。

---

再次感谢您的贡献！每一个贡献都让这个项目变得更好。🚀