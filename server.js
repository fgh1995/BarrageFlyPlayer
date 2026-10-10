const Tag = 'server.js';
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { WebSocketClient, CMD } = require('./WebSocketClient');
const WebSocket = require('ws');
const { Client: DouyuClient } = require('douyudm');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const ADMIN_PASSWORD = "f360967847";
const douyuClients = {};
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
            socket.emit('system-message', {
                type: 'logAndtoast', // 或 'toast'
                level: 'error', // error, warning, info, success
                text: action + '需要管理员权限，请确认密码是否正确'
            });
            return false;
        }
        return true;
    }
    
    // 处理订阅请求 - 添加密码验证
    socket.on('subscribe', (data) => {
        if (!verifyPassword(data.password, "订阅任务")) return;

        console.log(Tag + '-收到订阅请求:', data);
        const douyuTaskIds = [];
        const otherTaskIds = [];

        data.taskIds.forEach(taskId => {
            if (!taskIds.includes(taskId)) {
                taskIds.push(taskId);
            }
            if (isDouyuRoomId(taskId)) {
                douyuTaskIds.push(taskId);
            } else {
                otherTaskIds.push(taskId);
            }
        });

        if (douyuTaskIds.length > 0) {
            douyuTaskIds.forEach(roomId => {
                createDouyuClient(roomId, socket);
            });
        }

        if (otherTaskIds.length > 0 && client) {
            client.requestChannel({
                taskIds: otherTaskIds.map(id => id.replace(/\[.*?\]/g, '').trim()),
                cmd: CMD.SUBSCRIBE
            });
        } else if (otherTaskIds.length > 0 && !client) {
            socket.emit('system-message', {
                type: 'logAndtoast',
                level: 'warning',
                text: '未连接到BarrageFly服务器'
            });
        }

        io.emit('current-subscriptions', taskIds);
    });
    
    // 处理取消订阅请求 - 添加密码验证
    socket.on('unsubscribe', (data) => {
        if (!verifyPassword(data.password, "取消订阅")) return;

        console.log('收到取消订阅请求:', data);
        const douyuTaskIds = [];
        const otherTaskIds = [];

        data.taskIds.forEach(taskId => {
            const index = taskIds.indexOf(taskId);
            if (index > -1) {
                taskIds.splice(index, 1);
            }
            if (isDouyuRoomId(taskId)) {
                douyuTaskIds.push(taskId);
            } else {
                otherTaskIds.push(taskId);
            }
        });

        if (douyuTaskIds.length > 0) {
            douyuTaskIds.forEach(roomId => {
                closeDouyuClient(roomId);
            });
        }

        if (otherTaskIds.length > 0 && client) {
            client.requestChannel({
                taskIds: otherTaskIds.map(id => id.replace(/\[.*?\]/g, '').trim()),
                cmd: CMD.UNSUBSCRIBE
            });
        }

        io.emit('current-subscriptions', taskIds);
    });
    
    // 处理关闭BarrageFly-WS连接 - 添加密码验证
    socket.on('close-barrage-fly-ws', (password) => {
        if (!verifyPassword(password, "断开BarrageFly连接")) return;
        socket.emit('system-message', {
            type: 'logAndtoast',
            level: 'info',
            text: '主动关闭BarrageFly-WebSocket连接:' + url
        });
        if (client) {
           client.destroy();
        }
        Object.keys(douyuClients).forEach(roomId => {
            closeDouyuClient(roomId);
        });
        isBarrageFlyWSConnect = false;
    });
    
    socket.on('open_setting', (password) => {
        if (!verifyPassword(password, "打开管理员设置")) return;
        socket.emit('system-message', {
            type: 'open_setting', // 或 'toast'
            level: 'success', // error, warning, info, success
            text: '密码验证成功，已打开管理员设置'
        });
    });
    
    // 处理设置BarrageFly-WS地址 - 添加密码验证
    socket.on('set-barrage-fly-ws', (barrageFlyWSUrl, password) => {
        if (!verifyPassword(password, "设置BarrageFly地址")) return;
        
        // 校验URL有效性
        if (!isValidWebSocketURL(barrageFlyWSUrl)) {
            console.error('无效的WebSocket URL:', barrageFlyWSUrl);
            socket.emit('system-message', {
                type: 'logAndtoast',
                level: 'warning', // error, warning, info, success
                text: '通信地址' + url + ' 格式无效，请使用 ws:// 或 wss:// 开头的地址'
            });
            return;
        }
        // 如果已有连接，先关闭
        if (client) {
           client.destroy();
        }
        url = barrageFlyWSUrl;
        console.log('连接BarrageFly-WS通信地址:' + url);
        //io.emit('status', '连接BarrageFly-WS通信地址:' + url);
        
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
                // 检查是否是频道日志
                if (msg.type === 'CHANNEL_LOG') {
                    // 将频道日志转发给前端
                    io.emit('channel-log', {
                        level: msg.level,
                        message: msg.message,
                        timestamp: new Date().toISOString(),
                        error: msg.error
                    });
                } else {
                    // 原有的系统消息处理
                    socket.emit('system-message', {
                        type: 'log',
                        level: 'info', // error, warning, info, success
                        text: msg.taskId || JSON.stringify(msg)
                    });
                }
            });
        })
        .onConnected(() => {
            io.emit('status', 'connected');
            socket.emit('system-message', {
                type: 'logAndtoast',
                level: 'success',
                text: '成功连接到BarrageFly服务器'
            });
            isBarrageFlyWSConnect = true;
            if (taskIds.length > 0) {
                const otherTaskIds = taskIds.filter(id => !isDouyuRoomId(id));
                if (otherTaskIds.length > 0) {
                    const pureTaskIds = otherTaskIds.map(id => id.replace(/\[.*?\]/g, '').trim());
                    client.requestChannel({
                        taskIds: pureTaskIds,
                        cmd: CMD.SUBSCRIBE
                    });
                    console.log('已重新订阅非斗鱼任务:', pureTaskIds);
                }
                const douyuTaskIds = taskIds.filter(id => isDouyuRoomId(id));
                douyuTaskIds.forEach(roomId => {
                    createDouyuClient(roomId, socket);
                });
                if (douyuTaskIds.length > 0) {
                    console.log('已重新订阅斗鱼任务:', douyuTaskIds);
                }
            }
        })
        .onClosed(() => {
            console.log('BarrageFly连接已关闭');
            io.emit('status', 'disconnected');
            socket.emit('system-message', {
                type: 'logAndtoast',
                level: 'error', // error, warning, info, success
                text: `BarrageFly连接已关闭`
            });
            client = null;
            isBarrageFlyWSConnect = false;
        });

        // 启动WebSocket客户端
        client.connect()
            .then((connectedClient) => {
                console.log('BarrageFly已连接');
            })
            .catch(err => {
                console.error('message:', err);
                socket.emit('system-message', {
                    type: 'logAndtoast',
                    level: 'error', // error, warning, info, success
                    text: `连接失败: ${err.message}`
                });
                client = null;
            });
    });
    
    // 处理设置直播流地址 - 添加密码验证
    socket.on('set-stream-url', (newStreamUrl, password) => {
        if (!verifyPassword(password, "保存直播流地址")) return;
        if(streamUrl === newStreamUrl) {
            socket.emit('system-message', {
                type: 'log',
                level: 'info', // error, warning, info, success
                text: '直播流地址未更改，无需保存'
            });
            return;
        }
        streamUrl = newStreamUrl;
            console.log('已更新直播流地址:', streamUrl);
            socket.emit('system-message', {
                type: 'logAndtoast',
                level: 'success', // error, warning, info, success
                text: '已保存新的直播流地址'
        });
    });
    
    socket.on('get-stream-url', () => {
        socket.emit('current-stream-url', streamUrl);
    });
}); // 这里缺少了 connection 事件的闭合大括号

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

function isDouyuRoomId(roomId) {
    return typeof roomId === 'string' && roomId.startsWith('斗鱼[') && roomId.endsWith(']');
}

function extractDouyuRoomId(roomId) {
    const match = roomId.match(/斗鱼\[(\d+)\]/);
    return match ? match[1] : null;
}

function createDouyuClient(roomId, socket) {
    const pureRoomId = extractDouyuRoomId(roomId);
    if (!pureRoomId) return null;

    if (douyuClients[roomId]) {
        return douyuClients[roomId];
    }

    const client = new DouyuClient(pureRoomId);

    client.on('connect', () => {
        console.log(`斗鱼房间 ${pureRoomId} 已连接`);
        io.emit('douyu-status', { roomId, status: 'connected' });
        io.emit('system-message', {
            type: 'logAndtoast',
            level: 'success',
            text: `斗鱼房间 ${roomId} 弹幕订阅成功`
        });
    });

    client.on('disconnect', () => {
        console.log(`斗鱼房间 ${pureRoomId} 已断开`);
        io.emit('douyu-status', { roomId, status: 'disconnected' });
        delete douyuClients[roomId];
    });

    client.on('error', (err) => {
        console.error(`斗鱼房间 ${pureRoomId} 错误:`, err);
        socket.emit('system-message', {
            type: 'logAndtoast',
            level: 'error',
            text: `斗鱼房间 ${pureRoomId} 错误: ${err.message}`
        });
    });

    client.on('chatmsg', (res) => {
        io.emit('message', {
            type: 'DANMU',
            roomId: roomId,
            platform: 'douyu',
            data: {
                username: res.nn,
                content: res.txt
            }
        });
    });

    client.run();
    douyuClients[roomId] = client;
    return client;
}

function closeDouyuClient(roomId) {
    if (douyuClients[roomId]) {
        douyuClients[roomId].close();
        delete douyuClients[roomId];
        console.log(`斗鱼房间 ${roomId} 已关闭`);
    }
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    if (client) {
        client.close();
    }
    Object.keys(douyuClients).forEach(roomId => {
        closeDouyuClient(roomId);
    });
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});

// 启动HTTP服务器
const PORT = process.env.PORT || 8601;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});