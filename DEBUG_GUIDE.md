# VSCode 调试配置指南

## 🚀 快速开始

按 **F5** 键即可开始调试！

## 📋 可用的调试配置

### 1. Debug Example File (推荐用于测试)
- **用途**: 调试简单的示例文件，验证调试配置是否正常工作
- **文件**: `debug_example.ts`
- **端口**: 3001
- **特点**: 简单的Express服务器，适合测试断点功能

### 2. Debug TypeScript (ts-node) (主要配置)
- **用途**: 直接调试TypeScript源码，无需编译
- **文件**: `src/index.ts`
- **端口**: 3000
- **特点**: 使用ts-node实时编译和调试

### 3. Debug Compiled JS
- **用途**: 调试编译后的JavaScript代码
- **文件**: `dist/index.js`
- **特点**: 会先自动运行构建任务，然后调试编译后的代码

### 4. Attach to Process
- **用途**: 附加到已运行的Node.js进程
- **端口**: 9229 (调试端口)
- **使用场景**: 当应用已经在运行时

### 5. Debug Test File
- **用途**: 调试当前打开的测试文件
- **特点**: 会调试当前活动的文件

## 🔧 使用步骤

### 方法一：使用F5快捷键
1. 在VSCode中打开项目
2. 按 **F5** 键
3. 选择调试配置（推荐先选择 "Debug Example File"）
4. 调试器会自动启动

### 方法二：使用调试面板
1. 点击左侧活动栏的调试图标 (🐛)
2. 在调试面板顶部选择调试配置
3. 点击绿色的播放按钮开始调试

## 🎯 设置断点

1. 在代码行号左侧点击设置断点（红色圆点）
2. 或者按 **F9** 在当前行设置断点
3. 推荐的断点位置：
   - `src/index.ts` 第173行：Webhook信号接收
   - `debug_example.ts` 第12行：调试测试端点

## 🔍 调试功能

- **变量检查**: 在调试时查看变量面板
- **调用堆栈**: 查看函数调用链
- **监视表达式**: 添加要监视的变量或表达式
- **调试控制台**: 在调试时执行代码

## 🌐 测试调试功能

### 测试示例文件
1. 选择 "Debug Example File" 配置
2. 按F5启动调试
3. 在浏览器访问: `http://localhost:3001/debug-test`
4. 观察断点是否被触发

### 测试主应用
1. 选择 "Debug TypeScript (ts-node)" 配置
2. 按F5启动调试
3. 在浏览器访问: `http://localhost:3000/health`
4. 或发送POST请求到: `http://localhost:3000/webhook/signal`

## 📝 环境变量

调试时会自动加载以下环境变量：
- `NODE_ENV=development`
- `USE_TEST_ENVIRONMENT=true`
- `USE_MOCK_MODE=true`
- `PORT=3000` (主应用) 或 `3001` (示例文件)

## 🛠️ 故障排除

### 如果调试无法启动：
1. 确保已安装所有依赖: `npm install`
2. 检查TypeScript是否正确安装: `npx tsc --version`
3. 确保ts-node可用: `npx ts-node --version`

### 如果断点不工作：
1. 确保源映射已启用（已在配置中启用）
2. 检查文件路径是否正确
3. 尝试重新启动调试会话

### 如果端口冲突：
1. 修改 `.env` 文件中的 `PORT` 值
2. 或在调试配置中修改端口号

## 📚 更多资源

- [VSCode Node.js 调试文档](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)
- [TypeScript 调试指南](https://code.visualstudio.com/docs/typescript/typescript-debugging)
