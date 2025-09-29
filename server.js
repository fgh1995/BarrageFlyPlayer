const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { WebSocketClient, CMD } = require('./WebSocketClient');
const WebSocket = require('ws');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const ADMIN_PASSWORD = "f360967847"; // 默认管理员密码
// 静态文件服务
app.use(express.static('public'));

// 初始化变量
let url = '';
let taskIds = [];
let streamUrl = '';
let client = null; // 正确初始化为 null
let isBarrageFlyWSConnect = false;
// Socket.io连接处理
io.on('connection', (socket) => {
    console.log('前端客户端已连接');
    
    // 发送当前订阅的任务ID列表给新连接的客户端
    socket.emit('current-subscriptions', taskIds);
    socket.emit('current-barrage-fly-ws-connect', isBarrageFlyWSConnect, url);
    socket.emit('current-ws-url',url);
    // 添加密码验证函数
    function verifyPassword(password, action) {
        if (password !== ADMIN_PASSWORD) {
            socket.emit('system-message', `错误: ${action} 需要管理员权限，密码错误`);
            return false;
        }
        return true;
    }
    
    // 处理订阅请求 - 添加密码验证
    socket.on('subscribe', (data) => {
        if (!verifyPassword(data.password, "订阅任务")) return;
        
        console.log('收到订阅请求:', data);
        
        // 添加新的任务ID到列表（避免重复），保存带备注的数据
        data.taskIds.forEach(taskId => {
            if (!taskIds.includes(taskId)) {
                taskIds.push(taskId);
            }
        });
        
        // 发送订阅请求到WebSocket服务器（使用纯ID）
        if (client) {
            client.requestChannel({
                taskIds: data.pureTaskIds || data.taskIds.map(id => id.replace(/\[.*?\]/g, '').trim()),
                cmd: CMD.SUBSCRIBE
            });
            socket.emit('system-message', `添加订阅任务: ${data.taskIds.join(', ')}`);
        } else {
            socket.emit('system-message', '错误: 未连接到BarrageFly服务器');
        }
        
        // 广播更新后的订阅列表给所有客户端
        io.emit('current-subscriptions', taskIds);
    });
    
    // 处理取消订阅请求 - 添加密码验证
    socket.on('unsubscribe', (data) => {
        if (!verifyPassword(data.password, "取消订阅")) return;
        
        console.log('收到取消订阅请求:', data);
        
        // 从任务ID列表中移除（使用带备注的完整ID）
        data.taskIds.forEach(taskId => {
            const index = taskIds.indexOf(taskId);
            if (index > -1) {
                taskIds.splice(index, 1);
            }
        });
        
        // 发送取消订阅请求到WebSocket服务器（使用纯ID）
        if (client) {
            client.requestChannel({
                taskIds: data.pureTaskIds || data.taskIds.map(id => id.replace(/\[.*?\]/g, '').trim()),
                cmd: CMD.UNSUBSCRIBE
            });
            socket.emit('system-message', `取消订阅任务: ${data.taskIds.join(', ')}`);
        } else {
            socket.emit('system-message', '错误: 未连接到BarrageFly服务器');
        }
        
        // 广播更新后的订阅列表给所有客户端
        io.emit('current-subscriptions', taskIds);
    });
    
    // 处理关闭BarrageFly-WS连接 - 添加密码验证
    socket.on('close-barrage-fly-ws', (password) => {
        if (!verifyPassword(password, "断开BarrageFly连接")) return;
        
        console.log('主动关闭BarrageFly-WebSocket连接:' + url);
        socket.emit('system-message', '主动关闭BarrageFly-WebSocket连接:' + url);
        if (client) {
           client.destroy();
        }
        isBarrageFlyWSConnect = false;
    });
    socket.on('verify-admin-password', (password) => {
        const isValid = password === ADMIN_PASSWORD;
        socket.emit('admin-password-result', { success: isValid });
        
        if (isValid) {
            console.log('管理员密码验证成功');
            socket.emit('system-message', '管理员密码验证成功');
        } else {
            console.log('管理员密码验证失败');
            socket.emit('system-message', '管理员密码错误');
        }
    });
    // 处理设置BarrageFly-WS地址 - 添加密码验证
    socket.on('set-barrage-fly-ws', (barrageFlyWSUrl, password) => {
        if (!verifyPassword(password, "设置BarrageFly地址")) return;
        
        // 校验URL有效性
        if (!isValidWebSocketURL(barrageFlyWSUrl)) {
            console.error('无效的WebSocket URL:', barrageFlyWSUrl);
            io.emit('status', '错误: 无效的WebSocket URL格式');
            io.emit('system-message', 'barrageFly-WebSocket通信地址格式无效，请使用 ws:// 或 wss:// 开头的地址');
            return;
        }
        // 如果已有连接，先关闭
        if (client) {
           client.destroy();
        }
        url = barrageFlyWSUrl;
        console.log('连接BarrageFly-WS通信地址:' + url);
        io.emit('status', '连接BarrageFly-WS通信地址:' + url);
        
        // 创建WebSocket客户端
        client = new WebSocketClient({
            url,
            wsCreator: (url) => {
                return new WebSocket(url);
            }
        })
        .onMsg((msgs) => {
            msgs.forEach(msg => {
                msg = msg.data;
                const msgDto = msg.msg;
                const roomId = msg.roomId;
                
                // 转发消息给所有连接的客户端
                io.emit('message', {
                    type: msg.type,
                    roomId: roomId,
                    platform: msg.platform,
                    data: msgDto
                });
            });
        })
        .onSystemMsg((msgs) => {
            msgs.forEach(msg => {
                io.emit('system-message', msg.taskId);
            });
        })
        .onConnected(() => {
            console.log('BarrageFly连接建立成功');
            io.emit('status', 'connected');
            io.emit('system-message', '成功连接到BarrageFly服务器');
            isBarrageFlyWSConnect = true;
            // 重新订阅所有任务
            if (taskIds.length > 0) {
                const pureTaskIds = taskIds.map(id => id.replace(/\[.*?\]/g, '').trim());
                client.requestChannel({
                    taskIds: pureTaskIds,
                    cmd: CMD.SUBSCRIBE
                });
                console.log('已重新订阅所有任务:', pureTaskIds);
            }
        })
        .onClosed(() => {
            console.log('BarrageFly连接已关闭');
            io.emit('status', 'disconnected');
            io.emit('system-message', 'BarrageFly连接已关闭');
            isBarrageFlyWSConnect = false;
        });

        // 启动WebSocket客户端
        client.connect()
            .then((connectedClient) => {
                console.log('WebSocket客户端已连接');
            })
            .catch(err => {
                console.error('连接失败:', err);
                io.emit('system-message', `连接失败: ${err.message}`);
                client = null;
            });
    });
    
    // 处理设置直播流地址 - 添加密码验证
    socket.on('set-stream-url', (newStreamUrl, password) => {
        if (!verifyPassword(password, "设置直播流地址")) return;
        
        streamUrl = newStreamUrl;
        console.log('保存直播流地址:' + streamUrl);
        socket.emit('system-message', `直播流地址已设置为: ${streamUrl}`);
    });
    socket.on('get-stream-url', () => {
        socket.emit('current-stream-url', streamUrl);
    });
    
});

// URL有效性校验函数
function isValidWebSocketURL(url) {
    if (typeof url !== 'string' || !url.trim()) {
        return false;
    }
    
    // 检查是否以 ws:// 或 wss:// 开头
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        return false;
    }
    
    // 基本格式检查
    try {
        const urlObj = new URL(url);
        
        // 检查主机名
        if (!urlObj.hostname) {
            return false;
        }
        
        // 检查端口（如果有的话）
        if (urlObj.port) {
            const port = parseInt(urlObj.port);
            if (isNaN(port) || port < 1 || port > 65535) {
                return false;
            }
        }
        
        return true;
    } catch (error) {
        return false;
    }
}
// 优雅关闭
process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    if (client) {
        client.close();
    }
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});

// 启动HTTP服务器
const PORT = process.env.PORT || 8501;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});