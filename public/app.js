// 配置信息
const config = {
    url: "ws://localhost:9898",
    currentTaskIds: [], // 当前管理的任务ID
    remarkMap: {} // 存储 roomId -> 备注 的映射关系
};

// 状态变量
let danmuCount = 0;
let messageCount = 0;
let danmuSpeed = 150; // px/s
let danmuOpacity = 0.8;
let fontSize = 20;
let danmuVisible = true;
let adminSettingsOpen = false;
// Danmaku 实例
let danmaku = null;
let adminPassword = "";
// 播放器管理变量
let sidePlayers = []; // 右侧副播放器数组
let bottomPlayers = []; // 底部副播放器数组
const MAX_SIDE_PLAYERS = 6; // 右侧最大播放器数量
const MAX_BOTTOM_PLAYERS = 4; // 底部最大播放器数量
// DOM元素
let danmuContainer, messageLog, connectionStatus, danmuCountElement, roomCountElement, serverUrlElement, barrageflyWsInput, barrageflyWsSetBtn,adminSettings,adminPasswordSetBtn;
let speedControl, speedValue, opacityControl, opacityValue, fontSizeControl,fontSizeValue;
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
    initializeDanmaku(); // 初始化弹幕库
    toggleAdminSettings(false);    // 初始化时隐藏管理员设置
    initializeMultiPlayers();
}
// 初始化多播放器功能
function initializeMultiPlayers() {
    setupPlayerEventListeners();
    loadPlayersFromStorage();
}

// 初始化Danmaku弹幕库
function initializeDanmaku() {
    if (!danmuContainer) return;
    
    try {
        danmaku = new Danmaku({
            container: danmuContainer,
            speed: danmuSpeed,
            opacity: danmuOpacity,
            fontSize: fontSize,
            // 其他配置选项可以根据需要添加
        });
        // 设置初始字体大小类
        adjustDanmuContainerClass(fontSize);
        console.log('Danmaku初始化成功');
    } catch (error) {
        console.error('Danmaku初始化失败:', error);
        addSystemMessage('弹幕库初始化失败，将使用备用模式');
        // 可以在这里设置备用模式
    }
}

// 初始化DOM元素
function initializeDOMElements() {
    // 播放器相关
    danmuContainer = document.getElementById('danmu-container');
    messageLog = document.getElementById('message-log');
    
    // 状态指示器
    connectionStatus = document.getElementById('connection-status');
    forwarderConnectionStatus = document.getElementById('forwarder-connection-status');
    danmuCountElement = document.getElementById('danmu-count');
    roomCountElement = document.getElementById('room-count');
    
    // 控制元素
    speedControl = document.getElementById('speed-control');
    speedValue = document.getElementById('speed-value');
    opacityControl = document.getElementById('opacity-control');
    opacityValue = document.getElementById('opacity-value');
    fontSizeControl = document.getElementById('font-size-control');
    fontSizeValue = document.getElementById('font-size-value');
    
    // 按钮
    clearBtn = document.getElementById('clear-btn');
    clearLogBtn = document.getElementById('clear-log-btn');
    toggleDanmuBtn = document.getElementById('toggle-danmu-btn');
    playBtn = document.getElementById('play-btn');
    pauseBtn = document.getElementById('pause-btn');
    
    // 输入框
    streamUrlInput = document.getElementById('stream-url');
    taskIdInput = document.getElementById('task-id-input');
    taskIdList = document.getElementById('task-id-list');
    
    // 其他按钮
    addTaskBtn = document.getElementById('add-task-btn');
    removeTaskBtn = document.getElementById('remove-task-btn');
    serverUrlElement = document.getElementById('server-url');
    
    // 弹幕区域控制
    fullScreenDanmuBtn = document.getElementById('full-screen-danmu');
    halfScreenDanmuBtn = document.getElementById('half-screen-danmu');
    thirdScreenDanmuBtn = document.getElementById('third-screen-danmu');
    
    // WebSocket 设置
    barrageflyWsInput = document.getElementById('barragefly-ws-address-input');
    barrageflyWsSetBtn = document.getElementById('barragefly-ws-address-set-btn');
    
    // 管理员设置
    adminPasswordInput = document.getElementById('admin-password-input');
    adminPasswordSetBtn = document.getElementById('admin-password-set-btn');
    adminSettings = document.querySelectorAll('.admin-setting');
    
    // 多播放器按钮
    addSidePlayerBtn = document.getElementById('add-side-player-btn');
    addBottomPlayerBtn = document.getElementById('add-bottom-player-btn');
    
    // 任务ID显示
    taskIdsElement = document.getElementById('task-ids');
}
// 设置播放器相关事件监听
function setupPlayerEventListeners() {
    // 添加播放器按钮
    const addSidePlayerBtn = document.getElementById('add-side-player-btn');
    const addBottomPlayerBtn = document.getElementById('add-bottom-player-btn');
    const confirmAddPlayerBtn = document.getElementById('confirm-add-player');
    const cancelAddPlayerBtn = document.getElementById('cancel-add-player');
    const closeModalBtn = document.querySelector('.close');
    const modal = document.getElementById('add-player-modal');

    if (addSidePlayerBtn) {
        addSidePlayerBtn.addEventListener('click', () => showAddPlayerModal('side'));
    }

    if (addBottomPlayerBtn) {
        addBottomPlayerBtn.addEventListener('click', () => showAddPlayerModal('bottom'));
    }

    if (confirmAddPlayerBtn) {
        confirmAddPlayerBtn.addEventListener('click', addNewPlayer);
    }

    if (cancelAddPlayerBtn) {
        cancelAddPlayerBtn.addEventListener('click', closeAddPlayerModal);
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAddPlayerModal);
    }

    // 点击模态框外部关闭
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAddPlayerModal();
            }
        });
    }
}

// 显示添加播放器模态框
function showAddPlayerModal(position) {
    const modal = document.getElementById('add-player-modal');
    position = 'side'
    const positionSelect = document.getElementById('player-position');
    
    if (modal) {
        modal.style.display = 'block';
    }
}

// 关闭添加播放器模态框
function closeAddPlayerModal() {
    const modal = document.getElementById('add-player-modal');
    if (modal) {
        modal.style.display = 'none';
        // 清空输入框
        document.getElementById('player-remark').value = '';
        document.getElementById('player-stream-url').value = '';
    }
}

// 添加新播放器
function addNewPlayer() {
    const remark = document.getElementById('player-remark').value.trim();
    const streamUrl = document.getElementById('player-stream-url').value.trim();
    position = 'side'
    if (!streamUrl) {
        addSystemMessage('请输入直播流地址');
        return;
    }

    // 检查位置限制
    if (position === 'side' && sidePlayers.length >= MAX_SIDE_PLAYERS) {
        addSystemMessage(`右侧区域最多只能添加 ${MAX_SIDE_PLAYERS} 个播放器`);
        return;
    }
    const playerId = 'player-' + Date.now();
    const playerData = {
        id: playerId,
        remark: remark || `播放器${(position === 'side' ? sidePlayers.length : bottomPlayers.length) + 1}`,
        streamUrl: streamUrl,
        position: position
    };

    createPlayerElement(playerData);
    closeAddPlayerModal();
    addSystemMessage(`已添加播放器: ${playerData.remark}`);
}

// 创建播放器元素
function createPlayerElement(playerData) {
    const container = playerData.position === 'side' 
        ? document.getElementById('side-videos-container')
        : document.getElementById('bottom-videos-container');
    
    if (!container) return;

    const playerElement = document.createElement('div');
    playerElement.className = 'video-player-item';
    playerElement.id = playerData.id;
    playerElement.innerHTML = `
        <div class="video-player-header">${playerData.remark}</div>
        <div class="video-player-content" id="${playerData.id}-content"></div>
        <div class="video-player-controls">
            <button class="remove-player-btn" onclick="removePlayer('${playerData.id}')">×</button>
        </div>
    `;

    container.appendChild(playerElement);
    
    // 初始化播放器
    initializeSubPlayer(playerData);
    
    // 保存到对应数组和本地存储
    if (playerData.position === 'side') {
        sidePlayers.push(playerData);
    } else {
        bottomPlayers.push(playerData);
    }
    
    savePlayersToStorage();
}

// 初始化副播放器
function initializeSubPlayer(playerData) {
    try {
        const player = new DPlayer({
            container: document.getElementById(`${playerData.id}-content`),
            screenshot: true,
            video: {
                url: playerData.streamUrl,
                type: 'auto'
            },
            // 设置静音
            mutex: false, // 允许同时播放多个播放器，DPlayer默认是互斥的（mutex: true），所以需要设置为false
            muted: true, // 静音
        });
        
        // 播放视频
        player.play().catch(error => {
            console.error(`播放器 ${playerData.remark} 播放失败:`, error);
            addSystemMessage(`播放器 ${playerData.remark} 播放失败: ${error.message}`);
        });
        
        // 存储播放器实例
        playerData.instance = player;
        
    } catch (error) {
        addSystemMessage(`初始化播放器 ${playerData.remark} 失败: ${error.message}`);
    }
}

// 移除播放器
function removePlayer(playerId) {
    // 从数组中查找播放器
    let playerIndex = sidePlayers.findIndex(p => p.id === playerId);
    let position = 'side';
    if (playerIndex === -1) return;
    
    const playerData = position === 'side' ? sidePlayers[playerIndex] : bottomPlayers[playerIndex];
    
    // 销毁播放器实例
    if (playerData.instance) {
        playerData.instance.destroy();
    }
    
    // 移除DOM元素
    const playerElement = document.getElementById(playerId);
    if (playerElement) {
        playerElement.remove();
    }
    
    // 从数组中移除
    if (position === 'side') {
        sidePlayers.splice(playerIndex, 1);
    }
    
    savePlayersToStorage();
    addSystemMessage(`已移除播放器: ${playerData.remark}`);
}

// 保存播放器数据到本地存储
function savePlayersToStorage() {
    const playersData = {
        sidePlayers: sidePlayers.map(p => ({ 
            id: p.id, 
            remark: p.remark, 
            streamUrl: p.streamUrl,
            position: p.position 
        }))
    };
    localStorage.setItem('multiPlayersData', JSON.stringify(playersData));
}

// 从本地存储加载播放器数据
function loadPlayersFromStorage() {
    const savedData = localStorage.getItem('multiPlayersData');
    if (savedData) {
        try {
            const playersData = JSON.parse(savedData);
            
            // 加载右侧播放器
            playersData.sidePlayers.forEach(playerData => {
                createPlayerElement(playerData);
            });
            
            addSystemMessage(`已加载 ${sidePlayers.length} 个副播放器`);
        } catch (error) {
            console.error('加载播放器数据失败:', error);
        }
    }
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
            mutex: false,
            video: {
                url: '',
                type: 'auto'
            }
        });
        
        // 监听全屏变化
        dp.on('fullscreen', () => {
            adjustDanmuForFullscreen();
            // 添加延迟确保全屏完全生效
            setTimeout(() => {
                adjustDanmuForFullscreen();
            }, 300);
        });
        
        dp.on('fullscreen_cancel', () => {
            adjustDanmuForFullscreen();
            // 添加延迟确保退出全屏完全生效
            setTimeout(() => {
                adjustDanmuForFullscreen();
            }, 300);
        });
        // 监听播放器容器尺寸变化
        const playerContainer = document.getElementById('dplayer');
        if (playerContainer) {
            // 使用 ResizeObserver 监听尺寸变化
            const resizeObserver = new ResizeObserver(() => {
                setTimeout(() => {
                    adjustDanmuForFullscreen();
                }, 100);
            });
            resizeObserver.observe(playerContainer);
        }
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
    // 确保弹幕容器在视频播放器内
    const dplayer = document.getElementById('dplayer');
    if (dplayer && danmuContainer && !dplayer.contains(danmuContainer)) {
        dplayer.appendChild(danmuContainer);
    }
    
    // 重新设置弹幕区域大小
    if (danmuContainer) {
        // 移除所有尺寸类
        danmuContainer.classList.remove('danmu-fullscreen', 'danmu-halfscreen', 'danmu-thirdscreen');
        
        // 根据当前激活的按钮重新设置尺寸
        if (halfScreenDanmuBtn && halfScreenDanmuBtn.classList.contains('active')) {
            danmuContainer.classList.add('danmu-halfscreen');
        } else if (thirdScreenDanmuBtn && thirdScreenDanmuBtn.classList.contains('active')) {
            danmuContainer.classList.add('danmu-thirdscreen');
        } else {
            danmuContainer.classList.add('danmu-fullscreen');
        }
        
        // 强制重排
        setTimeout(() => {
            if (danmaku) {
                danmaku.resize();
            }
        }, 100);
    }
}

function extractTaskId(fullTaskId) {
    // 从 "1234[6][梁海鹏]" 中提取 "1234"
    // 新格式: id[roomId][备注]
    const match = fullTaskId.match(/^(\d+)\[(\d+)\](?:\[(.*)\])?$/);
    return match ? match[1] : fullTaskId.replace(/\[.*?\]/g, '').trim();
}
// 从完整任务ID中提取 roomId
function extractRoomId(fullTaskId) {
    // 从 "1234[6][梁海鹏]" 中提取 "6"
    const match = fullTaskId.match(/^(\d+)\[(\d+)\](?:\[(.*)\])?$/);
    return match ? match[2] : '0'; // 如果没有roomId，默认为0
}
// 从完整任务ID中提取备注
function extractRemark(fullTaskId) {
    // 从 "1234[6][梁海鹏]" 中提取 "梁海鹏"
    const match = fullTaskId.match(/^(\d+)\[(\d+)\](?:\[(.*)\])?$/);
    return match && match[3] ? match[3] : '';
}

// 验证任务ID格式
function isValidTaskIdFormat(taskId) {
    // 验证格式: 数字[数字][任意字符]
    // 例如: 1234[6][梁海鹏]
    return /^\d+\[\d+\](?:\[.*\])?$/.test(taskId);
}
let isBarrageFlyWSConnect = false;
// 设置事件监听
function setupEventListeners() {
    if (!speedControl || !opacityControl || !fontSizeControl) {
        console.error('控件元素未找到');
        return;
    }
    setDanmuArea('third'); // 默认弹幕区域1/3
    // 打开/关闭设置按钮
    if (adminPasswordSetBtn) {
        adminPasswordSetBtn.addEventListener('click', () => {
            // 如果设置已经打开，直接关闭
            if (adminSettingsOpen) {
                toggleAdminSettings(false);
                return;
            }
            
            // 如果设置未打开，需要验证密码
            const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
            if (!password) {
                addSystemMessage('请输入管理员密码');
                return;
            }
            
            // 发送密码验证请求
            socket.emit('verify-admin-password', password);
        });
    }
    // 设置Barrage-Fly-WS通信地址
    if (barrageflyWsSetBtn) {
        barrageflyWsSetBtn.addEventListener('click', () => {
            const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
            if (!password) {
                addSystemMessage('请输入管理员密码');
                return;
            }
            
            if (!isBarrageFlyWSConnect) {
                const input = barrageflyWsInput.value.trim();
                if (!input) {
                    addSystemMessage('请输入BarrageFly-WS通信地址');
                    return;
                }
                if (!isValidWebSocketURL(input)) {
                    addSystemMessage('barrageFly-WebSocket通信地址格式无效，请使用 ws:// 或 wss:// 开头的地址');
                    return;
                }
                if (!socket) return;
                socket.emit('set-barrage-fly-ws', input, password);
                isBarrageFlyWSConnect = true;
                barrageflyWsSetBtn.textContent = '断开';
            } else {
                socket.emit('close-barrage-fly-ws', password);
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
        if (danmaku) {
            danmaku.speed = danmuSpeed;
        }
    });
    
    // 透明度控制
    opacityControl.addEventListener('input', (e) => {
        danmuOpacity = parseFloat(e.target.value);
        if (opacityValue) {
            opacityValue.textContent = danmuOpacity.toFixed(1);
        }
        if (danmaku) {
            danmaku.opacity = danmuOpacity;
        }
    });
    
    // 字体大小控制
    fontSizeControl.addEventListener('input', (e) => {
        fontSize = parseInt(e.target.value);
        if (fontSizeValue) {
            fontSizeValue.textContent = fontSize;
        }
        if (danmaku) {
            danmaku.fontSize = fontSize;
        }
        
        // 根据字体大小调整弹幕容器类
        adjustDanmuContainerClass(fontSize);
    });
    
    // 清空弹幕
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (danmaku) {
                danmaku.clear();
            } else if (danmuContainer) {
                danmuContainer.innerHTML = '';
            }
            danmuCount = 0;
            updateCounters();
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
            const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
            
            if (streamUrl) {
                playStream(streamUrl, password);
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
    
    // 回车键播放 - 添加密码验证
    if (streamUrlInput) {
        streamUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const streamUrl = streamUrlInput.value.trim();
                const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
                
                if (streamUrl) {
                    playStream(streamUrl, password);
                }
            }
        });
    }
    
    // 添加任务ID
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
            if (!password) {
                addSystemMessage('请输入管理员密码');
                return;
            }
            addTaskIds(password);
        });
    }
    
    // 回车键添加任务ID
    if (taskIdInput) {
        taskIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
                if (!password) {
                    addSystemMessage('请输入管理员密码');
                    return;
                }
                addTaskIds(password);
            }
        });
    }
    
    // 删除选中的任务ID
    if (removeTaskBtn) {
        removeTaskBtn.addEventListener('click', () => {
            const password = adminPasswordInput ? adminPasswordInput.value.trim() : '';
            if (!password) {
                addSystemMessage('请输入管理员密码');
                return;
            }
            removeSelectedTaskIds(password);
        });
    }
    
    // 初始化任务ID列表
    initializeTaskIdList();
}
function adjustDanmuContainerClass(fontSize) {
    if (!danmuContainer) return;
    
    // 移除所有字体类
    danmuContainer.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    
    // 根据字体大小添加相应的类
    if (fontSize <= 16) {
        danmuContainer.classList.add('font-small');
    } else if (fontSize <= 20) {
        danmuContainer.classList.add('font-medium');
    } else if (fontSize <= 24) {
        danmuContainer.classList.add('font-large');
    } else {
        danmuContainer.classList.add('font-xlarge');
    }
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

function addTaskIds(password) {
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
    
    // 验证格式并添加新任务ID
    const validTaskIds = [];
    newTaskIds.forEach(taskId => {
        if (!isValidTaskIdFormat(taskId)) {
            addSystemMessage(`任务ID格式错误: ${taskId}，正确格式: id[roomId][备注]，如: 1234[6][梁海鹏]`);
            return;
        }
        
        // 检查是否已存在相同的任务ID（比较纯ID）
        const pureId = extractTaskId(taskId);
        const exists = config.currentTaskIds.some(existingId => 
            extractTaskId(existingId) === pureId
        );
        
        if (!exists) {
            validTaskIds.push(taskId);
            
            // 更新备注映射
            const roomId = extractRoomId(taskId);
            const remark = extractRemark(taskId);
            if (roomId && remark) {
                config.remarkMap[roomId] = remark;
            }
        }
    });
    
    if (validTaskIds.length === 0) {
        addSystemMessage('没有有效的任务ID可添加');
        return;
    }
    
    // 添加新任务ID并订阅
    validTaskIds.forEach(taskId => {
        addTaskIdToList(taskId);
        config.currentTaskIds.push(taskId);
        subscribeToTask(taskId, password);
    });
    
    // 清空输入框
    taskIdInput.value = '';
    addSystemMessage(`已添加并订阅 ${validTaskIds.length} 个任务ID`);
}

// 删除选中的任务ID（并取消订阅）
function removeSelectedTaskIds(password) {
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
            
            // 从备注映射中移除
            const roomId = extractRoomId(taskId);
            if (roomId && config.remarkMap[roomId]) {
                delete config.remarkMap[roomId];
            }
            
            unsubscribeFromTask(taskId, password);
        }
        option.remove();
    });
    
    addSystemMessage(`已删除并取消订阅 ${selectedOptions.length} 个任务ID`);
}

// 订阅任务
function subscribeToTask(fullTaskId, password) {
    if (!socket) return;
    
    // 提取纯任务ID用于WebSocket通信
    const pureTaskId = extractTaskId(fullTaskId);
    
    socket.emit('subscribe', {
        taskIds: [fullTaskId], // 发送带备注的完整ID给server.js
        pureTaskIds: [pureTaskId], // 同时发送纯ID用于WebSocket通信
        cmd: 'SUBSCRIBE',
        password: password // 添加密码参数
    });
}

// 取消订阅任务
function unsubscribeFromTask(fullTaskId, password) {
    if (!socket) return;
    
    // 提取纯任务ID用于WebSocket通信
    const pureTaskId = extractTaskId(fullTaskId);
    
    socket.emit('unsubscribe', {
        taskIds: [fullTaskId], // 发送带备注的完整ID给server.js
        pureTaskIds: [pureTaskId], // 同时发送纯ID用于WebSocket通信
        cmd: 'UNSUBSCRIBE',
        password: password // 添加密码参数
    });
}
// 播放直播流
function playStream(streamUrl, password) {
    socket.emit('set-stream-url', streamUrl, password);
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
            
        }, 100);
        
        addSystemMessage(`开始播放: ${streamUrl}`);
    } catch (error) {
        console.error('播放错误:', error);
        addSystemMessage(`播放失败: ${error.message}`);
    }
}
// 修改 setDanmuArea 函数
function setDanmuArea(mode) {
    if (!danmuContainer) return;
    
    // 移除所有尺寸类
    danmuContainer.classList.remove('danmu-fullscreen', 'danmu-halfscreen', 'danmu-thirdscreen');
    
    // 更新按钮激活状态 - 先移除所有active类
    if (fullScreenDanmuBtn) fullScreenDanmuBtn.classList.remove('active');
    if (halfScreenDanmuBtn) halfScreenDanmuBtn.classList.remove('active');
    if (thirdScreenDanmuBtn) thirdScreenDanmuBtn.classList.remove('active');
    
    // 根据模式设置
    switch(mode) {
        case 'half':
            danmuContainer.classList.add('danmu-halfscreen');
            if (halfScreenDanmuBtn) halfScreenDanmuBtn.classList.add('active');
            addSystemMessage('弹幕显示区域设置为半屏');
            break;
        case 'third':
            danmuContainer.classList.add('danmu-thirdscreen');
            if (thirdScreenDanmuBtn) thirdScreenDanmuBtn.classList.add('active');
            addSystemMessage('弹幕显示区域设置为1/3屏');
            break;
        default: // full
            danmuContainer.classList.add('danmu-fullscreen');
            if (fullScreenDanmuBtn) fullScreenDanmuBtn.classList.add('active');
            addSystemMessage('弹幕显示区域设置为全屏');
    }
    
    // 重新初始化 Danmaku 实例以适应新的尺寸
    if (danmaku) {
        setTimeout(() => {
            danmaku.resize();
        }, 100);
    }
    
    // 清空当前弹幕
    if (danmaku) {
        danmaku.clear();
    } else if (danmuContainer) {
        danmuContainer.innerHTML = '';
    }
}

// 添加显示/隐藏设置函数
function toggleAdminSettings(show) {
    if (!adminSettings || adminSettings.length === 0) return;
    
    adminSettings.forEach(setting => {
        if (show) {
            setting.style.display = 'block';
        } else {
            setting.style.display = 'none';
        }
    });
    
    if (show) {
        adminPasswordSetBtn.textContent = '关闭设置';
        addSystemMessage('管理员密码验证成功，设置已打开');
        adminSettingsOpen = true;
    } else {
        adminPasswordSetBtn.textContent = '打开设置';
        addSystemMessage('设置已关闭');
        adminSettingsOpen = false;
    }
}
// 设置Socket.io监听
function setupSocketListeners() {
    if (!socket) return;
    // 监听密码验证结果
    socket.on('admin-password-result', (result) => {
        if (result.success) {
            toggleAdminSettings(true); // 打开设置
        } else {
            addSystemMessage('管理员密码错误');
        }
    });
    socket.on('connect', () => {
        if (connectionStatus) {
            forwarderConnectionStatus.textContent = '已连接';
            forwarderConnectionStatus.style.color = '#4ade80';
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
        streamUrlInput.value = streamUrl;
    });
    socket.on('disconnect', () => {
        if (connectionStatus) {
            forwarderConnectionStatus.textContent = '已断开';
            forwarderConnectionStatus.style.color = '#f87171';
            connectionStatus.textContent = '未知';
            connectionStatus.style.color = '#f87171';
        }
        addSystemMessage('与转发服务器断开连接');
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
            connectionStatus.textContent = '已连接'
            connectionStatus.style.color = '#4ade80';
        }else{
            barrageflyWsSetBtn.textContent = '连接';
            connectionStatus.textContent = '已断开'
            connectionStatus.style.color = '#f87171';
        }
    });
    
    socket.on('system-message', (msg) => {
        addSystemMessage('系统消息: ' + JSON.stringify(msg));
    });
    
    socket.on('error', (error) => {
        console.error('Socket错误:', error);
        addSystemMessage('连接发生错误');
    });
    socket.on('close-barrage-fly-ws', () => {
        barrageflyWsSetBtn.textContent = '断开';
    });
}

function updateSubscriptionList(taskIds) {
    if (!taskIdList) return;
    
    // 清空当前任务ID列表和备注映射
    config.currentTaskIds = [];
    config.remarkMap = {};
    
    // 清空UI列表
    taskIdList.innerHTML = '';
    
    // 更新任务ID列表和备注映射
    taskIds.forEach(taskId => {
        if (!config.currentTaskIds.includes(taskId)) {
            addTaskIdToList(taskId);
            config.currentTaskIds.push(taskId);
            
            // 更新备注映射
            const roomId = extractRoomId(taskId);
            const remark = extractRemark(taskId);
            if (roomId && remark) {
                config.remarkMap[roomId] = remark;
            }
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
// 显示弹幕
function displayDanmu(roomId, platform, msgDto) {
    if (!danmuVisible) return;
    
    danmuCount++;
    updateCounters();
    
    // 获取平台标签
    const platformLabel = getPlatformLabel(platform);
    
    // 获取备注信息
    const remark = config.remarkMap[roomId] || '';
    
    // 使用Danmaku库显示弹幕
    if (danmaku) {
        // 创建外层容器
        const containerElement = document.createElement('div');
        containerElement.style.cssText = `
            display: inline-block;
            border-radius: 50px;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            overflow: hidden;
        `;
        
        // 创建内层内容容器
        const danmuElement = document.createElement('div');
        danmuElement.style.cssText = `
            font-size: ${fontSize}px;
            opacity: ${danmuOpacity};
            color: #ffffff;
            padding: 4px 12px;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        
        // 添加平台标签 - 修改为圆角
        if (platformLabel) {
            const platformSpan = document.createElement('span');
            platformSpan.className = 'platform-label';
            platformSpan.style.cssText = `
                background: ${platformLabel.color};
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.7em;
                font-weight: bold;
                line-height: 1;
            `;
            platformSpan.textContent = platformLabel.text;
            danmuElement.appendChild(platformSpan);
        }
        
        // 添加备注（如果有）- 也修改为圆角保持一致性
        if (remark) {
            const remarkSpan = document.createElement('span');
            remarkSpan.className = 'remark-label';
            remarkSpan.style.cssText = `
                background: #1a1a2e;
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 0.7em;
                font-weight: bold;
                line-height: 1;
            `;
            remarkSpan.textContent = remark;
            danmuElement.appendChild(remarkSpan);
        }
        
        // 添加内容
        const contentSpan = document.createElement('span');
        contentSpan.className = 'content';
        contentSpan.textContent = msgDto.content;
        contentSpan.style.color = '#ffffff';
        danmuElement.appendChild(contentSpan);
        
        // 组装元素
        containerElement.appendChild(danmuElement);
        
        // 使用自定义渲染
        danmaku.emit({
            text: '',
            render: () => containerElement
        });
    }
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
    if (!danmuVisible) return;
    
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
    
    // 使用Danmaku库显示礼物弹幕
    if (danmaku) {
        danmaku.emit({
            text: content,
            style: {
                fontSize: `${fontSize}px`,
                opacity: danmuOpacity,
                color: '#ffcc00',
                borderLeft: '3px solid #ff8a00',
                padding: '4px 12px',
                borderRadius: '16px',
                background: 'rgba(255, 138, 0, 0.3)',
                backdropFilter: 'blur(4px)'
            }
        });
    }
}
// 添加消息到日志
function addMessageLog(roomId, platform, type, msgDto) {
    if (!messageLog) return;
    
    const messageElement = document.createElement('div');
    
    // 获取备注信息
    const remark = config.remarkMap[roomId] || '';
    let remarkText = remark ? `[${remark}] ` : '';
    
    let content = `[房间 ${roomId}] ${remarkText}`;
    
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