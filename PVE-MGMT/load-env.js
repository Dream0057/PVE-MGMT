#!/usr/bin/env node

// 环境变量加载脚本
// Environment variable loader script

const fs = require('fs');
const path = require('path');

// 加载全局环境变量配置
function loadGlobalEnv() {
  const globalEnvPath = path.join(__dirname, '.env.global');
  
  if (fs.existsSync(globalEnvPath)) {
    require('dotenv').config({ path: globalEnvPath });
    console.log('✓ 已加载全局环境配置: .env.global');
    
    // 显示关键配置信息
    if (process.env.API_HOST) {
      console.log(`  API地址: http://${process.env.API_HOST}:${process.env.SERVER_PORT || 3000}`);
    }
    if (process.env.NODE_ENV) {
      console.log(`  运行环境: ${process.env.NODE_ENV}`);
    }
  } else {
    console.log('⚠ 未找到全局环境配置文件，使用默认配置');
    console.log('  运行 ./start.sh --init 进行初始化配置');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  loadGlobalEnv();
} else {
  // 如果被其他模块引用，自动执行加载
  loadGlobalEnv();
}

module.exports = { loadGlobalEnv };