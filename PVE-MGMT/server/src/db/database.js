// 数据库连接和初始化
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class Database extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.dbPath = path.join(__dirname, '../../data/pve_manager.db');
    this.isReady = false;
    this.init();
  }

  init() {
    // 确保数据目录存在
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 创建数据库连接
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('数据库连接失败:', err.message);
      } else {
        console.log('数据库连接成功:', this.dbPath);
        // 同步等待表创建完成
        setTimeout(() => {
          this.createTables();
          this.isReady = true;
          this.emit('ready');
        }, 100);
      }
    });

    // 启用外键约束
    this.db.run('PRAGMA foreign_keys = ON');
  }

  createTables() {
    const statements = [
      // PVE连接表
      `CREATE TABLE IF NOT EXISTS pve_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 8006,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        realm TEXT NOT NULL DEFAULT 'pam',
        ssl BOOLEAN NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'disconnected',
        last_connected DATETIME,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 虚拟机表
      `CREATE TABLE IF NOT EXISTS virtual_machines (
        id TEXT PRIMARY KEY, -- connection_id-node-vmid
        connection_id TEXT NOT NULL,
        node TEXT NOT NULL,
        vmid INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL, -- qemu 或 lxc
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (connection_id) REFERENCES pve_connections(id) ON DELETE CASCADE,
        UNIQUE(connection_id, node, vmid)
      )`,

      // 流量统计表 - 当前数据
      `CREATE TABLE IF NOT EXISTS traffic_current (
        vm_key TEXT PRIMARY KEY, -- connection_id-node-vmid
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        node TEXT NOT NULL,
        vmid INTEGER NOT NULL,
        vmname TEXT NOT NULL,
        type TEXT NOT NULL,
        netin BIGINT NOT NULL DEFAULT 0,
        netout BIGINT NOT NULL DEFAULT 0,
        total BIGINT NOT NULL DEFAULT 0,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (connection_id) REFERENCES pve_connections(id) ON DELETE CASCADE
      )`,

      // 流量统计表 - 每小时数据
      `CREATE TABLE IF NOT EXISTS traffic_hourly (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vm_key TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        node TEXT NOT NULL,
        vmid INTEGER NOT NULL,
        vmname TEXT NOT NULL,
        type TEXT NOT NULL,
        hour TEXT NOT NULL, -- YYYY-MM-DD-HH
        netin BIGINT NOT NULL DEFAULT 0,
        netout BIGINT NOT NULL DEFAULT 0,
        total BIGINT NOT NULL DEFAULT 0,
        collections INTEGER NOT NULL DEFAULT 0,
        start_time DATETIME NOT NULL,
        last_update DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vm_key, hour),
        FOREIGN KEY (connection_id) REFERENCES pve_connections(id) ON DELETE CASCADE
      )`,

      // 流量统计表 - 每日数据
      `CREATE TABLE IF NOT EXISTS traffic_daily (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vm_key TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        node TEXT NOT NULL,
        vmid INTEGER NOT NULL,
        vmname TEXT NOT NULL,
        type TEXT NOT NULL,
        day TEXT NOT NULL, -- YYYY-MM-DD
        netin BIGINT NOT NULL DEFAULT 0,
        netout BIGINT NOT NULL DEFAULT 0,
        total BIGINT NOT NULL DEFAULT 0,
        collections INTEGER NOT NULL DEFAULT 0,
        start_time DATETIME NOT NULL,
        last_update DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vm_key, day),
        FOREIGN KEY (connection_id) REFERENCES pve_connections(id) ON DELETE CASCADE
      )`,

      // 告警表
      `CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL, -- critical, warning, info
        type TEXT NOT NULL, -- pve_system, performance, network, service
        status TEXT NOT NULL DEFAULT 'active', -- active, acknowledged, resolved
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source TEXT NOT NULL, -- 告警源：节点名、VM名等
        connection_id TEXT,
        connection_name TEXT,
        metadata TEXT, -- JSON格式的额外信息
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at DATETIME,
        acknowledged_by TEXT,
        resolved_at DATETIME,
        FOREIGN KEY (connection_id) REFERENCES pve_connections(id) ON DELETE CASCADE
      )`,

      // 创建索引
      'CREATE INDEX IF NOT EXISTS idx_traffic_hourly_hour ON traffic_hourly(hour)',
      'CREATE INDEX IF NOT EXISTS idx_traffic_hourly_vm ON traffic_hourly(vm_key)',
      'CREATE INDEX IF NOT EXISTS idx_traffic_daily_day ON traffic_daily(day)',
      'CREATE INDEX IF NOT EXISTS idx_traffic_daily_vm ON traffic_daily(vm_key)',
      'CREATE INDEX IF NOT EXISTS idx_virtual_machines_connection ON virtual_machines(connection_id)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_connection ON alerts(connection_id)'
    ];

    // 序列化执行所有SQL语句
    this.db.serialize(() => {
      let completed = 0;
      
      statements.forEach((sql, index) => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error(`创建表/索引失败 (${index}):`, err.message);
          }
          completed++;
          if (completed === statements.length) {
            console.log('数据库表创建完成');
          }
        });
      });
    });
  }

  // 获取数据库实例
  getInstance() {
    return this.db;
  }

  // 执行查询
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 执行单行查询
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 执行更新/插入
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  // 执行事务
  async transaction(operations) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        let completed = 0;
        const total = operations.length;
        
        const executeNext = (index) => {
          if (index >= total) {
            this.db.run('COMMIT', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
            return;
          }
          
          const operation = operations[index];
          this.db.run(operation.sql, operation.params || [], function(err) {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }
            executeNext(index + 1);
          });
        };
        
        executeNext(0);
      });
    });
  }

  // 关闭数据库连接
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('数据库连接已关闭');
          resolve();
        }
      });
    });
  }

  // 清理旧数据
  async cleanupOldData(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDayKey = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

    try {
      // 清理小时数据
      const hourResult = await this.run(
        'DELETE FROM traffic_hourly WHERE hour < ?',
        [cutoffDayKey + '-00']
      );

      // 清理日数据
      const dayResult = await this.run(
        'DELETE FROM traffic_daily WHERE day < ?',
        [cutoffDayKey]
      );

      console.log(`清理了 ${hourResult.changes} 条小时记录和 ${dayResult.changes} 条日记录`);
      return {
        hourlyDeleted: hourResult.changes,
        dailyDeleted: dayResult.changes
      };
    } catch (error) {
      console.error('清理旧数据失败:', error);
      throw error;
    }
  }
}

// 创建单例实例
const database = new Database();

module.exports = database;