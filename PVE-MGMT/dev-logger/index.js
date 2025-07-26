#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DevLogger {
    constructor() {
        this.logFile = path.join(__dirname, 'development-log.json');
        this.contextFile = path.join(__dirname, 'context.md');
        this.initLogFile();
    }

    initLogFile() {
        if (!fs.existsSync(this.logFile)) {
            const initialLog = {
                project: "PVE Manager",
                created: new Date().toISOString(),
                sessions: [],
                totalCommits: 0,
                lastActivity: new Date().toISOString()
            };
            fs.writeFileSync(this.logFile, JSON.stringify(initialLog, null, 2));
        }
    }

    getCurrentGitInfo() {
        try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: '/pve-manager' }).toString().trim();
            const commit = execSync('git rev-parse HEAD', { cwd: '/pve-manager' }).toString().trim();
            const status = execSync('git status --porcelain', { cwd: '/pve-manager' }).toString().trim();
            return { branch, commit, status };
        } catch (e) {
            return { branch: 'main', commit: 'initial', status: 'clean' };
        }
    }

    logActivity(action, details = {}) {
        const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        const timestamp = new Date().toISOString();
        const gitInfo = this.getCurrentGitInfo();

        const activity = {
            timestamp,
            action,
            details,
            git: gitInfo,
            sessionId: this.getSessionId()
        };

        // 添加到当前会话
        let currentSession = log.sessions.find(s => s.id === this.getSessionId());
        if (!currentSession) {
            currentSession = {
                id: this.getSessionId(),
                started: timestamp,
                activities: []
            };
            log.sessions.push(currentSession);
        }
        
        currentSession.activities.push(activity);
        currentSession.lastActivity = timestamp;
        log.lastActivity = timestamp;

        fs.writeFileSync(this.logFile, JSON.stringify(log, null, 2));
        console.log(`[DevLogger] ${action}: ${JSON.stringify(details)}`);
    }

    getSessionId() {
        return process.env.DEV_SESSION_ID || `session-${Date.now()}`;
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

## 注意事项
${context.notes || '无特殊注意事项'}
`;

        fs.writeFileSync(this.contextFile, contextData);
        this.logActivity('context_saved', { size: contextData.length });
    }

    autoCommit(message) {
        try {
            execSync('git add .', { cwd: '/pve-manager' });
            execSync(`git commit -m "${message}"`, { cwd: '/pve-manager' });
            this.logActivity('auto_commit', { message });
            
            const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
            log.totalCommits++;
            fs.writeFileSync(this.logFile, JSON.stringify(log, null, 2));
        } catch (e) {
            console.log('[DevLogger] Auto commit failed:', e.message);
        }
    }

    getProgress() {
        const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        return {
            totalSessions: log.sessions.length,
            totalActivities: log.sessions.reduce((acc, session) => acc + session.activities.length, 0),
            totalCommits: log.totalCommits,
            lastActivity: log.lastActivity,
            currentContext: fs.existsSync(this.contextFile) ? fs.readFileSync(this.contextFile, 'utf8') : null
        };
    }
}

// CLI 接口
if (require.main === module) {
    const logger = new DevLogger();
    const command = process.argv[2];
    const arg = process.argv[3];

    switch (command) {
        case 'log':
            logger.logActivity(arg || 'manual_log', { args: process.argv.slice(4) });
            break;
        case 'commit':
            logger.autoCommit(arg || 'Auto commit');
            break;
        case 'context':
            try {
                const context = JSON.parse(arg || '{}');
                logger.saveContext(context);
            } catch (e) {
                console.error('Invalid JSON context');
            }
            break;
        case 'progress':
            console.log(JSON.stringify(logger.getProgress(), null, 2));
            break;
        default:
            console.log('Usage: node index.js [log|commit|context|progress] [args...]');
    }
}

module.exports = DevLogger;