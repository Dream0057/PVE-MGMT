#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class SimpleDevLogger {
    constructor() {
        this.logFile = path.join(__dirname, 'development-log.json');
        this.contextFile = path.join(__dirname, 'context.md');
        this.backupDir = path.join(__dirname, 'backups');
        this.initLogFile();
        this.ensureBackupDir();
    }

    initLogFile() {
        if (!fs.existsSync(this.logFile)) {
            const initialLog = {
                project: "PVE Manager",
                created: new Date().toISOString(),
                sessions: [],
                totalActivities: 0,
                lastActivity: new Date().toISOString(),
                version: "1.0.0"
            };
            fs.writeFileSync(this.logFile, JSON.stringify(initialLog, null, 2));
        }
    }

    ensureBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    getSessionId() {
        const now = new Date();
        return `session-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }

    logActivity(action, details = {}) {
        const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        const timestamp = new Date().toISOString();
        const sessionId = this.getSessionId();

        const activity = {
            id: `activity-${Date.now()}`,
            timestamp,
            action,
            details,
            sessionId
        };

        // 添加到当前会话
        let currentSession = log.sessions.find(s => s.id === sessionId);
        if (!currentSession) {
            currentSession = {
                id: sessionId,
                started: timestamp,
                activities: [],
                fileCount: 0,
                linesAdded: 0
            };
            log.sessions.push(currentSession);
        }
        
        currentSession.activities.push(activity);
        currentSession.lastActivity = timestamp;
        currentSession.fileCount = this.countProjectFiles();
        log.lastActivity = timestamp;
        log.totalActivities++;

        // 每10个活动备份一次
        if (log.totalActivities % 10 === 0) {
            this.createBackup();
        }

        fs.writeFileSync(this.logFile, JSON.stringify(log, null, 2));
        console.log(`[${timestamp}] ${action}: ${JSON.stringify(details)}`);
    }

    countProjectFiles() {
        try {
            const files = this.getFilesRecursively('/pve-manager');
            return files.filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.json')).length;
        } catch (e) {
            return 0;
        }
    }

    getFilesRecursively(dir) {
        let files = [];
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (item.startsWith('.') || item === 'node_modules') continue;
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    files = files.concat(this.getFilesRecursively(fullPath));
                } else {
                    files.push(fullPath);
                }
            }
        } catch (e) {
            // 忽略权限错误
        }
        return files;
    }

    saveContext(context) {
        const contextData = `# PVE Manager Development Context

## 最新更新时间
${new Date().toISOString()}

## 当前开发状态
${context.status || '开发中'}

## 已完成功能
${context.completed ? context.completed.map(item => `- ${item}`).join('\n') : '无'}

## 当前任务
${context.currentTask || '未指定'}

## 下一步计划
${context.nextSteps ? context.nextSteps.map(item => `- ${item}`).join('\n') : '无'}

## 技术栈
- 后端: Node.js + Express + TypeScript
- 前端: React + TypeScript + Vite  
- 数据库: SQLite (开发) + PostgreSQL (生产)
- 实时通信: Socket.IO

## 项目结构
\`\`\`
/pve-manager/
├── server/          # 后端服务
├── client/          # 前端应用
├── dev-logger/      # 开发记录系统
└── docs/           # 文档
\`\`\`

## 开发进度
- 项目初始化: ✅
- 架构设计: ✅
- 开发记录系统: ✅
- PVE API连接: ⏳
- 虚拟机管理: ⏳
- 资源监控: ⏳
- Web界面: ⏳

## 注意事项
${context.notes || '无特殊注意事项'}

## 重要文件
${context.importantFiles ? context.importantFiles.map(file => `- ${file}`).join('\n') : '无'}
`;

        fs.writeFileSync(this.contextFile, contextData);
        this.logActivity('context_saved', { size: contextData.length });
    }

    createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.backupDir, `log-backup-${timestamp}.json`);
        
        try {
            const logData = fs.readFileSync(this.logFile, 'utf8');
            fs.writeFileSync(backupFile, logData);
            console.log(`[DevLogger] Backup created: ${backupFile}`);
        } catch (e) {
            console.error('[DevLogger] Backup failed:', e.message);
        }
    }

    getProgress() {
        const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        const currentSession = log.sessions[log.sessions.length - 1];
        
        return {
            totalSessions: log.sessions.length,
            totalActivities: log.totalActivities,
            lastActivity: log.lastActivity,
            currentSession: currentSession ? {
                id: currentSession.id,
                activitiesCount: currentSession.activities.length,
                fileCount: currentSession.fileCount
            } : null,
            projectFiles: this.countProjectFiles(),
            currentContext: fs.existsSync(this.contextFile) ? fs.readFileSync(this.contextFile, 'utf8') : null
        };
    }

    generateReport() {
        const progress = this.getProgress();
        const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        
        const report = `# PVE Manager 开发报告

生成时间: ${new Date().toISOString()}

## 总体进度
- 开发会话总数: ${progress.totalSessions}
- 活动总数: ${progress.totalActivities}
- 项目文件数: ${progress.projectFiles}
- 最后活动: ${progress.lastActivity}

## 会话历史
${log.sessions.map(session => `
### ${session.id}
- 开始时间: ${session.started}
- 活动数量: ${session.activities.length}
- 最后活动: ${session.lastActivity || session.started}
`).join('')}

## 最近活动
${log.sessions.slice(-1)[0]?.activities.slice(-5).map(activity => `
- ${activity.timestamp}: ${activity.action} ${JSON.stringify(activity.details)}
`).join('') || '无活动'}
`;

        const reportFile = path.join(__dirname, `report-${new Date().toISOString().split('T')[0]}.md`);
        fs.writeFileSync(reportFile, report);
        return reportFile;
    }
}

// CLI 接口
if (require.main === module) {
    const logger = new SimpleDevLogger();
    const command = process.argv[2];
    const arg = process.argv[3];

    switch (command) {
        case 'log':
            logger.logActivity(arg || 'manual_log', { args: process.argv.slice(4) });
            break;
        case 'context':
            try {
                const context = arg ? JSON.parse(arg) : {};
                logger.saveContext(context);
            } catch (e) {
                console.error('Invalid JSON context');
            }
            break;
        case 'progress':
            console.log(JSON.stringify(logger.getProgress(), null, 2));
            break;
        case 'report':
            const reportFile = logger.generateReport();
            console.log(`Report generated: ${reportFile}`);
            break;
        case 'backup':
            logger.createBackup();
            break;
        default:
            console.log('Usage: node simple-logger.js [log|context|progress|report|backup] [args...]');
    }
}

module.exports = SimpleDevLogger;