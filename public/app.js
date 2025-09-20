// 配置信息
const config = {
    url: "ws://localhost:9898",
    currentTaskIds: [] // 当前管理的任务ID
};

// 状态变量
let danmuCount = 0;
let messageCount = 0;
let danmuSpeed = 150; // px/s
let danmuOpacity = 0.8;
let fontSize = 20;
let danmuVisible = true;

// 弹幕轨道管理
const danmuTracks = {
    total: 8, // 总共8个轨道
    occupied: new Array(8).fill(false),
    lastUseTime: new Array(8).fill(0)
};

// DOM元素
let danmuContainer, messageLog, connectionStatus, danmuCountElement,roomCountElement,serverUrlElement,streamUrlElement,barrageflyWsInput,barrageflyWsSetBtn;
let speedControl, speedValue, opacityControl, opacityValue, fontSizeControl;
let clearBtn, clearLogBtn, toggleDanmuBtn, playBtn, pauseBtn, streamUrlInput, trackCountElement;

// 视频播放器变量
let dp = null;

// 初始化Socket.io连接
let socket = null;

// 初始化
function init() {
    initializeDOMElements();
    setupEventListeners();
    initializeSocket();
    initializeVideoPlayer();
    updateTrackCount();
}

// 初始化DOM元素
function initializeDOMElements() {
    danmuContainer = document.getElementById('danmu-container');
    messageLog = document.getElementById('message-log');
    connectionStatus = document.getElementById('connection-status');
    danmuCountElement = document.getElementById('danmu-count');
    roomCountElement = document.getElementById('room-count');
    speedControl = document.getElementById('speed-control');
    speedValue = document.getElementById('speed-value');
    opacityControl = document.getElementById('opacity-control');
    opacityValue = document.getElementById('opacity-value');
    fontSizeControl = document.getElementById('font-size-control');
    clearBtn = document.getElementById('clear-btn');
    clearLogBtn = document.getElementById('clear-log-btn');
    toggleDanmuBtn = document.getElementById('toggle-danmu-btn');
    playBtn = document.getElementById('play-btn');
    pauseBtn = document.getElementById('pause-btn');
    streamUrlInput = document.getElementById('stream-url');
    trackCountElement = document.getElementById('track-count');
    taskIdInput = document.getElementById('task-id-input');
    taskIdList = document.getElementById('task-id-list');
    addTaskBtn = document.getElementById('add-task-btn');
    removeTaskBtn = document.getElementById('remove-task-btn');
    taskIdsElement = document.getElementById('task-ids');
    serverUrlElement = document.getElementById('server-url');
    streamUrlElement = document.getElementById('stream-url');
    fullScreenDanmuBtn = document.getElementById('full-screen-danmu');
    halfScreenDanmuBtn = document.getElementById('half-screen-danmu');
    thirdScreenDanmuBtn = document.getElementById('third-screen-danmu');
    barrageflyWsInput = document.getElementById('barragefly-ws-address-input');
    barrageflyWsSetBtn = document.getElementById('barragefly-ws-address-set-btn');
}

// 初始化Socket连接
function initializeSocket() {
    socket = io();
    setupSocketListeners();
}

// 初始化视频播放器 - 使用DPlayer
function initializeVideoPlayer() {
    try {
        dp = new DPlayer({
            container: document.getElementById('dplayer'),
            screenshot: true,
            video: {
                url: '',
                type: 'auto'
            },
            contextmenu: [
                {
                    text: '弹幕设置',
                    click: () => {
                        document.querySelector('.controls').scrollIntoView({ behavior: 'smooth' });
                    }
                }
            ]
        });
        
        // 监听全屏变化
        dp.on('fullscreen', () => {
            adjustDanmuForFullscreen();
        });
        
        dp.on('fullscreen_cancel', () => {
            adjustDanmuForFullscreen();
        });
        
        // 播放器事件
        dp.on('play', () => {
            if (playBtn && pauseBtn) {
                playBtn.style.display = 'none';
                pauseBtn.style.display = 'block';
            }
        });
        
        dp.on('pause', () => {
            if (playBtn && pauseBtn) {
                playBtn.style.display = 'block';
                pauseBtn.style.display = 'none';
            }
        });
        
        dp.on('error', (error) => {
            addSystemMessage(`播放错误: ${error.message || '未知错误'}`);
        });
        
        console.log('DPlayer初始化成功');
    } catch (error) {
        console.error('DPlayer初始化失败:', error);
        addSystemMessage('播放器初始化失败，请刷新页面重试');
    }
}

// 调整弹幕全屏适配
function adjustDanmuForFullscreen() {
    document.getElementById('dplayer').appendChild(danmuContainer);
    
}
function extractTaskId(fullTaskId) {
    // 从 "1968471452816072704[抖音]" 中提取 "1968471452816072704"
    return fullTaskId.replace(/\[.*?\]/g, '').trim();
}
let isBarrageFlyWSConnect = false;
// 设置事件监听
function setupEventListeners() {
    if (!speedControl || !opacityControl || !fontSizeControl) {
        console.error('控件元素未找到');
        return;
    }
    // 设置Barrage-Fly-WS通信地址
     if (barrageflyWsSetBtn) {
        barrageflyWsSetBtn.addEventListener('click', () => {
            if(!isBarrageFlyWSConnect){
                const input = barrageflyWsInput.value.trim();
                if (!input) {
                    addSystemMessage('请输入BarrageFly-WS通信地址');
                    return;
                }
                if (!isValidWebSocketURL(input)){
                    addSystemMessage('barrageFly-WebSocket通信地址格式无效，请使用 ws:// 或 wss:// 开头的地址');
                    return;
                }
                if (!socket) return;
                socket.emit('set-barrage-fly-ws',input);
                isBarrageFlyWSConnect = true;
                barrageflyWsSetBtn.textContent = '断开';
            }else {
                socket.emit('close-barrage-fly-ws');
                isBarrageFlyWSConnect = false;
                barrageflyWsSetBtn.textContent = '连接';
            }
        });
    }
    // 速度控制
    speedControl.addEventListener('input', (e) => {
        danmuSpeed = parseInt(e.target.value);
        if (speedValue) {
            speedValue.textContent = danmuSpeed;
        }
    });
    
    // 透明度控制
    opacityControl.addEventListener('input', (e) => {
        danmuOpacity = parseFloat(e.target.value);
        if (opacityValue) {
            opacityValue.textContent = danmuOpacity.toFixed(1);
        }
    });
    
    // 字体大小控制
    fontSizeControl.addEventListener('change', (e) => {
        fontSize = parseInt(e.target.value);
    });
    
    // 清空弹幕
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (danmuContainer) {
                danmuContainer.innerHTML = '';
            }
            danmuCount = 0;
            updateCounters();
            resetTracks();
            addSystemMessage('已清空所有弹幕');
        });
    }
    
    // 清空日志
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', () => {
            if (messageLog) {
                messageLog.innerHTML = '';
            }
            messageCount = 0;
            addSystemMessage('已清空消息日志');
        });
    }
    
    // 显示/隐藏弹幕
    if (toggleDanmuBtn) {
        toggleDanmuBtn.addEventListener('click', () => {
            danmuVisible = !danmuVisible;
            if (danmuContainer) {
                danmuContainer.style.display = danmuVisible ? 'block' : 'none';
            }
            if (toggleDanmuBtn) {
                toggleDanmuBtn.textContent = danmuVisible ? '隐藏弹幕' : '显示弹幕';
            }
            addSystemMessage(danmuVisible ? '弹幕已显示' : '弹幕已隐藏');
        });
    }
    // 在setupEventListeners函数中添加事件监听
    if (fullScreenDanmuBtn && halfScreenDanmuBtn && thirdScreenDanmuBtn) {
        fullScreenDanmuBtn.addEventListener('click', () => setDanmuArea('full'));
        halfScreenDanmuBtn.addEventListener('click', () => setDanmuArea('half'));
        thirdScreenDanmuBtn.addEventListener('click', () => setDanmuArea('third'));
    }
    // 播放按钮
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            const streamUrl = streamUrlInput ? streamUrlInput.value.trim() : '';
            if (streamUrl) {
                playStream(streamUrl);
                // 同步按钮状态
                if (playBtn && pauseBtn) {
                    playBtn.style.display = 'none';
                    pauseBtn.style.display = 'block';
                }
            } else {
                addSystemMessage('请输入有效的直播流地址');
            }
        });
    }
    
    // 暂停按钮
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (dp) {
                dp.pause();
            }
            if (playBtn && pauseBtn) {
                playBtn.style.display = 'block';
                pauseBtn.style.display = 'none';
            }
        });
    }
    
    // 回车键播放
    if (streamUrlInput) {
        streamUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const streamUrl = streamUrlInput.value.trim();
                if (streamUrl) {
                    playStream(streamUrl);
                }
            }
        });
    }
    // 添加任务ID
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTaskIds);
    }
    
    // 回车键添加任务ID
    if (taskIdInput) {
        taskIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addTaskIds();
            }
        });
    }
    
    // 删除选中的任务ID
    if (removeTaskBtn) {
        removeTaskBtn.addEventListener('click', removeSelectedTaskIds);
    }
    
    // 初始化任务ID列表
    initializeTaskIdList();
}
// 初始化任务ID列表
function initializeTaskIdList() {
    if (!taskIdList) return;
    // 清空现有列表
    taskIdList.innerHTML = '';
    // 不再添加初始任务ID，等待从服务器获取
    addSystemMessage('正在获取当前订阅的任务ID...');
}
// 添加任务ID到列表
function addTaskIdToList(taskId) {
    if (!taskIdList) return;
    
    const option = document.createElement('option');
    option.value = taskId;
    option.textContent = taskId;
    taskIdList.appendChild(option);
}

function addTaskIds() {
    if (!taskIdInput || !taskIdList) return;
    
    const input = taskIdInput.value.trim();
    if (!input) {
        addSystemMessage('请输入任务ID');
        return;
    }
    
    // 分割任务ID（支持逗号分隔）
    const newTaskIds = input.split(',').map(id => id.trim()).filter(id => id);
    
    if (newTaskIds.length === 0) {
        addSystemMessage('请输入有效的任务ID');
        return;
    }
    
    // 添加新任务ID并订阅
    newTaskIds.forEach(taskId => {
        // 检查是否已存在相同的任务ID（忽略备注）
        const exists = config.currentTaskIds.some(existingId => 
            extractTaskId(existingId) === extractTaskId(taskId)
        );
        
        if (!exists) {
            addTaskIdToList(taskId);
            config.currentTaskIds.push(taskId);
            subscribeToTask(taskId); // 订阅新任务
        }
    });
    
    // 清空输入框
    taskIdInput.value = '';
    addSystemMessage(`已添加并订阅 ${newTaskIds.length} 个任务ID`);
}

// 删除选中的任务ID（并取消订阅）
function removeSelectedTaskIds() {
    if (!taskIdList) return;
    
    const selectedOptions = Array.from(taskIdList.selectedOptions);
    if (selectedOptions.length === 0) {
        addSystemMessage('请选择要删除的任务ID');
        return;
    }
    
    // 取消订阅并删除选中的任务ID
    selectedOptions.forEach(option => {
        const taskId = option.value;
        const index = config.currentTaskIds.indexOf(taskId);
        if (index > -1) {
            config.currentTaskIds.splice(index, 1);
            unsubscribeFromTask(taskId); // 取消订阅
        }
        option.remove();
    });
    
    addSystemMessage(`已删除并取消订阅 ${selectedOptions.length} 个任务ID`);
}

// 订阅任务
function subscribeToTask(fullTaskId) {
    if (!socket) return;
    
    // 提取纯任务ID用于WebSocket通信
    const pureTaskId = extractTaskId(fullTaskId);
    
    socket.emit('subscribe', {
        taskIds: [fullTaskId], // 发送带备注的完整ID给server.js
        pureTaskIds: [pureTaskId], // 同时发送纯ID用于WebSocket通信
        cmd: 'SUBSCRIBE'
    });
}

// 取消订阅任务
function unsubscribeFromTask(fullTaskId) {
    if (!socket) return;
    
    // 提取纯任务ID用于WebSocket通信
    const pureTaskId = extractTaskId(fullTaskId);
    
    socket.emit('unsubscribe', {
        taskIds: [fullTaskId], // 发送带备注的完整ID给server.js
        pureTaskIds: [pureTaskId], // 同时发送纯ID用于WebSocket通信
        cmd: 'UNSUBSCRIBE'
    });
}
// 播放直播流
function playStream(streamUrl) {
    socket.emit('set-stream-url',streamUrl);
    if (!dp) {
        addSystemMessage('播放器未初始化');
        return;
    }
    
    try {
        dp.switchVideo({
            url: streamUrl,
            type: 'auto'
        });
        
        // 添加延迟确保视频加载
        setTimeout(() => {
            dp.play().catch(error => {
                addSystemMessage(`播放失败: ${error.message}`);
            });
        }, 100);
        
        addSystemMessage(`开始播放: ${streamUrl}`);
    } catch (error) {
        console.error('播放错误:', error);
        addSystemMessage(`播放失败: ${error.message}`);
    }
}
// 设置弹幕显示区域的函数
function setDanmuArea(mode) {
    if (!danmuContainer) return;
    
    // 移除所有尺寸类
    danmuContainer.classList.remove('danmu-fullscreen', 'danmu-halfscreen', 'danmu-thirdscreen');
    
    // 更新按钮激活状态
    const buttons = document.querySelectorAll('.area-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // 根据模式设置
    switch(mode) {
        case 'half':
            danmuContainer.classList.add('danmu-halfscreen');
            halfScreenDanmuBtn.classList.add('active');
            danmuTracks.total = 4; // 半屏减少轨道数量
            addSystemMessage('弹幕显示区域设置为半屏');
            break;
        case 'third':
            danmuContainer.classList.add('danmu-thirdscreen');
            thirdScreenDanmuBtn.classList.add('active');
            danmuTracks.total = 3; // 1/3屏进一步减少轨道数量
            addSystemMessage('弹幕显示区域设置为1/3屏');
            break;
        default: // full
            danmuContainer.classList.add('danmu-fullscreen');
            fullScreenDanmuBtn.classList.add('active');
            danmuTracks.total = 8; // 全屏恢复轨道数量
            addSystemMessage('弹幕显示区域设置为全屏');
    }
    
    // 重置轨道状态
    danmuTracks.occupied = new Array(danmuTracks.total).fill(false);
    danmuTracks.lastUseTime = new Array(danmuTracks.total).fill(0);
    updateTrackCount();
    
    // 清空当前弹幕
    if (danmuContainer) {
        danmuContainer.innerHTML = '';
    }
}
// 设置Socket.io监听
function setupSocketListeners() {
    if (!socket) return;
    
    socket.on('connect', () => {
        if (connectionStatus) {
            // connectionStatus.textContent = '已连接';
            // connectionStatus.style.color = '#4ade80';
            socket.emit('get-ws-url');
            socket.emit('get-stream-url');
        }
        addSystemMessage('已连接到服务器');
    });
    socket.on('current-ws-url', (url) => {
        serverUrlElement.textContent = url;
    });
    socket.on('current-stream-url', (streamUrl) => {
        addSystemMessage('读取直播流地址：' + streamUrl);
        streamUrlElement.value = streamUrl;
    });
    socket.on('disconnect', () => {
        if (connectionStatus) {
            // connectionStatus.textContent = '已断开';
            // connectionStatus.style.color = '#f87171';
        }
        addSystemMessage('与服务器断开连接');
    });
    
    socket.on('status', (status) => {
        if (!connectionStatus) return;
        
        if (status === 'connected') {
            connectionStatus.textContent = '已连接';
            connectionStatus.style.color = '#4ade80';
            addSystemMessage('Barrage-Fly-WebSocket服务器连接成功');
        } else {
            connectionStatus.textContent = '已断开';
            connectionStatus.style.color = '#f87171';
            addSystemMessage('Barrage-Fly-WebSocket服务器连接断开');
        }
    });
    
    socket.on('message', (data) => {
        processMessage(data);
    });
    // 监听当前订阅列表
    socket.on('current-subscriptions', (taskIds) => {
        console.log('当前订阅的任务ID:', taskIds);
        // 更新UI显示当前订阅的任务
        updateSubscriptionList(taskIds);
    });

    socket.on('current-barrage-fly-ws-connect', (newisBarrageFlyWSConnect,barrageFlyWSUrl) => {
        console.log('newisBarrageFlyWSConnect->' + newisBarrageFlyWSConnect);
        isBarrageFlyWSConnect = newisBarrageFlyWSConnect;
        barrageflyWsInput.value = barrageFlyWSUrl;
        if(isBarrageFlyWSConnect){
            barrageflyWsSetBtn.textContent = '断开';

        }else{
            barrageflyWsSetBtn.textContent = '连接';
        }
    });
    
    socket.on('system-message', (msg) => {
        addSystemMessage('系统消息: ' + JSON.stringify(msg));
    });
    
    socket.on('error', (error) => {
        console.error('Socket错误:', error);
        addSystemMessage('连接发生错误');
    });
}
function updateSubscriptionList(taskIds) {
    if (!taskIdList) return;
    
    // 清空当前任务ID列表
    config.currentTaskIds = [];
    
    // 清空UI列表
    taskIdList.innerHTML = '';
    
    // 更新任务ID列表
    taskIds.forEach(taskId => {
        if (!config.currentTaskIds.includes(taskId)) {
            addTaskIdToList(taskId);
            config.currentTaskIds.push(taskId);
        }
    });
    
    // 更新房间数量显示
    if (roomCountElement) roomCountElement.textContent = taskIds.length;
    
    // 更新状态栏的任务ID显示
    if (taskIdsElement) {
        taskIdsElement.textContent = taskIds.length > 0 ? 
            taskIds.join(', ') : '暂无订阅任务';
    }
    
    addSystemMessage(`已更新订阅列表，当前订阅 ${taskIds.length} 个任务`);
}
// 处理消息
function processMessage(data) {
    const roomId = data.roomId;
    const platform = data.platform;
    const msgDto = data.data;
    
    switch (data.type) {
        case "DANMU":
            danmuCount++;
            updateCounters();
            displayDanmu(roomId, platform, msgDto);
            addMessageLog(roomId, platform, 'DANMU', msgDto);
            break;
            
        case "GIFT":
            break;
            
        default:
            addSystemMessage(`未知消息类型: ${data.type}`);
    }
}

// 获取可用轨道
function getAvailableTrack() {
    const now = Date.now();
    let availableTrack = -1;
    
    // 首先尝试找空闲轨道
    for (let i = 0; i < danmuTracks.occupied.length; i++) {
        if (!danmuTracks.occupied[i]) {
            availableTrack = i;
            break;
        }
    }
    
    // 如果没有空闲轨道，找最久未使用的轨道
    if (availableTrack === -1) {
        let oldestTime = Infinity;
        for (let i = 0; i < danmuTracks.lastUseTime.length; i++) {
            if (danmuTracks.lastUseTime[i] < oldestTime) {
                oldestTime = danmuTracks.lastUseTime[i];
                availableTrack = i;
            }
        }
    }
    
    if (availableTrack !== -1) {
        danmuTracks.occupied[availableTrack] = true;
        danmuTracks.lastUseTime[availableTrack] = now;
        updateTrackCount();
    }
    
    return availableTrack;
}

// 释放轨道
function releaseTrack(track) {
    if (track >= 0 && track < danmuTracks.occupied.length) {
        danmuTracks.occupied[track] = false;
        updateTrackCount();
    }
}

// 重置所有轨道
function resetTracks() {
    danmuTracks.occupied.fill(false);
    updateTrackCount();
}

// 更新轨道计数显示
function updateTrackCount() {
    if (!trackCountElement) return;
    
    const occupiedCount = danmuTracks.occupied.filter(occupied => occupied).length;
    trackCountElement.textContent = `${occupiedCount}/${danmuTracks.total}`;
}

// 显示弹幕
function displayDanmu(roomId, platform, msgDto) {
    if (!danmuVisible || !danmuContainer) return;
    
    const track = getAvailableTrack();
    if (track === -1) return; // 没有可用轨道
    
    const danmuElement = document.createElement('div');
    danmuElement.className = 'danmu danmu-danmu';
    danmuElement.style.fontSize = `${fontSize}px`;
    danmuElement.style.opacity = danmuOpacity;
    
    // 获取平台标签
    const platformLabel = getPlatformLabel(platform);
    
    // 构建弹幕内容
    let content = '';
    
    // 添加平台标签
    if (platformLabel) {
        content += `<span class="platform-label" style="background: ${platformLabel.color}">${platformLabel.text}</span> `;
    }
    
    // 添加徽章
    if (msgDto.badgeLevel && msgDto.badgeLevel !== 0) {
        content += `<span class="badge">${msgDto.badgeLevel}${msgDto.badgeName}</span> `;
    }
    
    // 添加用户名和内容
    content += `<strong>${msgDto.username}</strong>: ${msgDto.content}`;
    
    danmuElement.innerHTML = content;
    
    // 设置轨道位置
    const trackHeight = danmuContainer.clientHeight / danmuTracks.total;
    const top = track * trackHeight + (trackHeight - fontSize - 8) / 2;
    danmuElement.style.top = `${Math.max(0, top)}px`;
    
    // 添加到容器
    danmuContainer.appendChild(danmuElement);
    
    // 获取弹幕宽度
    const danmuWidth = danmuElement.offsetWidth;
    const containerWidth = danmuContainer.clientWidth;
    
    // 设置初始位置（最右侧）
    danmuElement.style.left = `${containerWidth}px`;
    
    // 计算动画时间（秒）
    const duration = (containerWidth + danmuWidth) / danmuSpeed;
    
    // 使用requestAnimationFrame实现平滑动画
    const startTime = Date.now();
    
    function animate() {
        const currentTime = Date.now();
        const elapsed = (currentTime - startTime) / 1000;
        const progress = Math.min(1, elapsed / duration);
        
        if (progress < 1) {
            const currentLeft = containerWidth - (containerWidth + danmuWidth) * progress;
            danmuElement.style.left = `${currentLeft}px`;
            requestAnimationFrame(animate);
        } else {
            // 动画结束
            if (danmuElement.parentNode) {
                danmuElement.parentNode.removeChild(danmuElement);
            }
            releaseTrack(track);
        }
    }
    
    // 开始动画
    requestAnimationFrame(animate);
}

// 根据平台获取标签信息和颜色
function getPlatformLabel(platform) {
    const platformConfigs = {
        'douyin': { text: '抖音', color: '#ff0050' },
        'kuaishou': { text: '快手', color: '#ff6600' },
        'bilibili': { text: 'B站', color: '#fb7299' },
        'huya': { text: '虎牙', color: '#ff9900' },
        'douyu': { text: '斗鱼', color: '#ff6b00' },
        'weibo': { text: '微博', color: '#e6162d' },
        'xiaohongshu': { text: '小红书', color: '#ff2741' },
        'youtube': { text: 'YouTube', color: '#ff0000' },
        'twitch': { text: 'Twitch', color: '#9146ff' },
        'default': { text: '直播', color: '#4cc9f0' }
    };
    
    // 转换为小写进行比较
    const platformLower = platform ? platform.toLowerCase() : '';
    
    // 查找匹配的平台配置
    for (const [key, config] of Object.entries(platformConfigs)) {
        if (platformLower.includes(key)) {
            return config;
        }
    }
    
    // 如果没有匹配的平台，尝试从platform参数中提取
    if (platform && typeof platform === 'string') {
        // 如果platform直接就是平台名称
        for (const [key, config] of Object.entries(platformConfigs)) {
            if (platformLower === key) {
                return config;
            }
        }
        
        // 返回平台名称的前两个字符作为标签
        return {
            text: platform.length > 4 ? platform.substring(0, 2) : platform,
            color: '#666666'
        };
    }
    
    // 默认配置
    return platformConfigs.default;
}

// 显示礼物
function displayGift(roomId, platform, msgDto) {
    if (!danmuVisible || !danmuContainer) return;
    
    const track = getAvailableTrack();
    if (track === -1) return;
    
    const giftElement = document.createElement('div');
    giftElement.className = 'danmu danmu-gift';
    giftElement.style.fontSize = `${fontSize}px`;
    giftElement.style.opacity = danmuOpacity;
    
    // 获取平台标签
    const platformLabel = getPlatformLabel(platform);
    
    // 构建礼物内容
    let content = '';
    
    // 添加平台标签
    if (platformLabel) {
        content += `<span class="platform-label" style="background: ${platformLabel.color}">${platformLabel.text}</span> `;
    }
    
    content += '🎁 ';
    
    if (msgDto.badgeLevel && msgDto.badgeLevel !== 0) {
        content += `<span class="badge">${msgDto.badgeLevel}${msgDto.badgeName}</span> `;
    }
    
    content += `<strong>${msgDto.username}</strong> ${msgDto.data?.action || "赠送"} <span style="color: #ffcc00">${msgDto.giftName}</span> × ${msgDto.giftCount}`;
    
    giftElement.innerHTML = content;
    
    // 设置轨道位置
    const trackHeight = danmuContainer.clientHeight / danmuTracks.total;
    const top = track * trackHeight + (trackHeight - fontSize - 8) / 2;
    giftElement.style.top = `${Math.max(0, top)}px`;
    
    // 添加到容器
    danmuContainer.appendChild(giftElement);
    
    // 获取弹幕宽度
    const danmuWidth = giftElement.offsetWidth;
    const containerWidth = danmuContainer.clientWidth;
    
    // 设置初始位置（最右侧）
    giftElement.style.left = `${containerWidth}px`;
    
    // 计算动画时间（秒）- 礼物消息快一些
    const duration = (containerWidth + danmuWidth) / (danmuSpeed * 1.2);
    
    // 使用requestAnimationFrame实现平滑动画
    const startTime = Date.now();
    
    function animate() {
        const currentTime = Date.now();
        const elapsed = (currentTime - startTime) / 1000;
        const progress = Math.min(1, elapsed / duration);
        
        if (progress < 1) {
            const currentLeft = containerWidth - (containerWidth + danmuWidth) * progress;
            giftElement.style.left = `${currentLeft}px`;
            requestAnimationFrame(animate);
        } else {
            // 动画结束
            if (giftElement.parentNode) {
                giftElement.parentNode.removeChild(giftElement);
            }
            releaseTrack(track);
        }
    }
    
    // 开始动画
    requestAnimationFrame(animate);
}
// 添加消息到日志
function addMessageLog(roomId, platform, type, msgDto) {
    if (!messageLog) return;
    
    const messageElement = document.createElement('div');
    
    let content = `[房间 ${roomId}] `;
    if (type === 'DANMU') {
        messageElement.className = 'message message-danmu';
        if (msgDto.badgeLevel && msgDto.badgeLevel !== 0) {
            content += `[${msgDto.badgeLevel}${msgDto.badgeName}] `;
        }
        content += `${msgDto.username}: ${msgDto.content}`;
    } else {
        messageElement.className = 'message message-gift';
        if (msgDto.badgeLevel && msgDto.badgeLevel !== 0) {
            content += `[${msgDto.badgeLevel}${msgDto.badgeName}] `;
        }
        content += `${msgDto.username} ${msgDto.data?.action || "赠送"} ${msgDto.giftName} × ${msgDto.giftCount}`;
    }
    
    messageElement.textContent = content;
    messageLog.appendChild(messageElement);
    
    // 自动滚动到底部
    messageLog.scrollTop = messageLog.scrollHeight;
    
    // 限制消息数量
    messageCount++;
    if (messageCount > 200) {
        messageLog.removeChild(messageLog.firstChild);
        messageCount--;
    }
}

// 添加系统消息
function addSystemMessage(text) {
    if (!messageLog) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message message-system';
    messageElement.textContent = `[系统] ${new Date().toLocaleTimeString()} - ${text}`;
    messageLog.appendChild(messageElement);
    
    // 自动滚动到底部
    messageLog.scrollTop = messageLog.scrollHeight;
    
    // 限制消息数量
    messageCount++;
    if (messageCount > 200) {
        messageLog.removeChild(messageLog.firstChild);
        messageCount--;
    }
}

// 更新计数器
function updateCounters() {
    if (danmuCountElement) danmuCountElement.textContent = danmuCount;
}

// 添加键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // 确保不是在输入框中
        if (document.activeElement.tagName === 'INPUT') return;
        
        // 空格键播放/暂停
        if (e.code === 'Space') {
            e.preventDefault();
            if (dp && dp.video) {
                if (dp.video.paused) {
                    dp.play();
                } else {
                    dp.pause();
                }
            }
        }
        
        // F键进入/退出全屏
        if (e.code === 'KeyF') {
            e.preventDefault();
            if (dp) {
                dp.toggleFullScreen();
            }
        }
        
        // M键静音
        if (e.code === 'KeyM') {
            e.preventDefault();
            if (dp) {
                dp.toggleVolume();
            }
        }
        
        // D键显示/隐藏弹幕
        if (e.code === 'KeyD') {
            e.preventDefault();
            if (toggleDanmuBtn) {
                toggleDanmuBtn.click();
            }
        }
    });
}
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
// 初始化应用
window.addEventListener('load', () => {
    init();
    setupKeyboardShortcuts();
    addSystemMessage('系统初始化完成');
});