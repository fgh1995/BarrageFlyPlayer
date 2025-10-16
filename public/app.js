// 配置信息
const config = {
    url: "ws://localhost:9898",
    currentTaskIds: [], // 当前管理的任务ID
    remarkMap: {} // 存储 roomId -> 备注 的映射关系
};
// 滚动控制变量
let autoScrollEnabled = true;
let userScrolling = false;
let scrollTimeout = null;
let newMessageIndicator = null;
let pendingMessages = []; // 存储待显示的消息
// 状态变量
let danmuCount = 0;
let messageCount = 0;
let danmuSpeed = 150; // px/s
let danmuOpacity = 0.8;
let fontSize = 20;
let danmuVisible = true;
let adminSettingsOpen = false;
let currentLogTab = 'all'; // 当前日志标签页
let errorMessageCount = 0;
// 悬浮日志相关变量
let floatingLog = null;
let floatingLogContent = null;
let isFloatingLogVisible = false;
let isFloatingLogMinimized = false;
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
let clearBtn, clearLogBtn, toggleDanmuBtn, playBtn, pauseBtn, streamUrlInput, trackCountElement,removeTaskBtn;

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
    initializeLogTabs(); // 初始化日志标签页
    initializeScrollBehavior(); // 初始化滚动行为
    initializeFloatingLog();// 新增：初始化悬浮日志
}
// 初始化多播放器功能
function initializeMultiPlayers() {
    setupPlayerEventListeners();
    loadPlayersFromStorage();
}
// 初始化滚动功能
// 修改 initializeScrollBehavior 函数
function initializeScrollBehavior() {
    const allLog = document.getElementById('message-log-all');
    const errorLog = document.getElementById('message-log-error');
    const danmuLog = document.getElementById('message-log-danmu');
    
    [allLog, errorLog, danmuLog].forEach(log => {
        if (log) {
            setupScrollBehavior(log);
        }
    });
    
    // 创建新消息指示器
    createNewMessageIndicator();
    
    // 监听标签页切换
    document.querySelectorAll('.log-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // 切换标签页时重置滚动状态
            setTimeout(() => {
                const activeLog = getActiveLogElement();
                if (activeLog && isScrollAtBottom(activeLog)) {
                    autoScrollEnabled = true;
                    userScrolling = false;
                    hideNewMessageIndicator();
                }
            }, 100);
        });
    });
}
// 设置滚动行为
function setupScrollBehavior(logElement) {
    if (!logElement) return;
    
    logElement.addEventListener('scroll', () => {
        // 检查用户是否在手动滚动
        const isAtBottom = isScrollAtBottom(logElement);
        
        if (!isAtBottom) {
            // 用户向上滚动，禁用自动滚动
            userScrolling = true;
            autoScrollEnabled = false;
            
            // 如果有待处理消息，显示指示器
            if (pendingMessages.length > 0) {
                showNewMessageIndicator();
            } else {
                hideNewMessageIndicator();
            }
        } else {
            // 用户滚动到底部，重新启用自动滚动
            userScrolling = false;
            autoScrollEnabled = true;
            
            // 如果有待处理消息，立即处理它们
            if (pendingMessages.length > 0) {
                processPendingMessages();
            }
            hideNewMessageIndicator();
        }
        
        // 清除之前的超时
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        // 设置超时，如果用户停止滚动一段时间，重新检查是否在底部
        scrollTimeout = setTimeout(() => {
            if (isScrollAtBottom(logElement)) {
                userScrolling = false;
                autoScrollEnabled = true;
                
                // 处理待处理消息
                if (pendingMessages.length > 0) {
                    processPendingMessages();
                }
                hideNewMessageIndicator();
            }
        }, 500);
    });
}

// 检查是否滚动到底部
function isScrollAtBottom(element) {
    const threshold = 10; // 像素阈值，允许一定的误差
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

// 滚动到底部
function scrollToBottom(logElement) {
    if (!logElement) return;
    
    logElement.scrollTop = logElement.scrollHeight;
}

// 智能滚动
// 修改智能滚动函数
function smartScroll(logElement) {
    if (!logElement) return;
    
    if (autoScrollEnabled && !userScrolling) {
        // 自动滚动到底部
        scrollToBottom(logElement);
        hideNewMessageIndicator();
    } else if (pendingMessages.length > 0) {
        // 显示新消息指示器
        showNewMessageIndicator();
    }
}

// 创建新消息指示器
// 修改新消息指示器的点击事件
function createNewMessageIndicator() {
    const allLog = document.getElementById('message-log-all');
    if (!allLog) return;
    
    // 创建指示器
    newMessageIndicator = document.createElement('div');
    newMessageIndicator.className = 'new-message-indicator';
    newMessageIndicator.innerHTML = `
        <span>${pendingMessages.length} 条新消息</span>
        <i class="fas fa-arrow-down"></i>
    `;
    newMessageIndicator.style.cssText = `
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary-color);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        display: none;
        align-items: center;
        gap: 8px;
        font-size: 0.9rem;
        z-index: 10;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
    `;
    
    newMessageIndicator.addEventListener('click', () => {
        // 点击指示器，处理所有待处理消息并滚动到底部
        processPendingMessages();
        autoScrollEnabled = true;
        userScrolling = false;
    });
    
    newMessageIndicator.addEventListener('mouseenter', () => {
        newMessageIndicator.style.transform = 'translateX(-50%) scale(1.05)';
    });
    
    newMessageIndicator.addEventListener('mouseleave', () => {
        newMessageIndicator.style.transform = 'translateX(-50%) scale(1)';
    });
    
    // 添加到日志容器
    const logContainer = allLog.parentElement;
    if (logContainer) {
        logContainer.style.position = 'relative';
        logContainer.appendChild(newMessageIndicator);
    }
}

// 显示新消息指示器
function showNewMessageIndicator() {
    if (newMessageIndicator && !autoScrollEnabled) {
        // 更新指示器文本显示消息数量
        newMessageIndicator.innerHTML = `
            <span>${pendingMessages.length} 条新消息</span>
            <i class="fas fa-arrow-down"></i>
        `;
        newMessageIndicator.style.display = 'flex';
    }
}

// 隐藏新消息指示器
function hideNewMessageIndicator() {
    if (newMessageIndicator) {
        newMessageIndicator.style.display = 'none';
    }
}

// 获取当前活动的日志元素
function getActiveLogElement() {
    const activeLog = document.querySelector('.message-log.active');
    return activeLog;
}
// 处理待处理的消息
function processPendingMessages() {
    if (pendingMessages.length === 0) return;
    
    const allLog = document.getElementById('message-log-all');
    const danmuLog = document.getElementById('message-log-danmu');
    const errorLog = document.getElementById('message-log-error');
    
    pendingMessages.forEach(messageData => {
        switch (messageData.type) {
            case 'system':
                appendMessageToLogs(messageData);
                break;
            case 'danmu':
                appendDanmuMessageToLog(messageData);
                break;
            default:
                appendMessageToAllLog(messageData);
                break;
        }
    });
    
    // 清空待处理队列
    pendingMessages = [];
    
    // 滚动到底部
    const activeLog = getActiveLogElement();
    if (activeLog) {
        scrollToBottom(activeLog);
    }
    
    hideNewMessageIndicator();
}
// 弹幕对象池
const danmakuPool = {
    elements: [],
    getElement: function() {
        if (this.elements.length > 0) {
            return this.elements.pop();
        }
        return this.createElement();
    },
    createElement: function() {
        const container = document.createElement('div');
        container.style.cssText = `
            display: inline-block;
            border-radius: 50px;
            background: rgba(0, 0, 0, 0.6);
            overflow: hidden;
            will-change: transform;
            contain: layout style paint;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            font-size: ${fontSize}px;
            opacity: ${danmuOpacity};
            color: #ffffff;
            padding: 4px 12px;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        
        container.appendChild(content);
        return { container, content };
    },
    returnElement: function(element) {
        element.container.style.display = 'none';
        this.elements.push(element);
    }
};

// 初始化Danmaku弹幕库
function initializeDanmaku() {
    if (!danmuContainer) return;
    
    try {
        danmaku = new Danmaku({
            container: danmuContainer,
            speed: danmuSpeed,
            opacity: danmuOpacity,
            fontSize: fontSize
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
function initializeLogTabs() {
    const logTabs = document.querySelectorAll('.log-tab');
    logTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchLogTab(tabName);
        });
    });
}

// 切换日志标签页
function switchLogTab(tabName) {
    currentLogTab = tabName;
    
    // 更新标签页按钮状态
    document.querySelectorAll('.log-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`.log-tab[data-tab="${tabName}"]`).classList.add('active');
    
    // 显示对应的日志容器
    document.querySelectorAll('.message-log').forEach(log => {
        log.classList.remove('active');
    });
    document.getElementById(`message-log-${tabName}`).classList.add('active');
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
            autoplay: true
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
            autoplay: true,
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
        setTimeout(() => {
            const streamUrlInput = document.getElementById('stream-url');
            if (streamUrlInput && streamUrlInput.value.trim()) {
                const password = document.getElementById('admin-password-input') ? 
                    document.getElementById('admin-password-input').value.trim() : '';
                playStream(streamUrlInput.value.trim(), password);
            }
        }, 1000);
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
    // 悬浮日志按钮
    const toggleFloatingLogBtn = document.getElementById('toggle-floating-log');
    if (toggleFloatingLogBtn) {
        toggleFloatingLogBtn.addEventListener('click', toggleFloatingLog);
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
            socket.emit('open_setting', password);
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
                    showErrorToast('请输入BarrageFly-WS通信地址');
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
        if (currentLogTab === 'all') {
            // 清空所有日志
            if (document.getElementById('message-log-all')) {
                document.getElementById('message-log-all').innerHTML = '';
            }
            if (document.getElementById('message-log-error')) {
                document.getElementById('message-log-error').innerHTML = '';
            }
            messageCount = 0;
            errorMessageCount = 0;
        } else {
            // 只清空错误日志
            if (document.getElementById('message-log-error')) {
                document.getElementById('message-log-error').innerHTML = '';
            }
            errorMessageCount = 0;
        }
        
        // 清空待处理消息
        pendingMessages = [];
        hideNewMessageIndicator();
        
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
    if (!dp) {
        addSystemMessage('播放器未初始化');
        return;
    }
    
    try {
        // 先设置流地址到服务器
        if (socket) {
            socket.emit('set-stream-url', streamUrl, password);
        }
        
        // 立即切换视频源
        dp.switchVideo({
            url: streamUrl,
            type: 'auto'
        });
        
        // 尝试播放 - 使用 try-catch 而不是 .catch()
        setTimeout(() => {
            try {
                dp.play();
            } catch (error) {
                console.error('自动播放失败:', error);
                // 不显示错误，因为可能是浏览器自动播放策略限制
            }
        }, 500);
        
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
    socket.on('channel-log', (log) => {
        if (!log || !log.level || !log.message) return;
        
        if (log.level === 'ERROR') {
            try {
                const msg = JSON.parse(log.message);
                
                // 检查是否为特定的"任务不存在"错误
                if (msg.data && msg.data.message && 
                    msg.data.message.includes("the task [") && 
                    msg.data.message.includes("] don't have contexts yet")) {
                    
                    // 提取任务ID
                    const taskIdMatch = msg.data.message.match(/the task \[(\d+)\]/);
                    if (taskIdMatch && taskIdMatch[1]) {
                        const taskId = taskIdMatch[1];
                        addErrorMessage(`任务 ${taskId} 不存在`);
                    } else {
                        addErrorMessage('任务不存在');
                    }
                } else {
                    // 其他错误，使用原消息
                    addErrorMessage(log.level + '|' + log.message);
                }
            } catch (error) {
                // 如果JSON解析失败，使用原消息
                addErrorMessage(log.level + '|' + log.message);
            }
        } else if (log.level === 'SUCCESS') {
            showSuccessToast(log.message, 2000);
        } else {
            addSystemMessage(log.level + '|' + log.message);
        }
    });

    socket.on('current-barrage-fly-ws-connect', (newisBarrageFlyWSConnect,barrageFlyWSUrl) => {
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
    
    socket.on('system-message', (data) => {
        if (data.type && data.level && data.text) {
            // 根据类型处理消息
            if (data.type === 'toast') {
                // 使用对应的 Toast 函数
                switch(data.level) {
                    case 'success':
                        showSuccessToast(data.text);
                        break;
                    case 'error':
                        showErrorToast(data.text);
                        break;
                    case 'warning':
                        showWarningToast(data.text);
                        break;
                    case 'info':
                    default:
                        showInfoToast(data.text);
                        break;
                }
            } else if (data.type === 'log') {
                // 默认作为日志处理
                addSystemMessage(data.text, data.level === 'error');
            } else if (data.type === 'logAndtoast') {
                addSystemMessage(data.text, data.level === 'error');
                // 使用对应的 Toast 函数
                switch(data.level) {
                    case 'success':
                        showSuccessToast(data.text);
                        break;
                    case 'error':
                        showErrorToast(data.text);
                        break;
                    case 'warning':
                        showWarningToast(data.text);
                        break;
                    case 'info':
                    default:
                        showInfoToast(data.text);
                        break;
                }
            } else if(data.type === 'open_setting') {
                if (data.level === 'success') {
                    toggleAdminSettings(true); // 打开设置
                    showSuccessToast(data.text,1000);
                }
            } else {
                // 兼容旧格式
                addSystemMessage('系统消息: ' + JSON.stringify(data));
            }
        }
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
        if (!danmuVisible || !danmaku) return;
    
    danmuCount++;
    updateCounters();
    
    const platformLabel = getPlatformLabel(platform);
    const remark = config.remarkMap[roomId] || '';
    
    // 使用对象池获取元素
    const danmakuElement = danmakuPool.getElement();
    const { container, content } = danmakuElement;
    
    // 清空之前的内容
    content.innerHTML = '';
    
    // 添加平台标签
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
            flex-shrink: 0;
        `;
        platformSpan.textContent = platformLabel.text;
        content.appendChild(platformSpan);
    }
    
    // 添加备注
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
            flex-shrink: 0;
        `;
        remarkSpan.textContent = remark;
        content.appendChild(remarkSpan);
    }
    
    // 添加内容
    const contentSpan = document.createElement('span');
    contentSpan.className = 'content';
    contentSpan.textContent = msgDto.content;
    contentSpan.style.cssText = `
        color: #ffffff;
        flex-shrink: 0;
        white-space: nowrap;
    `;
    content.appendChild(contentSpan);
    
    // 显示容器
    container.style.display = 'inline-block';
    
    // 使用自定义渲染
    danmaku.emit({
        text: '',
        render: () => container,
        onFinish: () => {
            // 弹幕结束后回收到对象池
            setTimeout(() => {
                danmakuPool.returnElement(danmakuElement);
            }, 100);
        }
    });
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
// 修改 addMessageLog 函数
function addMessageLog(roomId, platform, type, msgDto) {
    const allLog = document.getElementById('message-log-all');
    const danmuLog = document.getElementById('message-log-danmu');
    
    if (!allLog || !danmuLog) return;
    
    // 获取备注信息
    const remark = config.remarkMap[roomId] || '';
    let remarkText = remark ? `[${remark}] ` : '';
    
    let content = ``;
    if (type === 'DANMU') {
        if (msgDto.badgeLevel && msgDto.badgeLevel !== 0) {
            content += `[${msgDto.badgeLevel}${msgDto.badgeName}] `;
        }
        content += `${msgDto.username}: ${msgDto.content}`;
        const messageData = {
            type: 'danmu',
            content: content,
            roomId: roomId,
            platform: platform,
            originalData: msgDto
        };
        
        if (autoScrollEnabled && !userScrolling) {
            // 直接添加到弹幕日志
            appendDanmuMessageToLog(messageData);
            smartScroll(danmuLog);
        } else {
            // 加入待处理队列
            pendingMessages.push(messageData);
            showNewMessageIndicator();
        }
        // 添加到悬浮日志（如果是弹幕消息）
        if (type === 'DANMU' && isFloatingLogVisible) {
            const messageData = {
                type: 'danmu',
                content: `${msgDto.username}: ${msgDto.content}`,
                roomId: roomId,
                platform: platform,
                remarkText: remarkText,
                originalData: msgDto
            };
            appendToFloatingLog(messageData);
        }
    }
    
    // 添加到所有日志（无论是否自动滚动）
    const messageDataAll = {
        type: type.toLowerCase(),
        content: content,
        roomId: roomId,
        platform: platform,
        originalData: msgDto
    };
    
    if (autoScrollEnabled && !userScrolling) {
        appendMessageToAllLog(messageDataAll);
        smartScroll(allLog);
    } else {
        // 对于所有日志也使用相同的逻辑
        if (!pendingMessages.some(msg => 
            msg.type === messageDataAll.type && 
            msg.content === messageDataAll.content
        )) {
            pendingMessages.push(messageDataAll);
            showNewMessageIndicator();
        }
    }
}

// 修改 addSystemMessage 函数
function addSystemMessage(text, isError = false) {
    const allLog = document.getElementById('message-log-all');
    const errorLog = document.getElementById('message-log-error');
    
    if (!allLog) return;
    
    const messageData = {
        type: 'system',
        text: text,
        isError: isError,
        timestamp: new Date().toLocaleTimeString()
    };
    
    if (autoScrollEnabled && !userScrolling) {
        // 如果自动滚动启用，直接添加消息
        appendMessageToLogs(messageData);
        smartScroll(allLog);
    } else {
        // 如果用户正在查看历史消息，将消息加入待处理队列
        pendingMessages.push(messageData);
        showNewMessageIndicator();
    }
    
    // 限制所有消息数量
    messageCount++;
    if (messageCount > 200) {
        // 从DOM中移除最旧的消息
        const firstMessage = allLog.firstChild;
        if (firstMessage) {
            allLog.removeChild(firstMessage);
            messageCount--;
        }
    }
}

// 将消息实际添加到日志的函数
function appendMessageToLogs(messageData) {
    const allLog = document.getElementById('message-log-all');
    const errorLog = document.getElementById('message-log-error');
    
    if (!allLog) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = messageData.isError ? 'message message-error' : 'message message-system';
    messageElement.textContent = `[系统] ${messageData.timestamp} - ${messageData.text}`;
    
    allLog.appendChild(messageElement);
    
    // 如果是错误消息，也添加到错误日志
    if (messageData.isError && errorLog) {
        const errorElement = messageElement.cloneNode(true);
        errorLog.appendChild(errorElement);
        errorMessageCount++;
        
        // 限制错误消息数量
        if (errorMessageCount > 200) {
            errorLog.removeChild(errorLog.firstChild);
            errorMessageCount--;
        }
    }
}
// 添加弹幕消息到弹幕日志
function appendDanmuMessageToLog(messageData) {
    const danmuLog = document.getElementById('message-log-danmu');
    if (!danmuLog) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message message-danmu';
    
    // 添加平台数据属性
    if (messageData.platform) {
        messageElement.setAttribute('data-platform', messageData.platform.toLowerCase());
    }
    
    // 构建带样式的弹幕内容
    const platformLabel = getPlatformLabel(messageData.platform);
    const remark = config.remarkMap[messageData.roomId] || '';
    
    let contentHTML = '';
    
    // 添加平台标签
    if (platformLabel) {
        contentHTML += `<span class="platform-label" style="background: ${platformLabel.color}; color: white; border-radius: 12px; padding: 2px 8px; font-size: 1.0em; font-weight: bold; margin-right: 6px; display: inline-block; line-height: 1;">平台：${platformLabel.text} 房间号：${messageData.roomId}${remark.trim() ? ` 备注：${remark}` : ''}</span> `;
    }
    // 添加弹幕内容
    contentHTML += `<span class="content">${messageData.content}</span>`;
    
    messageElement.innerHTML = contentHTML;
    danmuLog.appendChild(messageElement);
    
    // 限制弹幕日志数量
    const danmuMessages = danmuLog.querySelectorAll('.message');
    if (danmuMessages.length > 200) {
        danmuLog.removeChild(danmuMessages[0]);
    }
}
// 添加消息到所有日志
function appendMessageToAllLog(messageData) {
    const allLog = document.getElementById('message-log-all');
    if (!allLog) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${messageData.type}`;
    messageElement.textContent = messageData.content;
    
    allLog.appendChild(messageElement);
}
// 新增 Toast 消息函数 - 居中显示
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const toastId = 'toast-' + Date.now();
    toast.id = toastId;
    
    // 使用 Font Awesome 图标的版本
    const typeConfigs = {
        'success': {
            title: '成功',
            icon: '<i class="fas fa-check-circle"></i>'
        },
        'error': {
            title: '错误', 
            icon: '<i class="fas fa-exclamation-circle"></i>'
        },
        'warning': {
            title: '警告',
            icon: '<i class="fas fa-exclamation-triangle"></i>'
        },
        'info': {
            title: '信息',
            icon: '<i class="fas fa-info-circle"></i>'
        }
    };
    
    const config = typeConfigs[type] || typeConfigs.info;
    
    toast.innerHTML = `
        <div class="toast-header">
            <span class="toast-icon">${config.icon}</span>
            <span class="toast-title">${config.title}</span>
            <button class="toast-close" onclick="removeToast('${toastId}')">×</button>
        </div>
        <div class="toast-message">${message}</div>
        ${duration > 0 ? `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>` : ''}
    `;
    
    toastContainer.appendChild(toast);
    
    // 添加弹出动画
    setTimeout(() => {
        toast.classList.add('pop-in');
    }, 10);
    
    // 自动移除
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toastId);
        }, duration);
    }
    
    return toastId;
}

// 移除 Toast 消息
function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
        toast.classList.remove('pop-in');
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
}

// 添加一些便捷的 Toast 函数
function showSuccessToast(message, duration = 3000) {
    return showToast(message, 'success', duration);
}

function showErrorToast(message, duration = 5000) {
    return showToast(message, 'error', duration);
}

function showWarningToast(message, duration = 4000) {
    return showToast(message, 'warning', duration);
}

function showInfoToast(message, duration = 3000) {
    return showToast(message, 'info', duration);
}

// 修改错误消息函数，使用新的 Toast
function addErrorMessage(text) {
    addSystemMessage(text, true);
    // 同时显示居中的 Toast 提醒
    showErrorToast(text, 5000);
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
// 初始化悬浮日志
function initializeFloatingLog() {
    floatingLog = document.getElementById('floating-danmu-log');
    floatingLogContent = document.getElementById('floating-log-content');
    
    if (!floatingLog || !floatingLogContent) return;
    
    // 设置拖拽功能
    setupFloatingLogDrag();
    
    // 设置大小调整功能
    setupFloatingLogResize();
    
    // 设置事件监听
    setupFloatingLogEvents();
    
    // 从本地存储恢复状态
    loadFloatingLogState();
}

// 设置悬浮日志拖拽功能
function setupFloatingLogDrag() {
    const header = document.getElementById('floating-log-header');
    if (!header || !floatingLog) return;
    
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.floating-log-controls')) return;
        
        isDragging = true;
        const rect = floatingLog.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        
        floatingLog.style.transition = 'none';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        
        // 限制在窗口范围内
        const maxX = window.innerWidth - floatingLog.offsetWidth;
        const maxY = window.innerHeight - floatingLog.offsetHeight;
        
        floatingLog.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        floatingLog.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            floatingLog.style.transition = '';
            document.body.style.userSelect = '';
            saveFloatingLogState();
        }
    });
}

// 设置悬浮日志事件
function setupFloatingLogEvents() {
    const closeBtn = document.getElementById('close-floating-log');
    const minimizeBtn = document.getElementById('minimize-floating-log');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeFloatingLog();
        });
    }
    
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            toggleFloatingLogMinimize();
        });
    }
}

// 切换悬浮日志显示/隐藏
function toggleFloatingLog() {
    if (!floatingLog) return;
    
    if (isFloatingLogVisible) {
        closeFloatingLog();
    } else {
        openFloatingLog();
    }
}

// 打开悬浮日志
// 打开悬浮日志
function openFloatingLog() {
    if (!floatingLog) return;
    
    floatingLog.classList.add('active');
    isFloatingLogVisible = true;
    
    // 设置默认尺寸（如果之前没有保存过）
    if (!floatingLog.style.width || !floatingLog.style.height) {
        floatingLog.style.width = '400px';
        floatingLog.style.height = '500px';
    }
    
    // 标记原生日志容器
    const logContainer = document.querySelector('.message-log-container');
    if (logContainer) {
        logContainer.classList.add('floating');
    }
    
    saveFloatingLogState();
    updateFloatingButtonText();
}

// 关闭悬浮日志
function closeFloatingLog() {
    if (!floatingLog) return;
    
    floatingLog.classList.remove('active');
    isFloatingLogVisible = false;
    isFloatingLogMinimized = false;
    
    // 恢复原生日志容器
    const logContainer = document.querySelector('.message-log-container');
    if (logContainer) {
        logContainer.classList.remove('floating');
    }
    
    saveFloatingLogState();
    updateFloatingButtonText();
}

// 修改切换悬浮日志最小化的函数
function toggleFloatingLogMinimize() {
    if (!floatingLog) return;
    
    isFloatingLogMinimized = !isFloatingLogMinimized;
    
    if (isFloatingLogMinimized) {
        floatingLog.classList.add('minimized');
        floatingLogContent.style.display = 'none';
    } else {
        floatingLog.classList.remove('minimized');
        floatingLogContent.style.display = 'block';
    }
    
    saveFloatingLogState();
}

// 添加消息到悬浮日志
function appendToFloatingLog(messageData) {
    if (!floatingLogContent || !isFloatingLogVisible) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${messageData.type}`;
    
    // 只为弹幕消息添加平台样式
    if (messageData.type === 'danmu' && messageData.platform) {
        messageElement.setAttribute('data-platform', messageData.platform.toLowerCase());
        
        const platformLabel = getPlatformLabel(messageData.platform);
        const remark = config.remarkMap[messageData.roomId] || '';
        
        let contentHTML = '';
        
        if (platformLabel) {
            contentHTML += `<span class="platform-label" style="background: ${platformLabel.color}">${platformLabel.text} ${remark}</span> `;
        }

        contentHTML += `<span class="content">${messageData.content || messageData.text}</span>`;
        messageElement.innerHTML = contentHTML;
    } else {
        messageElement.textContent = messageData.content || messageData.text;
    }
    
    floatingLogContent.appendChild(messageElement);
    
    // 自动滚动到底部
    if (!isFloatingLogMinimized) {
        floatingLogContent.scrollTop = floatingLogContent.scrollHeight;
    }
    
    // 限制消息数量
    const messages = floatingLogContent.querySelectorAll('.message');
    if (messages.length > 200) {
        floatingLogContent.removeChild(messages[0]);
    }
}

// 保存悬浮日志状态到本地存储
function saveFloatingLogState() {
    if (!floatingLog) return;
    
    const state = {
        visible: isFloatingLogVisible,
        minimized: isFloatingLogMinimized,
        position: {
            left: floatingLog.style.left,
            top: floatingLog.style.top
        },
        size: {
            width: floatingLog.style.width,
            height: floatingLog.style.height
        }
    };
    
    localStorage.setItem('floatingLogState', JSON.stringify(state));
}
// 从本地存储加载悬浮日志状态
// 修改加载悬浮日志状态的函数
function loadFloatingLogState() {
    const savedState = localStorage.getItem('floatingLogState');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            
            if (state.visible) {
                openFloatingLog();
                
                if (state.position && state.position.left && state.position.top) {
                    floatingLog.style.left = state.position.left;
                    floatingLog.style.top = state.position.top;
                }
                
                if (state.size && state.size.width && state.size.height) {
                    floatingLog.style.width = state.size.width;
                    floatingLog.style.height = state.size.height;
                }
                
                if (state.minimized) {
                    toggleFloatingLogMinimize();
                }
            }
        } catch (error) {
            console.error('加载悬浮日志状态失败:', error);
        }
    }
}
// 更新悬浮按钮文本
function updateFloatingButtonText() {
    const toggleFloatingLogBtn = document.getElementById('toggle-floating-log');
    if (toggleFloatingLogBtn) {
        if (isFloatingLogVisible) {
            toggleFloatingLogBtn.textContent = '📢 还原显示';
            toggleFloatingLogBtn.title = '还原到原生日志区域';
        } else {
            toggleFloatingLogBtn.textContent = '📢 悬浮显示';
            toggleFloatingLogBtn.title = '悬浮显示弹幕日志';
        }
    }
}
// 设置悬浮日志大小调整功能
function setupFloatingLogResize() {
    const floatingLog = document.getElementById('floating-danmu-log');
    if (!floatingLog) return;

    const resizeRight = floatingLog.querySelector('.floating-log-resize-right');
    const resizeBottom = floatingLog.querySelector('.floating-log-resize-bottom');
    const resizeBottomRight = floatingLog.querySelector('.floating-log-resize-bottom-right');

    let isResizing = false;
    let resizeDirection = '';
    let startX, startY, startWidth, startHeight;

    function startResize(e, direction) {
        e.preventDefault();
        isResizing = true;
        resizeDirection = direction;
        
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(floatingLog).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(floatingLog).height, 10);
        
        floatingLog.style.transition = 'none';
        document.body.style.userSelect = 'none';
        
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    }

    function handleResize(e) {
        if (!isResizing) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;

        if (resizeDirection.includes('right')) {
            newWidth = startWidth + dx;
        }
        
        if (resizeDirection.includes('bottom')) {
            newHeight = startHeight + dy;
        }

        // 应用尺寸限制
        newWidth = Math.max(300, Math.min(newWidth, window.innerWidth * 2.0));
        newHeight = Math.max(200, Math.min(newHeight, window.innerHeight * 2.0));

        floatingLog.style.width = newWidth + 'px';
        floatingLog.style.height = newHeight + 'px';
    }

    function stopResize() {
        isResizing = false;
        floatingLog.style.transition = '';
        document.body.style.userSelect = '';
        
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        
        // 保存调整后的尺寸
        saveFloatingLogState();
    }

    // 绑定事件
    if (resizeRight) {
        resizeRight.addEventListener('mousedown', (e) => startResize(e, 'right'));
    }
    
    if (resizeBottom) {
        resizeBottom.addEventListener('mousedown', (e) => startResize(e, 'bottom'));
    }
    
    if (resizeBottomRight) {
        resizeBottomRight.addEventListener('mousedown', (e) => startResize(e, 'bottom-right'));
    }
}
// 初始化应用
window.addEventListener('load', () => {
    init();
    setupKeyboardShortcuts();
    addSystemMessage('系统初始化完成');
});