// 调试示例文件 - 用于测试VSCode调试配置
import express from 'express';

const app = express();
const port = 3001; // 使用不同的端口避免冲突

// 简单的中间件
app.use(express.json());

// 测试路由
app.get('/debug-test', (req, res) => {
  // 🔴 在这里设置断点测试调试功能
  const message = 'Debug test endpoint';
  const timestamp = new Date().toISOString();
  
  console.log(`Debug test called at ${timestamp}`);
  
  // 一些变量用于调试检查
  const testData = {
    message,
    timestamp,
    environment: process.env.NODE_ENV,
    port: port,
    headers: req.headers,
    query: req.query
  };
  
  res.json(testData);
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 Debug test server running on port ${port}`);
  console.log(`📍 Test endpoint: http://localhost:${port}/debug-test`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
